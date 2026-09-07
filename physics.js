import * as THREE from 'three'
import { findPart } from './parts.js'

const RAPIER_CDN = 'https://cdn.skypack.dev/@dimforge/rapier3d-compat@0.20.0'
let rapierPromise = null

async function loadRapier() {
  if (!rapierPromise) {
    rapierPromise = import(RAPIER_CDN).then(async module => {
      const RAPIER = module.default ?? module
      await RAPIER.init()
      return RAPIER
    })
  }
  return rapierPromise
}

function vector3(value) {
  return { x: value.x, y: value.y, z: value.z }
}

function quaternion(value) {
  return { x: value.x, y: value.y, z: value.z, w: value.w }
}

function localBounds(object) {
  const clone = object.clone(true)
  clone.position.set(0, 0, 0)
  clone.quaternion.identity()
  clone.scale.set(1, 1, 1)
  clone.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(clone)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  size.x = Math.max(size.x, 0.12)
  size.y = Math.max(size.y, 0.12)
  size.z = Math.max(size.z, 0.12)

  return { size, center }
}

function connectorFor(object, connectorId) {
  return findPart(object?.userData.partId)?.connectors?.find(connector => connector.id === connectorId) ?? null
}

function localFramePreservingCurrentRotation(objectA, objectB) {
  const qa = objectA.getWorldQuaternion(new THREE.Quaternion())
  const qb = objectB.getWorldQuaternion(new THREE.Quaternion())
  const frameA = new THREE.Quaternion()
  const frameB = qb.clone().invert().multiply(qa)
  return { frameA, frameB }
}

export class PhysicsSession {
  static async create(objects, connections) {
    const RAPIER = await loadRapier()
    const session = new PhysicsSession(RAPIER, objects, connections)
    session.build()
    return session
  }

  constructor(RAPIER, objects, connections) {
    this.RAPIER = RAPIER
    this.objects = objects
    this.connections = connections
    this.world = null
    this.bodies = new Map()
    this.running = true
    this.jointCount = 0
    this.failedJointCount = 0
  }

  build() {
    const RAPIER = this.RAPIER
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.world.timestep = 1 / 60

    const ground = RAPIER.ColliderDesc.cuboid(40, 0.12, 40)
      .setTranslation(0, -0.12, 0)
      .setFriction(1.0)
      .setRestitution(0.02)
    this.world.createCollider(ground)

    for (const object of this.objects) {
      object.updateWorldMatrix(true, false)
      const position = object.getWorldPosition(new THREE.Vector3())
      const rotation = object.getWorldQuaternion(new THREE.Quaternion())
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(quaternion(rotation))
      const body = this.world.createRigidBody(bodyDesc)

      const { size, center } = localBounds(object)
      const colliderDesc = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
        .setTranslation(center.x, center.y, center.z)
        .setFriction(0.85)
        .setRestitution(0.03)
        .setDensity(0.7)

      this.world.createCollider(colliderDesc, body)
      this.bodies.set(object.userData.instanceId, { body, object })
    }

    for (const connection of this.connections) {
      this.createJoint(connection)
    }
  }

  createJoint(connection) {
    const RAPIER = this.RAPIER
    const entryA = this.bodies.get(connection.a.instanceId)
    const entryB = this.bodies.get(connection.b.instanceId)
    if (!entryA || !entryB) return

    const connectorA = connectorFor(entryA.object, connection.a.connectorId)
    const connectorB = connectorFor(entryB.object, connection.b.connectorId)
    if (!connectorA || !connectorB) return

    try {
      let params = null

      if (connection.kind === 'fixed') {
        const { frameA, frameB } = localFramePreservingCurrentRotation(entryA.object, entryB.object)
        params = RAPIER.JointData.fixed(
          { x: connectorA.position[0], y: connectorA.position[1], z: connectorA.position[2] },
          quaternion(frameA),
          { x: connectorB.position[0], y: connectorB.position[1], z: connectorB.position[2] },
          quaternion(frameB),
        )
      } else if (connection.kind === 'hinge' || connection.kind === 'axle') {
        const axis = new THREE.Vector3(...connectorA.axis).normalize()
        params = RAPIER.JointData.revolute(
          { x: connectorA.position[0], y: connectorA.position[1], z: connectorA.position[2] },
          { x: connectorB.position[0], y: connectorB.position[1], z: connectorB.position[2] },
          vector3(axis),
        )
      }

      if (!params) return
      this.world.createImpulseJoint(params, entryA.body, entryB.body, true)
      this.jointCount += 1
    } catch (error) {
      this.failedJointCount += 1
      console.warn('BrickLab could not create physics joint', connection, error)
    }
  }

  step() {
    if (!this.world || !this.running) return
    this.world.step()
    this.syncObjects()
  }

  syncObjects() {
    for (const { body, object } of this.bodies.values()) {
      const translation = body.translation()
      const rotation = body.rotation()
      const worldPosition = new THREE.Vector3(translation.x, translation.y, translation.z)
      const worldQuaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)

      if (!object.parent) {
        object.position.copy(worldPosition)
        object.quaternion.copy(worldQuaternion)
        continue
      }

      object.parent.updateWorldMatrix(true, false)
      const parentWorldQuaternion = object.parent.getWorldQuaternion(new THREE.Quaternion())
      object.position.copy(object.parent.worldToLocal(worldPosition.clone()))
      object.quaternion.copy(parentWorldQuaternion.invert().multiply(worldQuaternion))
    }
  }

  setRunning(running) {
    this.running = Boolean(running)
  }

  dispose() {
    try {
      this.world?.free?.()
    } catch (error) {
      console.warn('Could not free Rapier world', error)
    }
    this.world = null
    this.bodies.clear()
  }

  get stats() {
    return {
      bodies: this.bodies.size,
      joints: this.jointCount,
      failedJoints: this.failedJointCount,
    }
  }
}
