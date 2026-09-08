export const VEHICLE_MODEL_VERSION = 'vehicle-model-v5'

const EPS = 1e-9

export function clampVehicle(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

export function approachVehicle(current, target, maxDelta) {
  const c = Number(current) || 0
  const t = Number(target) || 0
  const d = Math.max(0, Number(maxDelta) || 0)
  if (Math.abs(t - c) <= d) return t
  return c + Math.sign(t - c) * d
}

export function ackermannAngles({ input = 0, wheelbase = 0, track = 0, maxSteerRadians = Math.PI / 6 } = {}) {
  const normalized = clampVehicle(input, -1, 1)
  const maxAngle = Math.max(0, Math.abs(Number(maxSteerRadians) || 0))
  const center = normalized * maxAngle
  const wb = Math.max(EPS, Math.abs(Number(wheelbase) || 0))
  const tr = Math.max(0, Math.abs(Number(track) || 0))
  if (Math.abs(center) < EPS || maxAngle < EPS) return { center: 0, left: 0, right: 0, radius: Infinity }
  const radius = wb / Math.tan(Math.abs(center))
  const innerRadius = Math.max(EPS, radius - tr / 2)
  const outerRadius = radius + tr / 2
  const inner = Math.atan(wb / innerRadius)
  const outer = Math.atan(wb / outerRadius)
  const sign = Math.sign(center)
  return sign > 0
    ? { center, left: inner, right: outer, radius }
    : { center, left: -outer, right: -inner, radius }
}

export function boundedBrakeTorque({ omega = 0, input = 0, maxTorque = 0, inverseInertia = 0, dt = 0 } = {}) {
  const w = Number(omega) || 0
  const amount = clampVehicle(input, 0, 1)
  const capacity = Math.max(0, Number(maxTorque) || 0) * amount
  const invI = Math.max(0, Number(inverseInertia) || 0)
  const step = Math.max(0, Number(dt) || 0)
  if (Math.abs(w) < EPS || capacity < EPS || invI < EPS || step < EPS) return 0
  const zeroingTorque = Math.abs(w) / (invI * step)
  return -Math.sign(w) * Math.min(capacity, zeroingTorque)
}

export function resolveDriveRequest({ throttle = 0, longitudinalSpeed = 0, reverseSpeedThreshold = 0.08 } = {}) {
  const requested = clampVehicle(throttle, -1, 1)
  const requestedDirection = Math.abs(requested) < EPS ? 0 : Math.sign(requested)
  const speed = Number(longitudinalSpeed) || 0
  const threshold = Math.max(0, Number(reverseSpeedThreshold) || 0)
  const movingDirection = Math.abs(speed) > threshold ? Math.sign(speed) : 0
  const reverseInterlock = requestedDirection !== 0 && movingDirection !== 0 && requestedDirection !== movingDirection
  return {
    requested,
    requestedDirection,
    direction: reverseInterlock ? 0 : requestedDirection,
    throttle: reverseInterlock ? 0 : Math.abs(requested),
    autoBrake: reverseInterlock ? 1 : 0,
    reverseInterlock,
  }
}

export function stepDriveCommand({
  currentThrottle = 0,
  targetThrottle = 0,
  longitudinalSpeed = 0,
  dt = 0,
  throttleRate = 2.8,
  releaseRate = 4.5,
  reverseSpeedThreshold = 0.08,
  armed = true,
} = {}) {
  const current = clampVehicle(currentThrottle, -1, 1)
  const target = clampVehicle(targetThrottle, -1, 1)
  const speed = Number(longitudinalSpeed) || 0
  const step = Math.max(0, Number(dt) || 0)
  const targetDirection = Math.abs(target) < EPS ? 0 : Math.sign(target)
  const currentDirection = Math.abs(current) < EPS ? 0 : Math.sign(current)
  const motionDirection = Math.abs(speed) > reverseSpeedThreshold ? Math.sign(speed) : 0
  const reversingAgainstMotion = Boolean(armed && targetDirection !== 0 && motionDirection !== 0 && targetDirection !== motionDirection)
  const crossingNeutral = Boolean(
    armed && !reversingAgainstMotion && targetDirection !== 0 && currentDirection !== 0 && targetDirection !== currentDirection,
  )

  let nextThrottle
  if (!armed) nextThrottle = approachVehicle(current, 0, Math.max(0, releaseRate) * step)
  else if (reversingAgainstMotion || crossingNeutral || targetDirection === 0) {
    nextThrottle = approachVehicle(current, 0, Math.max(0, releaseRate) * step)
  } else {
    nextThrottle = approachVehicle(current, target, Math.max(0, throttleRate) * step)
  }

  const commandThrottle = !armed
    ? 0
    : reversingAgainstMotion
      ? target
      : crossingNeutral
        ? 0
        : nextThrottle
  const command = resolveDriveRequest({
    throttle: commandThrottle,
    longitudinalSpeed: speed,
    reverseSpeedThreshold,
  })

  return { nextThrottle, reversingAgainstMotion, crossingNeutral, command }
}

/**
 * Traction control scales the requested motor setpoint using previous-step wheel
 * slip. It never injects forces and never touches free/accessory motors.
 */
export function stepTractionControl({
  currentScale = 1,
  maxSlipRatio = 0,
  throttle = 0,
  dt = 0,
  enabled = true,
  slipStart = 0.18,
  slipFull = 0.55,
  minimumScale = 0.25,
  cutRate = 10,
  recoverRate = 2.5,
} = {}) {
  const slip = Math.max(0, Math.abs(Number(maxSlipRatio) || 0))
  const demand = Math.max(0, Number(throttle) || 0)
  const span = Math.max(EPS, slipFull - slipStart)
  const reduction = clampVehicle((slip - slipStart) / span, 0, 1)
  const target = !enabled || demand <= EPS
    ? 1
    : 1 - reduction * (1 - clampVehicle(minimumScale, 0, 1))
  const current = clampVehicle(currentScale, 0, 1)
  const rate = target < current ? cutRate : recoverRate
  const scale = approachVehicle(current, target, Math.max(0, Number(dt) || 0) * Math.max(0, rate))
  return {
    scale,
    targetScale: target,
    active: Boolean(enabled && demand > EPS && target < 0.999),
    maxSlipRatio: slip,
  }
}

/**
 * ABS modulates service-brake demand from wheel slip. Parking brake is handled
 * separately and intentionally remains mechanical/unassisted.
 */
export function absBrakeCommand({
  brakeInput = 0,
  maxSlipRatio = 0,
  groundSpeed = 0,
  contact = true,
  enabled = true,
  minimumSpeed = 0.08,
  slipStart = 0.18,
  slipFull = 0.70,
  minimumScale = 0.22,
} = {}) {
  const demand = clampVehicle(brakeInput, 0, 1)
  const speed = Math.abs(Number(groundSpeed) || 0)
  const slip = Math.max(0, Math.abs(Number(maxSlipRatio) || 0))
  if (!enabled || !contact || demand <= EPS || speed < minimumSpeed || slip <= slipStart) {
    return { input: demand, scale: 1, active: false, maxSlipRatio: slip }
  }
  const reduction = clampVehicle((slip - slipStart) / Math.max(EPS, slipFull - slipStart), 0, 1)
  const scale = 1 - reduction * (1 - clampVehicle(minimumScale, 0, 1))
  return { input: demand * scale, scale, active: scale < 0.999, maxSlipRatio: slip }
}

export function classifyDrivenWheels(wheels = [], shafts = []) {
  const shaftByMember = new Map()
  for (const shaft of shafts ?? []) for (const memberId of shaft?.memberIds ?? []) shaftByMember.set(memberId, shaft)
  const resolved = (wheels ?? []).map(wheel => {
    const memberId = wheel?.instanceId ?? wheel?.memberId ?? wheel?.id ?? null
    const shaft = memberId ? shaftByMember.get(memberId) : null
    const sourceMotorId = shaft?.sourceMotorId ?? null
    return { ...wheel, memberId, shaftId: shaft?.id ?? null, sourceMotorId, driven: Boolean(sourceMotorId) }
  })
  const motorIds = [...new Set(resolved.map(wheel => wheel.sourceMotorId).filter(Boolean))]
  const driven = resolved.filter(wheel => wheel.driven)
  const axleRoles = new Set(driven.map(wheel => wheel.axle).filter(Boolean))
  let layout = 'FREE'
  if (axleRoles.has('front') && axleRoles.has('rear')) layout = 'AWD'
  else if (axleRoles.has('front')) layout = 'FWD'
  else if (axleRoles.has('rear')) layout = 'RWD'
  else if (driven.length) layout = 'MULTI'
  return { wheels: resolved, motorIds, drivenWheelCount: driven.length, layout }
}

export function classifyWheelAxles(wheels = []) {
  const valid = wheels.filter(w => Number.isFinite(w?.x) && Number.isFinite(w?.z))
  if (!valid.length) return { wheelbase: 0, track: 0, centerX: 0, centerZ: 0, wheels: [] }
  const minX = Math.min(...valid.map(w => w.x))
  const maxX = Math.max(...valid.map(w => w.x))
  const minZ = Math.min(...valid.map(w => w.z))
  const maxZ = Math.max(...valid.map(w => w.z))
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  const wheelbase = Math.max(0, maxZ - minZ)
  const track = Math.max(0, maxX - minX)
  const axleTolerance = Math.max(0.08 * wheelbase, 0.002)
  return {
    wheelbase, track, centerX, centerZ,
    wheels: valid.map(wheel => ({
      ...wheel,
      side: wheel.x < centerX ? 'left' : 'right',
      axle: wheel.z >= maxZ - axleTolerance ? 'front' : wheel.z <= minZ + axleTolerance ? 'rear' : 'middle',
    })),
  }
}
