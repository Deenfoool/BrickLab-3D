export const PARTS5_GEOMETRY_VERSION = 'parts-5-geometry-metrics-v1'

export const TECHNIC_METRICS = Object.freeze({
  studPitch: 1,
  brickHeight: 1.2,
  beamHeight: 0.90,
  beamDepth: 0.78,
  thinBeamDepth: 0.40,
  pinHoleRadius: 0.245,
  axleRadius: 0.18,
  axleArm: 0.074,
  pinRadius: 0.17,
  pinCollarRadius: 0.265,
})

// BrickLab already used pitchRadius = teeth / 16. Express that relationship as
// an actual module so visual teeth, editor mesh snap and drivetrain metadata can
// all derive from the same value instead of carrying independent magic numbers.
export const GEAR_MODULE_STUD = 1 / 8
export const GEAR_PRESSURE_ANGLE_DEG = 20
export const GEAR_THICKNESS_STUD = 0.36

export function gearPitchRadius(teeth) {
  const count = Math.max(1, Number(teeth) || 1)
  return count * GEAR_MODULE_STUD / 2
}

export function gearMetrics(teeth, kind = 'spur') {
  const count = Math.max(1, Number(teeth) || 1)
  const pitchRadius = gearPitchRadius(count)
  const addendum = GEAR_MODULE_STUD * 0.92
  const dedendum = GEAR_MODULE_STUD * 1.08
  const outerRadius = pitchRadius + addendum
  const rootRadius = Math.max(0.26, pitchRadius - dedendum)
  const baseRadius = Math.max(rootRadius, pitchRadius * Math.cos(GEAR_PRESSURE_ANGLE_DEG * Math.PI / 180))
  return Object.freeze({
    kind,
    teeth: count,
    module: GEAR_MODULE_STUD,
    pressureAngleDeg: GEAR_PRESSURE_ANGLE_DEG,
    pitchRadius,
    addendum,
    dedendum,
    outerRadius,
    rootRadius,
    baseRadius,
    thickness: kind === 'bevel' ? 0.42 : GEAR_THICKNESS_STUD,
    toothAngle: Math.PI * 2 / count,
  })
}

// The current catalog has one intended 12T/20T bevel family. These pitch-cone
// angles are complementary for that pair and are visual metadata only; the
// authoritative mesh apex still comes from pitch radii and shaft axes.
export function bevelPitchConeAngle(teeth) {
  const count = Number(teeth) || 0
  if (count === 12) return Math.atan(12 / 20)
  if (count === 20) return Math.atan(20 / 12)
  return Math.PI / 4
}

const WHEEL_STYLES = Object.freeze({
  wheel: { family: 'offroad', rimRatio: 0.49, lugRatio: 0.060, treadCount: 26, spokes: 6 },
  'wheel-small': { family: 'road', rimRatio: 0.55, lugRatio: 0.026, treadCount: 38, spokes: 5 },
  'wheel-medium': { family: 'offroad', rimRatio: 0.50, lugRatio: 0.055, treadCount: 24, spokes: 6 },
  'wheel-road': { family: 'road', rimRatio: 0.57, lugRatio: 0.024, treadCount: 42, spokes: 7 },
  'wheel-narrow': { family: 'narrow', rimRatio: 0.58, lugRatio: 0.020, treadCount: 40, spokes: 5 },
  'wheel-offroad-large': { family: 'offroad', rimRatio: 0.47, lugRatio: 0.070, treadCount: 24, spokes: 6 },
  'wheel-tractor': { family: 'tractor', rimRatio: 0.43, lugRatio: 0.105, treadCount: 16, spokes: 8 },
})

export function wheelStyle(partId) {
  return WHEEL_STYLES[partId] ?? { family: 'road', rimRatio: 0.54, lugRatio: 0.025, treadCount: 36, spokes: 6 }
}

export function wheelMetrics(part) {
  const wheel = part?.mechanics?.wheel ?? {}
  const radius = Math.max(0.2, Number(wheel.radius ?? part?.dimensions?.radiusStud ?? 1))
  const width = Math.max(0.18, Number(wheel.width ?? part?.dimensions?.widthStud ?? 0.62))
  const style = wheelStyle(part?.id)
  const lugHeight = Math.max(0.018, radius * style.lugRatio)
  const carcassRadius = Math.max(0.16, radius - lugHeight * 0.72)
  const rimOuterRadius = Math.max(0.24, radius * style.rimRatio)
  const beadRadius = Math.max(0.22, rimOuterRadius * 0.97)
  return Object.freeze({
    ...style,
    radius,
    width,
    lugHeight,
    carcassRadius,
    rimOuterRadius,
    beadRadius,
    hubRadius: Math.max(0.24, Math.min(rimOuterRadius * 0.42, radius * 0.20)),
  })
}

export const PARTS5_WHEEL_STYLES = WHEEL_STYLES
