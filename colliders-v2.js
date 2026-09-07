import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'
import { physicalDefinition } from './physical-parts.js'

const STUD = 0.008
const GROUP = { STRUCTURE: 1, MECHANICAL: 2, WHEEL: 4, WORLD: 8, SENSOR: 16 }
const ALL = 31
const quat = q => ({ x: q.x, y: q.y, z: q.z, w: q.w })
const pack = (membership, filter) => ((membership & 0xffff) << 16) | (filter & 0xffff)

function pose(matrix) {
  const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3()
  matrix.decompose(position, rotation, scale)
  return { position, rotation, scale }
}

function localBounds(object) {
  object.updateWorldMatrix(true, true)
  const rootInverse = object.matrixWorld.clone().invert()
  const box = new THREE.Box3().makeEmpty()
  const meshBox = new THREE.Box3()
  const relative = new THREE.Matrix4()

  object.traverse(child => {
    if (!child.isMesh || !child.geometry) return
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
    if (!child.geometry.boundingBox) return

    meshBox.copy(child.geometry.boundingBox)
    relative.multiplyMatrices(rootInverse, child.matrixWorld)
    meshBox.applyMatrix4(relative)
    box.union(meshBox)
  })

  if (box.isEmpty()) {
    return {
      size: new THREE.Vector3(0.12, 0.12, 0.12),
      center: new THREE.Vector3(),
    }
  }

  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  size.set(Math.max(size.x, .12), Math.max(size.y, .12), Math.max(size.z, .12))
  return { size, center }
}

function collisionMask(def, selfCollision) {
  const cls = def?.physics?.collisionClass ?? 'structure'
  const membership = cls === 'wheel' ? GROUP.WHEEL : cls === 'mechanical' ? GROUP.MECHANICAL : cls === 'sensor' ? GROUP.SENSOR : GROUP.STRUCTURE
  let filter = GROUP.WORLD
  if (selfCollision === 'full') filter = ALL
  else if (selfCollision === 'mechanical') {
    if (membership === GROUP.STRUCTURE) filter |= GROUP.WHEEL | GROUP.MECHANICAL
    else if (membership === GROUP.WHEEL || membership === GROUP.MECHANICAL) filter |= GROUP.STRUCTURE | GROUP.WHEEL | GROUP.MECHANICAL
  }
  return pack(membership, filter)
}

PhysicsSession.prototype.createCompoundBody = function createCompoundBodyV2(objects) {
  const root = objects[0]
  if (!root) return
  for (const object of objects) object.updateWorldMatrix(true, false)
  root.updateWorldMatrix(true, false)
  const bodyWorldMatrix = root.matrixWorld.clone(), bodyWorldInverse = bodyWorldMatrix.clone().invert(), bodyPose = pose(bodyWorldMatrix)
  const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(bodyPose.position.x * STUD, bodyPose.position.y * STUD, bodyPose.position.z * STUD)
    .setRotation(quat(bodyPose.rotation)).setCanSleep(false)
  bodyDesc.setCcdEnabled?.(this.quality?.ccd ?? true)
  bodyDesc.setAdditionalSolverIterations?.(Math.max(0, (this.quality?.solverIterations ?? 6) - 4))
  const body = this.world.createRigidBody(bodyDesc)
  body.enableCcd?.(this.quality?.ccd ?? true)
  const component = { id: root.userData.instanceId, body, bodyWorldMatrix, bodyWorldInverse, bodyWorldRotation: bodyPose.rotation.clone(), members: [], massKg: 0 }

  for (const object of objects) {
    const relativeMatrix = bodyWorldInverse.clone().multiply(object.matrixWorld), relative = pose(relativeMatrix), def = findPart(object.userData.partId)
    const wheel = def?.mechanics?.wheel, gear = def?.mechanics?.gear
    let colliderDesc
    if (wheel) {
      const localCenter = new THREE.Vector3(0, 1.15, 0).applyMatrix4(relativeMatrix).multiplyScalar(STUD)
      const localRotation = relative.rotation.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)))
      colliderDesc = this.RAPIER.ColliderDesc.cylinder(.34 * STUD * Math.abs(relative.scale.x || 1), wheel.radius * STUD * Math.max(Math.abs(relative.scale.y || 1), Math.abs(relative.scale.z || 1)))
        .setTranslation(localCenter.x, localCenter.y, localCenter.z).setRotation(quat(localRotation))
    } else if (gear) {
      const localCenter = new THREE.Vector3(0, .4, 0).applyMatrix4(relativeMatrix).multiplyScalar(STUD)
      colliderDesc = this.RAPIER.ColliderDesc.cylinder(.18 * STUD * Math.abs(relative.scale.y || 1), (gear.pitchRadius ?? gear.teeth / 16) * .68 * STUD * Math.max(Math.abs(relative.scale.x || 1), Math.abs(relative.scale.z || 1)))
        .setTranslation(localCenter.x, localCenter.y, localCenter.z).setRotation(quat(relative.rotation))
    } else {
      const { size, center } = localBounds(object)
      const localCenter = center.clone().applyMatrix4(relativeMatrix).multiplyScalar(STUD)
      colliderDesc = this.RAPIER.ColliderDesc.cuboid(size.x * STUD * Math.abs(relative.scale.x) / 2, size.y * STUD * Math.abs(relative.scale.y) / 2, size.z * STUD * Math.abs(relative.scale.z) / 2)
        .setTranslation(localCenter.x, localCenter.y, localCenter.z).setRotation(quat(relative.rotation))
    }
    const massKg = Math.max(.00005, def?.physics?.massKg ?? physicalDefinition(object.userData.partId).massKg ?? .002)
    colliderDesc.setMass(massKg).setRestitution(.01).setFriction(wheel ? .02 : .45).setCollisionGroups(collisionMask(def, this.physicsSettings?.selfCollision ?? 'mechanical'))
    const collider = this.world.createCollider(colliderDesc, body)
    const member = { object, body, collider, component, relativeMatrix, massKg }
    component.massKg += massKg; component.members.push(member); this.members.set(object.userData.instanceId, member)
  }
  this.components.push(component)
}
