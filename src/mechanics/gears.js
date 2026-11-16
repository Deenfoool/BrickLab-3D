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
  if (Math.abs(distance - a.radius - b.radius) > DISTANCE_TOLERANCE) {
    return { ok: false, reason: 'pitch-distance' }
  }
  return { ok: true, ratio: -Math.sign(alignment) * a.teeth / b.teeth }
}
