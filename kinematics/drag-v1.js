export const KINEMATICS_DRAG_VERSION = 'kinematics-drag-v1.0.0'

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
