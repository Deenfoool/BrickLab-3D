import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'

export const PHYSICAL_STEERING_VERSION = 'physical-steering-v1'
const DEFAULT_MAX_STEER_DEG = 34
const DEFAULT_STIFFNESS = 18
const DEFAULT_DAMPING = 2.6

function bodyRotation(body) {
  const q = body.rotation()
  return new THREE.Quaternion(q.x, q.y, q.z, q.w)
}

function bodyPosition(body) {
  const p = body.translation()
  return new THREE.Vector3(p.x, p.y, p.z)
}

function knuckleDefinition(member) {
  const def = findPart(member?.object?.userData?.partId)
  return def?.mechanics?.steeringKnuckle ? def : null
}

PhysicsSession.prototype.onRevoluteJointCreated = function registerPhysicalSteeringJoint(connection, joint, context) {
  if (connection?.kind !== 'hinge' || !joint || !context) return
  const defA = knuckleDefinition(context.memberA)
  const defB = knuckleDefinition(context.memberB)
  if (!defA && !defB) return

  const knuckleMember = defA ? context.memberA : context.memberB
  const baseMember = defA ? context.memberB : context.memberA
  const axisWorld = context.axisA.clone().applyQuaternion(bodyRotation(context.memberA.body)).normalize()
  const mechanics = (defA ?? defB).mechanics.steeringKnuckle ?? {}
  this.steeringJointsV1 ??= []
  this.steeringJointsV1.push({
    id: connection.id,
    joint,
    connection,
    knuckleMember,
    baseMember,
    axisWorldInitial: axisWorld,
    maxSteerRadians: THREE.MathUtils.degToRad(mechanics.maxSteerDeg ?? DEFAULT_MAX_STEER_DEG),
    stiffness: mechanics.stiffness ?? DEFAULT_STIFFNESS,
    damping: mechanics.damping ?? DEFAULT_DAMPING,
    side: null,
    axle: 'front',
    axisSign: 1,
    targetAngle: 0,
  })
}
PhysicsSession.prototype.onRevoluteJointCreated.__bricklabOwner = PHYSICAL_STEERING_VERSION

function localKnucklePosition(session, steering) {
  const chassis = session.chassisMonitor?.body
  if (!chassis) return null
  const objectPositionStud = steering.knuckleMember.object.getWorldPosition(new THREE.Vector3())
  const worldM = objectPositionStud.multiplyScalar(0.008)
  return worldM.sub(bodyPosition(chassis)).applyQuaternion(bodyRotation(chassis).invert())
}

function classifySteeringJoints(session) {
  const joints = session.steeringJointsV1 ?? []
  if (!joints.length || !session.chassisMonitor?.body) return []
  const entries = joints.map(steering => ({ steering, position: localKnucklePosition(session, steering) })).filter(e => e.position)
  if (!entries.length) return []

  const centerX = entries.reduce((sum, entry) => sum + entry.position.x, 0) / entries.length
  const minZ = Math.min(...entries.map(entry => entry.position.z))
  const maxZ = Math.max(...entries.map(entry => entry.position.z))
  const zSpan = maxZ - minZ
  const frontTolerance = Math.max(0.002, zSpan * 0.15)
  const chassisUp = new THREE.Vector3(0, 1, 0).applyQuaternion(bodyRotation(session.chassisMonitor.body)).normalize()

  for (const entry of entries) {
    const steering = entry.steering
    steering.side = entry.position.x < centerX ? 'left' : 'right'
    steering.axle = zSpan < 0.003 || entry.position.z >= maxZ - frontTolerance ? 'front' : 'rear'
    steering.axisSign = steering.axisWorldInitial.dot(chassisUp) >= 0 ? 1 : -1
    steering.joint.setLimits?.(-steering.maxSteerRadians, steering.maxSteerRadians)
  }
  return entries
}

const previousInitializeVehicle = PhysicsSession.prototype.initializeVehicleSystemV1
PhysicsSession.prototype.initializeVehicleSystemV1 = function initializePhysicalSteering(...args) {
  const control = previousInitializeVehicle.apply(this, args)
  const entries = classifySteeringJoints(this)
  const active = entries.filter(entry => entry.steering.axle === 'front')
  if (control) {
    control.physicalSteering = active.length >= 2
    control.physicalSteeringJoints = active.length
    control.steeringMode = control.physicalSteering ? 'physical-knuckle' : 'virtual-tire'
  }
  return control
}
PhysicsSession.prototype.initializeVehicleSystemV1.__bricklabOwner = PHYSICAL_STEERING_VERSION

const previousUpdateVehicleControls = PhysicsSession.prototype.updateVehicleControlsV1
PhysicsSession.prototype.updateVehicleControlsV1 = function updatePhysicalSteering(dt) {
  previousUpdateVehicleControls.call(this, dt)
  const control = this.vehicleControlV1
  if (!control?.physicalSteering) return

  // Physical wheel bodies inherit yaw from the steering knuckle/bearing chain.
  // Disable the fallback virtual tire-heading rotation to avoid applying steering twice.
  for (const wheel of this.wheelMonitors ?? []) wheel.steerAngle = 0

  for (const steering of this.steeringJointsV1 ?? []) {
    if (steering.axle !== 'front') continue
    const desired = steering.side === 'left' ? control.leftAngle : control.rightAngle
    const limited = Math.max(-steering.maxSteerRadians, Math.min(steering.maxSteerRadians, desired))
    const target = limited * steering.axisSign
    steering.targetAngle = target
    steering.joint.configureMotorPosition?.(target, steering.stiffness, steering.damping)
  }
}
PhysicsSession.prototype.updateVehicleControlsV1.__bricklabOwner = PHYSICAL_STEERING_VERSION

globalThis.BrickLabPhysicalSteering = {
  version: PHYSICAL_STEERING_VERSION,
  diagnostics: () => {
    const session = globalThis.__bricklabPhysicsSession
    return {
      mode: session?.vehicleControlV1?.steeringMode ?? 'none',
      joints: (session?.steeringJointsV1 ?? []).map(steering => ({
        id: steering.id,
        side: steering.side,
        axle: steering.axle,
        targetDeg: THREE.MathUtils.radToDeg(steering.targetAngle ?? 0),
      })),
    }
  },
}
