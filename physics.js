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

function localColliderSpecs(object) {
  const definition = findPart(object?.userData.partId)
  const wheel = definition?.mechanics?.wheel
  if (wheel) {
    return [{
      shape: 'cylinder',
      halfHeight: 0.34,
      radius: wheel.radius,
      center: new THREE.Vector3(0, 1.15, 0),
      rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)),
    }]
  }

  const gear = definition?.mechanics?.gear
  if (gear) {
    return [{
      shape: 'cylinder',
      halfHeight: 0.18,
      radius: Math.max(0.65, gear.teeth * 0.045) * 1.12,
      center: new THREE.Vector3(0, 0.4, 0),
      rotation: new THREE.Quaternion(),
    }]
  }

  const { size, center } = localBounds(object)
  return [{ shape: 'cuboid', size, center, rotation: new THREE.Quaternion() }]
}

function createColliderDescriptor(RAPIER, spec, relativeMatrix, relativeRotation, relativeScale) {
  const center = spec.center.clone().applyMatrix4(relativeMatrix)
  const rotation = relativeRotation.clone().multiply(spec.rotation)
  let collider

  if (spec.shape === 'cylinder') {
    const radialScale = Math.max(Math.abs(relativeScale.x), Math.abs(relativeScale.z))
    collider = RAPIER.ColliderDesc.cylinder(
      spec.halfHeight * Math.abs(relativeScale.y),
      spec.radius * radialScale,
    )
  } else {
    collider = RAPIER.ColliderDesc.cuboid(
      spec.size.x * Math.abs(relativeScale.x) / 2,
      spec.size.y * Math.abs(relativeScale.y) / 2,
      spec.size.z * Math.abs(relativeScale.z) / 2,
    )
  }

  return collider
    .setTranslation(center.x, center.y, center.z)
    .setRotation(quaternion(rotation))
    .setFriction(0.9)
    .setRestitution(0.03)
    .setDensity(0.7)
}

function buildFixedComponents(objects, connections) {
  const byId = new Map(objects.map(object => [object.userData.instanceId, object]))
  const parent = new Map([...byId.keys()].map(id => [id, id]))

  const find = id => {
    let root = parent.get(id)
    if (!root) return null
    while (root !== parent.get(root)) root = parent.get(root)
    let cursor = id
    while (cursor !== root) {
      const next = parent.get(cursor)
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }

  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (!rootA || !rootB || rootA === rootB) return
    parent.set(rootB, rootA)
  }

  for (const connection of connections) {
    if (connection.kind !== 'fixed') continue
    if (!byId.has(connection.a.instanceId) || !byId.has(connection.b.instanceId)) continue
    union(connection.a.instanceId, connection.b.instanceId)
  }

  const groups = new Map()
  for (const object of objects) {
    const root = find(object.userData.instanceId)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(object)
  }

  return [...groups.values()]
}

function matrixPose(matrix) {
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  matrix.decompose(position, rotation, scale)
  return { position, rotation, scale }
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
    this.members = new Map()
    this.components = []
    this.running = true
    this.jointCount = 0
    this.failedJointCount = 0
    this.internalJointCount = 0
    this.motorCount = 0
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

    const groups = buildFixedComponents(this.objects, this.connections)
    for (const objects of groups) this.createCompoundBody(objects)

    for (const connection of this.connections) {
      if (connection.kind === 'fixed') continue
      this.createJoint(connection)
    }
  }

  createCompoundBody(objects) {
    const RAPIER = this.RAPIER
    const rootObject = objects[0]
    if (!rootObject) return

    for (const object of objects) object.updateWorldMatrix(true, false)
    rootObject.updateWorldMatrix(true, false)

    const bodyWorldMatrix = rootObject.matrixWorld.clone()
    const bodyWorldInverse = bodyWorldMatrix.clone().invert()
    const { position: bodyPosition, rotation: bodyRotation } = matrixPose(bodyWorldMatrix)

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(bodyPosition.x, bodyPosition.y, bodyPosition.z)
      .setRotation(quaternion(bodyRotation))
    const body = this.world.createRigidBody(bodyDesc)

    const component = {
      id: rootObject.userData.instanceId,
      body,
      bodyWorldMatrix,
      bodyWorldInverse,
      bodyWorldRotation: bodyRotation.clone(),
      members: [],
    }

    for (const object of objects) {
      const relativeMatrix = bodyWorldInverse.clone().multiply(object.matrixWorld)
      const { rotation: relativeRotation, scale: relativeScale } = matrixPose(relativeMatrix)
      for (const spec of localColliderSpecs(object)) {
        const colliderDesc = createColliderDescriptor(RAPIER, spec, relativeMatrix, relativeRotation, relativeScale)
        this.world.createCollider(colliderDesc, body)
      }

      const member = { object, body, component, relativeMatrix }
      component.members.push(member)
      this.members.set(object.userData.instanceId, member)
    }

    this.components.push(component)
  }

  bodyLocalPoint(member, connector) {
    const worldPoint = new THREE.Vector3(...connector.position).applyMatrix4(member.object.matrixWorld)
    return worldPoint.applyMatrix4(member.component.bodyWorldInverse)
  }

  bodyLocalAxis(member, connector) {
    const objectWorldRotation = member.object.getWorldQuaternion(new THREE.Quaternion())
    const worldAxis = new THREE.Vector3(...connector.axis).normalize().applyQuaternion(objectWorldRotation)
    return worldAxis.applyQuaternion(member.component.bodyWorldRotation.clone().invert()).normalize()
  }

  createJoint(connection) {
    const RAPIER = this.RAPIER
    const memberA = this.members.get(connection.a.instanceId)
    const memberB = this.members.get(connection.b.instanceId)
    if (!memberA || !memberB) return

    if (memberA.body === memberB.body) {
      this.internalJointCount += 1
      return
    }

    const connectorA = connectorFor(memberA.object, connection.a.connectorId)
    const connectorB = connectorFor(memberB.object, connection.b.connectorId)
    if (!connectorA || !connectorB) return

    try {
      const anchorA = this.bodyLocalPoint(memberA, connectorA)
      const anchorB = this.bodyLocalPoint(memberB, connectorB)
      const axisA = this.bodyLocalAxis(memberA, connectorA)

      let params = null
      if (connection.kind === 'hinge' || connection.kind === 'axle') {
        params = RAPIER.JointData.revolute(vector3(anchorA), vector3(anchorB), vector3(axisA))
      }

      if (!params) return
      const joint = this.world.createImpulseJoint(params, memberA.body, memberB.body, true)
      joint.setContactsEnabled?.(false)
      this.configureMotor(connection, memberA, memberB, connectorA, connectorB, axisA, joint)
      this.jointCount += 1
    } catch (error) {
      this.failedJointCount += 1
      console.warn('BrickLab could not create physics joint', connection, error)
    }
  }

  configureMotor(connection, memberA, memberB, connectorA, connectorB, axisA, joint) {
    if (connection.kind !== 'axle' || !joint?.configureMotorVelocity) return

    const definitionA = findPart(memberA.object.userData.partId)
    const definitionB = findPart(memberB.object.userData.partId)
    const motorA = definitionA?.mechanics?.motor
    const motorB = definitionB?.mechanics?.motor

    let motor = null
    let motorMember = null
    let motorConnector = null
    let motorIsA = false

    if (motorA && connection.a.connectorId === motorA.connectorId) {
      motor = motorA
      motorMember = memberA
      motorConnector = connectorA
      motorIsA = true
    } else if (motorB && connection.b.connectorId === motorB.connectorId) {
      motor = motorB
      motorMember = memberB
      motorConnector = connectorB
    }

    if (!motor || !motorMember || !motorConnector) return

    const jointAxisWorld = axisA.clone().applyQuaternion(memberA.component.bodyWorldRotation).normalize()
    const motorObjectRotation = motorMember.object.getWorldQuaternion(new THREE.Quaternion())
    const motorAxisWorld = new THREE.Vector3(...motorConnector.axis).normalize().applyQuaternion(motorObjectRotation)
    const axisSign = jointAxisWorld.dot(motorAxisWorld) >= 0 ? 1 : -1
    const sideSign = motorIsA ? 1 : -1
    const radiansPerSecond = (motor.rpm ?? 120) * Math.PI * 2 / 60
    const targetVelocity = radiansPerSecond * (motor.direction ?? 1) * axisSign * sideSign

    joint.configureMotorVelocity(targetVelocity, motor.damping ?? 1.0)
    this.motorCount += 1
  }

  step() {
    if (!this.world || !this.running) return
    this.world.step()
    this.syncObjects()
  }

  syncObjects() {
    for (const component of this.components) {
      const translation = component.body.translation()
      const rotation = component.body.rotation()
      const bodyWorldMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(translation.x, translation.y, translation.z),
        new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
        new THREE.Vector3(1, 1, 1),
      )

      for (const member of component.members) {
        const objectWorldMatrix = bodyWorldMatrix.clone().multiply(member.relativeMatrix)
        const parent = member.object.parent

        if (!parent) {
          const { position, rotation: worldRotation, scale } = matrixPose(objectWorldMatrix)
          member.object.position.copy(position)
          member.object.quaternion.copy(worldRotation)
          member.object.scale.copy(scale)
          continue
        }

        parent.updateWorldMatrix(true, false)
        const localMatrix = parent.matrixWorld.clone().invert().multiply(objectWorldMatrix)
        const { position, rotation: localRotation, scale } = matrixPose(localMatrix)
        member.object.position.copy(position)
        member.object.quaternion.copy(localRotation)
        member.object.scale.copy(scale)
      }
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
    this.members.clear()
    this.components = []
  }

  get stats() {
    return {
      parts: this.objects.length,
      bodies: this.components.length,
      fixedMerged: Math.max(0, this.objects.length - this.components.length),
      joints: this.jointCount,
      failedJoints: this.failedJointCount,
      internalJoints: this.internalJointCount,
      motors: this.motorCount,
    }
  }
}
