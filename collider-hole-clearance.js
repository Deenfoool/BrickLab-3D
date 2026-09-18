// Pure physical profile derivation; catalog and visual metadata remain immutable.
export const TECHNIC_COLLIDER_HOLE_CLEARANCE_STUD=0.3125
const AXES=['x','y','z']
const AXIS_INDEX={x:0,y:1,z:2}
const MIN_BOX=0.035
const CARDINAL_MIN=0.90
const OFF_AXIS_MAX=0.18
function cardinalAxis(axis) {
  if (!Array.isArray(axis) || axis.length !== 3 || !axis.every(Number.isFinite)) return null
  const absolute = axis.map(value => Math.abs(value))
  let index = 0
  if (absolute[1] > absolute[index]) index = 1
  if (absolute[2] > absolute[index]) index = 2
  if (absolute[index] < CARDINAL_MIN) return null
  if (absolute.some((value, candidate) => candidate !== index && value > OFF_AXIS_MAX)) return null
  return AXES[index]
}

function pinHoleEvidence(part) {
  return (part?.connectors ?? [])
    .filter(connector => connector?.type === 'pin-hole')
    .map(connector => ({
      position: Array.isArray(connector.position) ? [...connector.position] : null,
      axis: cardinalAxis(connector.axis),
    }))
    .filter(hole => hole.axis && hole.position?.length === 3 && hole.position.every(Number.isFinite))
}

function boxRanges(spec) {
  if (spec?.type !== 'box' || !Array.isArray(spec.center) || !Array.isArray(spec.size)) return null
  if (spec.center.length !== 3 || spec.size.length !== 3) return null
  if (!spec.center.every(Number.isFinite) || !spec.size.every(value => Number.isFinite(value) && value > 0)) return null
  return Object.fromEntries(AXES.map((axis, index) => [
    axis,
    [spec.center[index] - spec.size[index] / 2, spec.center[index] + spec.size[index] / 2],
  ]))
}

function boxFromRanges(ranges) {
  const size = AXES.map(axis => ranges[axis][1] - ranges[axis][0])
  if (size.some(value => value < MIN_BOX)) return null
  return {
    type: 'box',
    center: AXES.map(axis => (ranges[axis][0] + ranges[axis][1]) / 2),
    size,
  }
}

function cloneRanges(ranges) {
  return Object.fromEntries(AXES.map(axis => [axis, [...ranges[axis]]]))
}

// PARTS-5 explicit hole proxies predate the current safe Technic clearance. Instead
// of throwing those carefully authored compound profiles away, subtract a conservative
// square tunnel around every verified pin-hole axis. The square is intentionally a
// little larger than the round 4.8 mm bore so Rapier never starts a valid snapped pin
// in penetration because of collider approximation.
export function carveExplicitBoxAroundPinHole(spec, hole, clearance = TECHNIC_COLLIDER_HOLE_CLEARANCE_STUD) {
  const ranges = boxRanges(spec)
  const holeAxis = hole?.axis
  const holePosition = hole?.position
  if (!ranges || !AXIS_INDEX.hasOwnProperty(holeAxis) || !Array.isArray(holePosition)) return [spec]

  const plane = AXES.filter(axis => axis !== holeAxis)
  const a = plane[0]
  const b = plane[1]
  const ai = AXIS_INDEX[a]
  const bi = AXIS_INDEX[b]
  const cutA = [holePosition[ai] - clearance, holePosition[ai] + clearance]
  const cutB = [holePosition[bi] - clearance, holePosition[bi] + clearance]
  const overlapA = [Math.max(ranges[a][0], cutA[0]), Math.min(ranges[a][1], cutA[1])]
  const overlapB = [Math.max(ranges[b][0], cutB[0]), Math.min(ranges[b][1], cutB[1])]
  if (overlapA[1] <= overlapA[0] || overlapB[1] <= overlapB[0]) return [spec]

  const pieces = []
  const push = candidate => {
    const box = boxFromRanges(candidate)
    if (box) pieces.push(box)
  }

  const lowA = cloneRanges(ranges)
  lowA[a] = [ranges[a][0], overlapA[0]]
  push(lowA)
  const highA = cloneRanges(ranges)
  highA[a] = [overlapA[1], ranges[a][1]]
  push(highA)

  const lowB = cloneRanges(ranges)
  lowB[a] = [...overlapA]
  lowB[b] = [ranges[b][0], overlapB[0]]
  push(lowB)
  const highB = cloneRanges(ranges)
  highB[a] = [...overlapA]
  highB[b] = [overlapB[1], ranges[b][1]]
  push(highB)

  return pieces
}

export function explicitPinHoleClearanceProfile(part) {
  const profile = part?.physics?.colliderProfile
  const sourceVersion = String(profile?.version ?? '')
  if (!profile || !Array.isArray(profile.specs) || !profile.specs.length) return profile
  if (!sourceVersion.startsWith('parts-5-explicit-v1')) return profile
  // Suspension has a deliberate physical pivot pin through its root eye; keep that
  // specialized profile untouched rather than turning the pivot itself into air.
  if (part?.mechanics?.suspensionArm) return profile

  const holes = pinHoleEvidence(part)
  if (!holes.length) return profile

  let specs = profile.specs.map(spec => ({ ...spec, center: Array.isArray(spec.center) ? [...spec.center] : spec.center, size: Array.isArray(spec.size) ? [...spec.size] : spec.size }))
  for (const hole of holes) {
    specs = specs.flatMap(spec => spec?.type === 'box'
      ? carveExplicitBoxAroundPinHole(spec, hole)
      : [spec])
  }
  if (!specs.length) return profile

  return {
    ...profile,
    version: 'parts-6-explicit-hole-clearance-v1',
    sourceVersion,
    holeClearanceStud: TECHNIC_COLLIDER_HOLE_CLEARANCE_STUD,
    specs,
  }
}

