import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import {
  absBrakeCommand,
  classifyDrivenWheels,
  clampVehicle,
  stepDriveCommand,
  stepTractionControl,
} from './vehicle-model-v1.js'

export const VEHICLE_DRIVE_VERSION = 'vehicle-drive-v3'
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
    tractionControlEnabled: true,
    tractionScale: 1,
    tractionActive: false,
    maxDrivenSlipRatio: 0,
    absEnabled: true,
    absActive: false,
    absScale: 1,
    maxBrakeSlipRatio: 0,
  }
  return session.vehicleDriveV2
}

function wheelFeedback(session, state) {
  const byMember = new Map((session.wheelMonitors ?? []).map(wheel => [wheel.object?.userData?.instanceId, wheel]))
  let drivenSlip = 0
  let brakeSlip = 0
  let groundSpeed = 0
  let contactCount = 0

  for (const wheel of session.wheelMonitors ?? []) {
    if (!wheel.contact) continue
    contactCount += 1
    brakeSlip = Math.max(brakeSlip, Math.abs(Number(wheel.slipRatio) || 0))
    groundSpeed = Math.max(groundSpeed, Math.abs(Number(wheel.groundSpeed) || 0))
  }
  for (const item of state.wheels ?? []) {
    if (!item.driven) continue
    const wheel = byMember.get(item.memberId)
    if (!wheel?.contact) continue
    drivenSlip = Math.max(drivenSlip, Math.abs(Number(wheel.slipRatio) || 0))
  }
  return { drivenSlip, brakeSlip, groundSpeed, contactCount }
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

PhysicsSession.prototype.updateVehicleDriveV2 = function updateVehicleDriveV3(dt) {
  const state = ensureState(this)
  state.longitudinalSpeedMps = longitudinalSpeed(this)

  const step = stepDriveCommand({
    currentThrottle: state.throttleInput,
    targetThrottle: state.throttleTarget,
    longitudinalSpeed: state.longitudinalSpeedMps,
    dt,
    throttleRate: THROTTLE_RATE,
    releaseRate: RELEASE_RATE,
    reverseSpeedThreshold: REVERSE_SPEED_THRESHOLD,
    armed: state.armed,
  })
  state.throttleInput = step.nextThrottle

  const feedback = wheelFeedback(this, state)
  const traction = stepTractionControl({
    currentScale: state.tractionScale,
    maxSlipRatio: feedback.drivenSlip,
    throttle: step.command.throttle,
    dt,
    enabled: state.tractionControlEnabled && state.armed && !step.command.reverseInterlock,
  })
  state.tractionScale = traction.scale
  state.tractionActive = traction.active
  state.maxDrivenSlipRatio = traction.maxSlipRatio

  const command = {
    ...step.command,
    throttle: step.command.throttle * state.tractionScale,
  }
  state.commandedDirection = command.direction
  state.commandedRpm = state.armed && state.motors.length
    ? Math.max(...state.motors.map(motor => motor.commandRpm * command.throttle), 0)
    : 0
  state.reverseInterlock = state.armed && command.reverseInterlock
  state.autoBrake = state.armed ? command.autoBrake : 0
  commandMotors(state, command)

  const manualBrake = clampVehicle(this.vehicleControlV1?.manualBrakeInput ?? 0, 0, 1)
  const brakeDemand = Math.max(manualBrake, state.autoBrake)
  const abs = absBrakeCommand({
    brakeInput: brakeDemand,
    maxSlipRatio: feedback.brakeSlip,
    groundSpeed: feedback.groundSpeed,
    contact: feedback.contactCount > 0,
    enabled: state.absEnabled,
  })
  state.absActive = abs.active
  state.absScale = abs.scale
  state.maxBrakeSlipRatio = abs.maxSlipRatio
  if (this.vehicleControlV1) this.vehicleControlV1.brakeInput = abs.input
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
  return true
}

function setTractionControl(value) {
  const session = currentSession()
  if (!session) return false
  ensureState(session).tractionControlEnabled = Boolean(value)
  return true
}

function setAbs(value) {
  const session = currentSession()
  if (!session) return false
  ensureState(session).absEnabled = Boolean(value)
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
    tractionControlEnabled: state.tractionControlEnabled,
    tractionScale: state.tractionScale,
    tractionActive: state.tractionActive,
    maxDrivenSlipRatio: state.maxDrivenSlipRatio,
    absEnabled: state.absEnabled,
    absScale: state.absScale,
    absActive: state.absActive,
    maxBrakeSlipRatio: state.maxBrakeSlipRatio,
    motors: state.motors.map(motor => ({ ...motor })),
  }
}

globalThis.BrickLabVehicleDrive = {
  version: VEHICLE_DRIVE_VERSION,
  setThrottle,
  setManualBrake,
  setTractionControl,
  setAbs,
  getState,
}
