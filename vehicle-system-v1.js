import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { PHYSICS_UNITS } from './physical-parts.js'
import {
  VEHICLE_MODEL_VERSION,
  ackermannAngles,
  approachVehicle,
  boundedBrakeTorque,
  classifyWheelAxles,
  clampVehicle,
} from './vehicle-model-v1.js'

export const VEHICLE_SYSTEM_VERSION = 'vehicle-system-v1'
const STUD = PHYSICS_UNITS.studMeters
const EPS = 1e-10
const DEFAULT_MAX_STEER_DEG = 34
const DEFAULT_STEER_RATE = 2.8 // normalized input per second
const DEFAULT_BRAKE_GRIP = 1.15

function bodyRotation(body) {
  const q = body.rotation()
  return new THREE.Quaternion(q.x, q.y, q.z, q.w)
}

function bodyAngular(body) {
  const v = body.angvel()
  return new THREE.Vector3(v.x, v.y, v.z)
}

function bodyPosition(body) {
  const v = body.translation()
  return new THREE.Vector3(v.x, v.y, v.z)
}

function vec(v) { return { x: v.x, y: v.y, z: v.z } }

function wheelCenter(wheel) {
  if (!wheel?.member) return null
  return new THREE.Vector3(0, 1.15, 0)
    .applyMatrix4(wheel.member.relativeMatrix)
    .multiplyScalar(STUD)
    .applyQuaternion(bodyRotation(wheel.body))
    .add(bodyPosition(wheel.body))
}

function wheelPositionInChassis(session, wheel) {
  const center = wheelCenter(wheel)
  const chassis = session.chassisMonitor?.body
  if (!center || !chassis) return null
  const local = center.sub(bodyPosition(chassis))
    .applyQuaternion(bodyRotation(chassis).invert())
  return local
}

function inverseInertiaQuadratic(body, worldVector) {
  if (!body?.isDynamic?.() || worldVector.lengthSq() < EPS) return 0
  const principalFrame = body.principalInertiaLocalFrame?.()
  const inverse = body.invPrincipalInertia?.()
  if (!principalFrame || !inverse) return 0
  const frame = bodyRotation(body).multiply(new THREE.Quaternion(
    principalFrame.x, principalFrame.y, principalFrame.z, principalFrame.w,
  ))
  const local = worldVector.clone().applyQuaternion(frame.invert())
  return Math.max(0, local.x * local.x * inverse.x + local.y * local.y * inverse.y + local.z * local.z * inverse.z)
}

function worldAxisFromLocal(body, localAxis) {
  return localAxis.clone().applyQuaternion(bodyRotation(body)).normalize()
}

function steeredLocalAxis(session, wheel) {
  const base = wheel.vehicleBaseLocalAxis ?? wheel.localAxis
  const angle = Number(wheel.steerAngle) || 0
  if (Math.abs(angle) < 1e-8 || !session.chassisMonitor?.body) return base.clone()

  const bodyQ = bodyRotation(wheel.body)
  const worldAxis = base.clone().applyQuaternion(bodyQ).normalize()
  const chassisUp = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(bodyRotation(session.chassisMonitor.body)).normalize()
  worldAxis.applyAxisAngle(chassisUp, angle).normalize()
  return worldAxis.applyQuaternion(bodyQ.clone().invert()).normalize()
}

function applyWheelBrakes(session, dt) {
  const control = session.vehicleControlV1
  if (!control?.enabled) return
  const service = clampVehicle(control.brakeInput, 0, 1)
  const parking = control.parkingBrake ? 1 : 0
  if (service <= 0 && parking <= 0) return

  const rearBoost = 1.25
  for (const wheel of session.wheelMonitors ?? []) {
    if (!wheel.vehicleBaseLocalAxis) continue
    const input = Math.max(service, wheel.axleRole === 'rear' ? parking : 0)
    if (input <= 0) continue

    const axis = worldAxisFromLocal(wheel.body, wheel.vehicleBaseLocalAxis)
    const omega = bodyAngular(wheel.body).dot(axis)
    const invI = inverseInertiaQuadratic(wheel.body, axis)
    const load = Math.max(0, Number(wheel.normalLoadN) || 0)
    const axleFactor = wheel.axleRole === 'rear' ? rearBoost : 1
    const maxTorque = Math.max(0.00002, load * Math.max(wheel.radius || 0, STUD) * DEFAULT_BRAKE_GRIP * axleFactor)
    const torque = boundedBrakeTorque({ omega, input, maxTorque, inverseInertia: invI, dt })
    wheel.brakeTorqueNm = torque
    wheel.brakeInput = input
    if (Math.abs(torque) > EPS) wheel.body.addTorque?.(vec(axis.multiplyScalar(torque)), true)
  }
}

PhysicsSession.prototype.initializeVehicleSystemV1 = function initializeVehicleSystemV1() {
  const wheelEntries = []
  for (const wheel of this.wheelMonitors ?? []) {
    const p = wheelPositionInChassis(this, wheel)
    if (!p) continue
    wheel.vehicleBaseLocalAxis = wheel.localAxis.clone()
    wheelEntries.push({ id: wheel.id, x: p.x, z: p.z, wheel })
  }

  const layout = classifyWheelAxles(wheelEntries)
  const byId = new Map(layout.wheels.map(item => [item.id, item]))
  for (const wheel of this.wheelMonitors ?? []) {
    const item = byId.get(wheel.id)
    wheel.side = item?.side ?? 'right'
    wheel.axleRole = item?.axle ?? 'middle'
    wheel.steerAngle = 0
    wheel.brakeInput = 0
    wheel.brakeTorqueNm = 0
  }

  this.vehicleControlV1 = {
    enabled: Boolean(this.chassisMonitor && layout.wheels.length >= 2),
    steeringInput: 0,
    steeringTarget: 0,
    brakeInput: 0,
    parkingBrake: false,
    maxSteerRadians: THREE.MathUtils.degToRad(DEFAULT_MAX_STEER_DEG),
    steerRate: DEFAULT_STEER_RATE,
    wheelbaseM: Math.max(layout.wheelbase, this.chassisMonitor?.wheelbaseM ?? 0),
    trackM: Math.max(layout.track, this.chassisMonitor?.trackM ?? 0),
    frontWheelCount: layout.wheels.filter(w => w.axle === 'front').length,
    rearWheelCount: layout.wheels.filter(w => w.axle === 'rear').length,
    leftAngle: 0,
    rightAngle: 0,
    centerAngle: 0,
    turnRadiusM: Infinity,
  }
  return this.vehicleControlV1
}

PhysicsSession.prototype.updateVehicleControlsV1 = function updateVehicleControlsV1(dt) {
  const control = this.vehicleControlV1
  if (!control?.enabled) return
  control.steeringInput = approachVehicle(
    control.steeringInput,
    clampVehicle(control.steeringTarget, -1, 1),
    control.steerRate * Math.max(0, dt),
  )

  const steering = ackermannAngles({
    input: control.steeringInput,
    wheelbase: Math.max(control.wheelbaseM, STUD),
    track: Math.max(control.trackM, STUD),
    maxSteerRadians: control.maxSteerRadians,
  })
  control.leftAngle = steering.left
  control.rightAngle = steering.right
  control.centerAngle = steering.center
  control.turnRadiusM = steering.radius

  for (const wheel of this.wheelMonitors ?? []) {
    wheel.steerAngle = wheel.axleRole === 'front'
      ? (wheel.side === 'left' ? steering.left : steering.right)
      : 0
  }
}

const previousBuildChassisMonitor = PhysicsSession.prototype.buildChassisMonitor
PhysicsSession.prototype.buildChassisMonitor = function buildChassisWithVehicleSystem(...args) {
  const result = previousBuildChassisMonitor.apply(this, args)
  this.initializeVehicleSystemV1()
  return result
}
PhysicsSession.prototype.buildChassisMonitor.__bricklabOwner = VEHICLE_SYSTEM_VERSION

const previousTireForces = PhysicsSession.prototype.applyTireForcesV2
PhysicsSession.prototype.applyTireForcesV2 = function applyVehicleAwareTireForces(dt) {
  const saved = []
  for (const wheel of this.wheelMonitors ?? []) {
    if (!wheel.vehicleBaseLocalAxis) wheel.vehicleBaseLocalAxis = wheel.localAxis.clone()
    saved.push([wheel, wheel.localAxis])
    wheel.localAxis = steeredLocalAxis(this, wheel)
  }

  try {
    return previousTireForces.call(this, dt)
  } finally {
    for (const [wheel, original] of saved) wheel.localAxis = original
    applyWheelBrakes(this, dt)
  }
}
PhysicsSession.prototype.applyTireForcesV2.__bricklabOwner = `${VEHICLE_SYSTEM_VERSION}:tire-wrapper`

function currentSession() { return globalThis.__bricklabPhysicsSession ?? null }
function controlState() { return currentSession()?.vehicleControlV1 ?? null }

function setSteering(value) {
  const control = controlState()
  if (!control) return false
  control.steeringTarget = clampVehicle(value, -1, 1)
  return true
}

function setBrake(value) {
  const control = controlState()
  if (!control) return false
  control.brakeInput = clampVehicle(value, 0, 1)
  return true
}

function setParkingBrake(value) {
  const control = controlState()
  if (!control) return false
  control.parkingBrake = Boolean(value)
  return true
}

function diagnostics() {
  const session = currentSession()
  const control = session?.vehicleControlV1
  return {
    version: VEHICLE_SYSTEM_VERSION,
    model: VEHICLE_MODEL_VERSION,
    enabled: Boolean(control?.enabled),
    steeringInput: control?.steeringInput ?? 0,
    steeringTarget: control?.steeringTarget ?? 0,
    centerSteerDeg: THREE.MathUtils.radToDeg(control?.centerAngle ?? 0),
    leftSteerDeg: THREE.MathUtils.radToDeg(control?.leftAngle ?? 0),
    rightSteerDeg: THREE.MathUtils.radToDeg(control?.rightAngle ?? 0),
    turnRadiusM: Number.isFinite(control?.turnRadiusM) ? control.turnRadiusM : null,
    brakeInput: control?.brakeInput ?? 0,
    parkingBrake: Boolean(control?.parkingBrake),
    wheelbaseM: control?.wheelbaseM ?? 0,
    trackM: control?.trackM ?? 0,
    massKg: session?.chassisMonitor?.totalMassKg ?? session?.vehicleMassKg ?? 0,
    comStud: session?.chassisMonitor?.comStud?.toArray?.() ?? null,
    wheels: (session?.wheelMonitors ?? []).map(wheel => ({
      id: wheel.id,
      side: wheel.side,
      axle: wheel.axleRole,
      steerDeg: THREE.MathUtils.radToDeg(wheel.steerAngle ?? 0),
      brakeTorqueNm: wheel.brakeTorqueNm ?? 0,
      contact: Boolean(wheel.contact),
      slipPercent: wheel.slipPercent ?? 0,
    })),
  }
}

globalThis.BrickLabVehicle = {
  version: VEHICLE_SYSTEM_VERSION,
  setSteering,
  setBrake,
  setParkingBrake,
  getState: diagnostics,
}
