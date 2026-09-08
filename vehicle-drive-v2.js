import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import {
  approachVehicle,
  classifyDrivenWheels,
  clampVehicle,
  resolveDriveRequest,
} from './vehicle-model-v1.js'

export const VEHICLE_DRIVE_VERSION = 'vehicle-drive-v2'
const THROTTLE_RATE = 2.8
const RELEASE_RATE = 4.5
const REVERSE_SPEED_THRESHOLD = 0.08
const EPS = 1e-8

function bodyQuaternion(body) {
  const q = body?.rotation?.()
  return q ? new THREE.Quaternion(q.x, q.y, q.z, q.w) : new THREE.Quaternion()
}

function bodyVector(body, method) {
  const v = body?.[method]?.()
  return v ? new THREE.Vector3(v.x, v.y, v.z) : new THREE.Vector3()
}

function chassisBasis(session) {
  const q = bodyQuaternion(session.chassisMonitor?.body)
  return {
    forward: new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize(),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize(),
  }
}

function longitudinalSpeed(session) {
  const body = session.chassisMonitor?.body
  if (!body) return 0
  return bodyVector(body, 'linvel').dot(chassisBasis(session).forward)
}

function wheelAxisWorld(wheel) {
  const local = wheel?.vehicleBaseLocalAxis ?? wheel?.localAxis
  if (!wheel?.body || !local) return null
  return local.clone().applyQuaternion(bodyQuaternion(wheel.body)).normalize()
}

function motorForwardDirection(session, motorId, classifiedWheels) {
  const { forward, up } = chassisBasis(session)
  const shaftById = new Map((session.drivetrain?.shafts ?? []).map(shaft => [shaft.id, shaft]))
  let vote = 0

  for (const item of classifiedWheels) {
    if (!item.driven || item.sourceMotorId !== motorId) continue
    const wheel = (session.wheelMonitors ?? []).find(candidate => candidate.object?.userData?.instanceId === item.memberId)
    const shaft = shaftById.get(item.shaftId)
    const wheelAxis = wheelAxisWorld(wheel)
    const shaftAxis = shaft?.axisWorld?.clone?.()?.normalize?.()
    const ratio = Number(shaft?.ratioFromMotor)
    if (!wheelAxis || !shaftAxis || !Number.isFinite(ratio) || Math.abs(ratio) < EPS) continue

    const rollingSign = Math.sign(wheelAxis.clone().cross(up).dot(forward)) || 1
    const shaftToWheel = Math.sign(shaftAxis.dot(wheelAxis)) || 1
    const motorToShaft = Math.sign(ratio) || 1
    vote += rollingSign * shaftToWheel * motorToShaft
  }

  if (Math.abs(vote) >= EPS) return Math.sign(vote)
  const config = globalThis.BrickLabControls?.getConfig?.(motorId)
  return config?.motor?.initialDirection === -1 ? -1 : 1
}

function buildTopology(session) {
  const wheelEntries = (session.wheelMonitors ?? []).map(wheel => ({
    id: wheel.id,
    instanceId: wheel.object?.userData?.instanceId ?? null,
    axle: wheel.axleRole ?? 'middle',
  }))
  const classification = classifyDrivenWheels(wheelEntries, session.drivetrain?.shafts ?? [])
  const controls = globalThis.BrickLabControls
  const motors = classification.motorIds.map(id => {
    const config = controls?.getConfig?.(id)
    if (config?.type !== 'motor') return null
    return {
      id,
      forwardDirection: motorForwardDirection(session, id, classification.wheels),
      commandRpm: Math.max(0, Number(config.motor?.baseRpm) || 0),
      maxRpm: Math.max(0, Number(config.motor?.maxRpm) || 0),
    }
  }).filter(Boolean)

  return {
    layout: classification.layout,
    drivenWheelCount: classification.drivenWheelCount,
    wheels: classification.wheels,
    motorIds: motors.map(motor => motor.id),
    motors,
  }
}

function ensureState(session) {
  if (session.vehicleDriveV2) return session.vehicleDriveV2
  const topology = buildTopology(session)
  if (session.vehicleControlV1) session.vehicleControlV1.manualBrakeInput ??= 0
  session.vehicleDriveV2 = {
    version: VEHICLE_DRIVE_VERSION,
    ...topology,
    armed: false,
    throttleTarget: 0,
    throttleInput: 0,
    commandedDirection: 0,
    commandedRpm: 0,
    reverseInterlock: false,
    autoBrake: 0,
    longitudinalSpeedMps: 0,
  }
  return session.vehicleDriveV2
}

function commandMotors(state, command) {
  if (!state.armed) return
  const controls = globalThis.BrickLabControls
  if (!controls) return
  for (const motor of state.motors) {
    const rpm = Math.max(0, motor.commandRpm * command.throttle)
    const direction = command.direction === 0 ? 0 : command.direction * motor.forwardDirection
    const runtime = controls.getRuntime?.(motor.id)
    if (!runtime || runtime.type !== 'motor') continue
    if (Math.abs((runtime.rpm ?? 0) - rpm) > 0.25) controls.setMotorRpm?.(motor.id, rpm)
    if ((runtime.direction ?? 0) !== direction) controls.setMotorDirection?.(motor.id, direction)
  }
}

PhysicsSession.prototype.updateVehicleDriveV2 = function updateVehicleDriveV2(dt) {
  const state = ensureState(this)
  const target = clampVehicle(state.throttleTarget, -1, 1)
  state.longitudinalSpeedMps = longitudinalSpeed(this)

  const targetDirection = Math.abs(target) < EPS ? 0 : Math.sign(target)
  const motionDirection = Math.abs(state.longitudinalSpeedMps) > REVERSE_SPEED_THRESHOLD
    ? Math.sign(state.longitudinalSpeedMps)
    : 0
  const reversingAgainstMotion = state.armed
    && targetDirection !== 0
    && motionDirection !== 0
    && targetDirection !== motionDirection

  // During a forward↔reverse request, remove drive torque first and brake to
  // the interlock threshold. Once slow enough, throttle ramps up from zero in
  // the requested direction instead of flipping a loaded drivetrain instantly.
  if (reversingAgainstMotion) {
    state.throttleInput = approachVehicle(state.throttleInput, 0, RELEASE_RATE * Math.max(0, dt))
  } else {
    const rate = Math.abs(target) < EPS ? RELEASE_RATE : THROTTLE_RATE
    state.throttleInput = approachVehicle(state.throttleInput, target, rate * Math.max(0, dt))
  }

  const command = resolveDriveRequest({
    throttle: state.armed ? (reversingAgainstMotion ? target : state.throttleInput) : 0,
    longitudinalSpeed: state.longitudinalSpeedMps,
    reverseSpeedThreshold: REVERSE_SPEED_THRESHOLD,
  })
  state.commandedDirection = command.direction
  state.commandedRpm = state.armed && state.motors.length
    ? Math.max(...state.motors.map(motor => motor.commandRpm * command.throttle), 0)
    : 0
  state.reverseInterlock = state.armed && command.reverseInterlock
  state.autoBrake = state.armed ? command.autoBrake : 0

  commandMotors(state, command)

  const manualBrake = clampVehicle(this.vehicleControlV1?.manualBrakeInput ?? 0, 0, 1)
  if (this.vehicleControlV1) this.vehicleControlV1.brakeInput = Math.max(manualBrake, state.autoBrake)
}
PhysicsSession.prototype.updateVehicleDriveV2.__bricklabOwner = VEHICLE_DRIVE_VERSION

function currentSession() { return globalThis.__bricklabPhysicsSession ?? null }

function setThrottle(value) {
  const session = currentSession()
  if (!session) return false
  const state = ensureState(session)
  const requested = clampVehicle(value, -1, 1)
  if (Math.abs(requested) > EPS && state.motors.length) state.armed = true
  state.throttleTarget = requested
  return true
}

function setManualBrake(value) {
  const session = currentSession()
  const control = session?.vehicleControlV1
  if (!control) return false
  control.manualBrakeInput = clampVehicle(value, 0, 1)
  control.brakeInput = Math.max(control.manualBrakeInput, session?.vehicleDriveV2?.autoBrake ?? 0)
  return true
}

function getState() {
  const session = currentSession()
  if (!session) return null
  const state = ensureState(session)
  return {
    version: state.version,
    armed: state.armed,
    layout: state.layout,
    motorIds: [...state.motorIds],
    motorCount: state.motorIds.length,
    drivenWheelCount: state.drivenWheelCount,
    throttleTarget: state.throttleTarget,
    throttleInput: state.throttleInput,
    commandedDirection: state.commandedDirection,
    commandedRpm: state.commandedRpm,
    reverseInterlock: state.reverseInterlock,
    autoBrake: state.autoBrake,
    longitudinalSpeedMps: state.longitudinalSpeedMps,
    motors: state.motors.map(motor => ({ ...motor })),
  }
}

globalThis.BrickLabVehicleDrive = {
  version: VEHICLE_DRIVE_VERSION,
  setThrottle,
  setManualBrake,
  getState,
}
