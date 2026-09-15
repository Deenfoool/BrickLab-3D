export const TECHNIC_TRANSMISSION_MATH_VERSION = 'technic-transmission-math-v1.0.0'

const TAU = Math.PI * 2
const finitePositive = value => Number.isFinite(Number(value)) && Number(value) > 0
const sign = value => Number(value) < 0 ? -1 : 1

export function pitchRadiusStuds(teeth) {
  const count = Number(teeth)
  return finitePositive(count) ? count / 16 : null
}

export function spurCenterDistanceStuds(teethA, teethB) {
  const a = pitchRadiusStuds(teethA)
  const b = pitchRadiusStuds(teethB)
  return a == null || b == null ? null : a + b
}

export function externalGearRatio(driverTeeth, drivenTeeth) {
  const a = Number(driverTeeth), b = Number(drivenTeeth)
  return finitePositive(a) && finitePositive(b) ? -a / b : null
}

export function internalGearRatio(driverTeeth, drivenTeeth) {
  const a = Number(driverTeeth), b = Number(drivenTeeth)
  return finitePositive(a) && finitePositive(b) ? a / b : null
}

export function bevelGearRatio(driverTeeth, drivenTeeth, directionSign = -1) {
  const a = Number(driverTeeth), b = Number(drivenTeeth)
  return finitePositive(a) && finitePositive(b) ? sign(directionSign) * a / b : null
}

export function wormGearRatio({ starts = 1, wheelTeeth, directionSign = -1 } = {}) {
  const s = Number(starts), t = Number(wheelTeeth)
  return finitePositive(s) && finitePositive(t) ? sign(directionSign) * s / t : null
}

export function rackTravelStuds(pinionTeeth, angleRadians) {
  const radius = pitchRadiusStuds(pinionTeeth)
  const angle = Number(angleRadians)
  return radius == null || !Number.isFinite(angle) ? null : radius * angle
}

export function rackTravelPerTurnStuds(pinionTeeth) {
  const radius = pitchRadiusStuds(pinionTeeth)
  return radius == null ? null : TAU * radius
}

export function chainSprocketRatio(driverTeeth, drivenTeeth, { crossed = false } = {}) {
  const a = Number(driverTeeth), b = Number(drivenTeeth)
  if (!finitePositive(a) || !finitePositive(b)) return null
  return (crossed ? -1 : 1) * a / b
}

export function pulleyBeltRatio(driverRadius, drivenRadius, { crossed = false } = {}) {
  const a = Number(driverRadius), b = Number(drivenRadius)
  if (!finitePositive(a) || !finitePositive(b)) return null
  return (crossed ? -1 : 1) * a / b
}

export function differentialCarrierSpeed(leftSpeed, rightSpeed) {
  const left = Number(leftSpeed), right = Number(rightSpeed)
  return Number.isFinite(left) && Number.isFinite(right) ? (left + right) / 2 : null
}

export function differentialOtherOutput(carrierSpeed, knownOutputSpeed) {
  const carrier = Number(carrierSpeed), known = Number(knownOutputSpeed)
  return Number.isFinite(carrier) && Number.isFinite(known) ? 2 * carrier - known : null
}

export function universalJointOutputAngle(inputAngleRadians, jointAngleRadians) {
  const input = Number(inputAngleRadians), joint = Number(jointAngleRadians)
  if (!Number.isFinite(input) || !Number.isFinite(joint)) return null
  const c = Math.cos(joint)
  return Math.atan2(c * Math.sin(input), Math.cos(input))
}

export function universalJointInstantaneousRatio(inputAngleRadians, jointAngleRadians) {
  const input = Number(inputAngleRadians), joint = Number(jointAngleRadians)
  if (!Number.isFinite(input) || !Number.isFinite(joint)) return null
  const c = Math.cos(joint)
  const s = Math.sin(joint)
  const denominator = 1 - s * s * Math.sin(input) * Math.sin(input)
  return Math.abs(denominator) < 1e-9 ? null : c / denominator
}

export function cvJointRatio() { return 1 }

export function compoundRatio(stages = []) {
  let ratio = 1
  for (const stage of stages) {
    const value = Number(stage)
    if (!Number.isFinite(value)) return null
    ratio *= value
  }
  return ratio
}
