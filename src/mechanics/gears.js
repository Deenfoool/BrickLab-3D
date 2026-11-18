import { dot, isVector, length, scale, subtract, unit } from './vector.js'

const AXIS_TOLERANCE = 0.01
const DISTANCE_TOLERANCE = 0.5
const MODULE_TOLERANCE = 0.001

// Kinebrick and Sim Studio both detect spur meshes from axis, width and pitch geometry.
// The ratio here is signed in the two supplied local axis conventions.
export function evaluateSpurMesh(a, b) {
  const axisA = unit(a.axis)
  const axisB = unit(b.axis)
  if (!axisA || !axisB || !isVector(a.center) || !isVector(b.center)) {
    return { ok: false, reason: 'invalid-gear-pose' }
  }
  if (![a, b].every(gear => Number.isSafeInteger(gear.teeth) && gear.teeth > 0 &&
      Number.isFinite(gear.radius) && gear.radius > 0 && Number.isFinite(gear.width) && gear.width > 0)) {
    return { ok: false, reason: 'invalid-gear-profile' }
  }
  if (Math.abs(2 * a.radius / a.teeth - 2 * b.radius / b.teeth) > MODULE_TOLERANCE) {
    return { ok: false, reason: 'tooth-pitch' }
  }
  const alignment = dot(axisA, axisB)
  if (1 - Math.abs(alignment) > AXIS_TOLERANCE ** 2 / 2) {
    return { ok: false, reason: 'non-parallel-axes' }
  }
  const centerDelta = subtract(b.center, a.center)
  const axial = dot(centerDelta, axisA)
  const widthOverlap = Math.min(a.width / 2, axial + b.width / 2) -
    Math.max(-a.width / 2, axial - b.width / 2)
  if (widthOverlap <= 0) return { ok: false, reason: 'no-tooth-overlap' }
  const distance = length(subtract(centerDelta, scale(axisA, axial)))
  const clearance = distance - a.radius - b.radius
  if (clearance < -DISTANCE_TOLERANCE) return { ok: false, reason: 'pitch-distance' }
  if (clearance > DISTANCE_TOLERANCE) {
    if (!a.pressureAngle || a.pressureAngle !== b.pressureAngle) return { ok: false, reason: 'pitch-distance' }
    // Approximate standard full-depth involute teeth. Require at least one pair in contact throughout a turn.
    const module = 2 * a.radius / a.teeth
    const cosine = Math.cos(a.pressureAngle)
    const flank = gear => Math.sqrt((gear.radius + module) ** 2 - (gear.radius * cosine) ** 2)
    const tangent = Math.sqrt(distance ** 2 - ((a.radius + b.radius) * cosine) ** 2)
    if (flank(a) + flank(b) - tangent < Math.PI * module * cosine) return { ok: false, reason: 'pitch-distance' }
  }
  return { ok: true, ratio: -Math.sign(alignment) * a.teeth / b.teeth }
}
