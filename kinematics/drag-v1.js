export const KINEMATICS_DRAG_VERSION = 'kinematics-drag-v1.1.0'

export function normalizePointerAngleDelta(radians) {
  let value = Number(radians) || 0
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

export function circularDragDegrees(previousAngle, currentAngle, viewSign = 1) {
  const sign = Number(viewSign) < 0 ? -1 : 1
  // Screen Y grows downwards, so negate the screen-space polar delta to preserve
  // the right-hand rotation direction for an axis pointing towards the camera.
  return -normalizePointerAngleDelta(currentAngle - previousAngle) * 180 / Math.PI * sign
}

export function linearDragDegrees(deltaX, deltaY, viewSign = 1, degreesPerPixel = .65) {
  const sign = Number(viewSign) < 0 ? -1 : 1
  const dominant = Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : -deltaY
  return dominant * degreesPerPixel * sign
}

export function angularVelocityFromDelta(deltaDegrees, deltaMilliseconds, previous = 0, smoothing = .42, maxAbs = 1440) {
  const dt = Math.max(1, Number(deltaMilliseconds) || 0) / 1000
  const instant = (Number(deltaDegrees) || 0) / dt
  const blend = Math.max(0, Math.min(1, Number(smoothing) || 0))
  const next = (Number(previous) || 0) * (1 - blend) + instant * blend
  const limit = Math.max(1, Math.abs(Number(maxAbs) || 1440))
  return Math.max(-limit, Math.min(limit, next))
}

export function decayAngularVelocity(velocityDegreesPerSecond, deltaSeconds, damping = 2.65) {
  const velocity = Number(velocityDegreesPerSecond) || 0
  const dt = Math.max(0, Number(deltaSeconds) || 0)
  const drag = Math.max(0, Number(damping) || 0)
  return velocity * Math.exp(-drag * dt)
}
