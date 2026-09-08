import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'
import { physicalDefinition } from './physical-parts.js'
import {
  buildColliderProfile,
  COLLIDER_PROFILE_VERSION,
  HOLE_CLEARANCE_STUD,
} from './collider-profiles-v3.js'

const STUD = 0.008
const GROUP = { STRUCTURE: 1, MECHANICAL: 2, WHEEL: 4, WORLD: 8, SENSOR: 16 }
const ALL = 31
const quat = q => ({ x: q.x, y: q.y, z: q.z, w: q.w })
const pack = (membership, filter) => ((membership & 0xffff) << 16) | (filter & 0xffff)

function pose(matrix) {
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  matrix.decompose(position, rotation, scale)
  return { position, rotation, scale }
}

function collisionMask(definition, selfCollision) {
  const cls = definition?.physics?.collisionClass ?? 'structure'
  const membership = cls === 'wheel'
    ? GROUP.WHEEL
    : cls === 'mechanical'
      ? GROUP.MECHANICAL
      : cls === 'sensor'
        ? GROUP.SENSOR
        : GROUP.STRUCTURE

  let filter = GROUP.WORLD
  if (selfCollision === 'full') filter = ALL
  else if (selfCollision === 'mechanical') {
    if (membership === GROUP.STRUCTURE) filter |= GROUP.STRUCTURE | GROUP.WHEEL | GROUP.MECHANICAL
    else if (membership === GROUP.WHEEL || membership === GROUP.MECHANICAL) {
      filter |= GROUP.STRUCTURE | GROUP.WHEEL | GROUP.MECHANICAL
    }
  }
  return pack(membership, filter)
}

function descriptorFromSpec(session, spec, relativeMatrix, relativeRotation, relativeScale) {
  const localCenter = spec.center.clone().applyMatrix4(relativeMatrix).multiplyScalar(STUD)

  if (spec.type === 'cylinder-x') {
    const scaleX = Math.abs(relativeScale.x || 1)
    const scaleRadius = Math.max(Math.abs(relativeScale.y || 1), Math.abs(relativeScale.z || 1))
    const localRotation = relativeRotation.clone()
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)))
    return session.RAPIER.ColliderDesc
      .cylinder(spec.halfLength * STUD * scaleX, spec.radius * STUD * scaleRadius)
      .setTranslation(localCenter.x, localCenter.y, localCenter.z)
      .setRotation(quat(localRotation))
  }

  return session.RAPIER.ColliderDesc
    .cuboid(
      spec.size.x * STUD * Math.abs(relativeScale.x || 1) / 2,
      spec.size.y * STUD * Math.abs(relativeScale.y || 1) / 2,
      spec.size.z * STUD * Math.abs(relativeScale.z || 1) / 2,
    )
    .setTranslation(localCenter.x, localCenter.y, localCenter.z)
    .setRotation(quat(relativeRotation))
}

PhysicsSession.prototype.createCompoundBody = function createCompoundBodyClearanceV3(objects) {
  const root = objects[0]
  if (!root) return

  for (const object of objects) object.updateWorldMatrix(true, false)
  root.updateWorldMatrix(true, false)

  const bodyWorldMatrix = root.matrixWorld.clone()
  const bodyWorldInverse = bodyWorldMatrix.clone().invert()
  const bodyPose = pose(bodyWorldMatrix)
  const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(bodyPose.position.x * STUD, bodyPose.position.y * STUD, bodyPose.position.z * STUD)
    .setRotation(quat(bodyPose.rotation))
    .setCanSleep(false)

  bodyDesc.setCcdEnabled?.(this.quality?.ccd ?? true)
  bodyDesc.setAdditionalSolverIterations?.(Math.max(0, (this.quality?.solverIterations ?? 6) - 4))

  const body = this.world.createRigidBody(bodyDesc)
  body.enableCcd?.(this.quality?.ccd ?? true)

  const component = {
    id: root.userData.instanceId,
    body,
    bodyWorldMatrix,
    bodyWorldInverse,
    bodyWorldRotation: bodyPose.rotation.clone(),
    members: [],
    massKg: 0,
  }

  for (const object of objects) {
    const relativeMatrix = bodyWorldInverse.clone().multiply(object.matrixWorld)
    const relative = pose(relativeMatrix)
    const definition = findPart(object.userData.partId)
    const wheel = definition?.mechanics?.wheel
    const gear = definition?.mechanics?.gear
    const massKg = Math.max(
      .00005,
      definition?.physics?.massKg ?? physicalDefinition(object.userData.partId).massKg ?? .002,
    )
    const colliders = []
    let proxyKind = 'special'

    if (wheel) {
      const localCenter = new THREE.Vector3(0, 1.15, 0).applyMatrix4(relativeMatrix).multiplyScalar(STUD)
      const localRotation = relative.rotation.clone()
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)))
      const descriptor = this.RAPIER.ColliderDesc
        .cylinder(
          .34 * STUD * Math.abs(relative.scale.x || 1),
          wheel.radius * STUD * Math.max(Math.abs(relative.scale.y || 1), Math.abs(relative.scale.z || 1)),
        )
        .setTranslation(localCenter.x, localCenter.y, localCenter.z)
        .setRotation(quat(localRotation))
        .setMass(massKg)
        .setRestitution(.01)
        .setFriction(.02)
        .setCollisionGroups(collisionMask(definition, this.physicsSettings?.selfCollision ?? 'mechanical'))
      colliders.push(this.world.createCollider(descriptor, body))
      proxyKind = 'wheel-cylinder'
    } else if (gear) {
      const localCenter = new THREE.Vector3(0, .4, 0).applyMatrix4(relativeMatrix).multiplyScalar(STUD)
      const descriptor = this.RAPIER.ColliderDesc
        .cylinder(
          .18 * STUD * Math.abs(relative.scale.y || 1),
          (gear.pitchRadius ?? gear.teeth / 16) * .68 * STUD * Math.max(Math.abs(relative.scale.x || 1), Math.abs(relative.scale.z || 1)),
        )
        .setTranslation(localCenter.x, localCenter.y, localCenter.z)
        .setRotation(quat(relative.rotation))
        .setMass(massKg)
        .setRestitution(.01)
        .setFriction(.45)
        .setCollisionGroups(collisionMask(definition, this.physicsSettings?.selfCollision ?? 'mechanical'))
      colliders.push(this.world.createCollider(descriptor, body))
      proxyKind = 'gear-cylinder'
    } else {
      const profile = buildColliderProfile(object, definition)
      proxyKind = profile.kind
      const totalVolume = Math.max(
        1e-8,
        profile.specs.reduce((sum, spec) => sum + Math.max(1e-8, Number(spec.volume) || 0), 0),
      )

      for (const spec of profile.specs) {
        const colliderMass = massKg * Math.max(1e-8, Number(spec.volume) || 0) / totalVolume
        const descriptor = descriptorFromSpec(this, spec, relativeMatrix, relative.rotation, relative.scale)
          .setMass(colliderMass)
          .setRestitution(.01)
          .setFriction(.45)
          .setCollisionGroups(collisionMask(definition, this.physicsSettings?.selfCollision ?? 'mechanical'))
        colliders.push(this.world.createCollider(descriptor, body))
      }
    }

    const member = {
      object,
      body,
      collider: colliders[0] ?? null,
      colliders,
      colliderProxy: proxyKind,
      component,
      relativeMatrix,
      massKg,
    }
    component.massKg += massKg
    component.members.push(member)
    this.members.set(object.userData.instanceId, member)
  }

  this.components.push(component)
}

globalThis.BrickLabColliderModel = Object.freeze({
  version: COLLIDER_PROFILE_VERSION,
  studdedBodies: 'core-only; studs do not fill air between studs',
  technicHoles: 'open compound rail/post proxies for straight pin-hole rows',
  shafts: 'axial cylinder proxy where applicable',
  holeClearanceStud: HOLE_CLEARANCE_STUD,
})
