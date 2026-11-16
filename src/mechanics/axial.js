// Section matching follows Kinebrick fits.ts. The supported motion combinations
// follow Sim Studio's connector modes. See docs/upstream.md.
const EPSILON = 1e-6
const RADIUS_TOLERANCE = 0.05
const MIN_ENGAGEMENT = 1

const MOTION = {
  'axle:bearing': { rotation: 'continuous', translation: true },
  'axle:key': { rotation: 'locked', translation: true },
  'axle:blind-key': { rotation: 'locked', translation: true },
  'axle:bush': { rotation: 'locked', translation: false },
  'pin:bearing': { rotation: 'continuous', translation: false },
  'friction-pin:bearing': { rotation: 'continuous', translation: false, friction: true },
  'shaft:detent-hinge': { rotation: 'detented', translation: false },
}

export const overlap = (a, b) => Math.min(a[1], b[1]) - Math.max(a[0], b[0])

function profile(port, origin = 0, direction = 1) {
  let start = origin
  return port.sections.map(section => {
    const end = start + direction * section.length
    const interval = direction > 0 ? [start, end] : [end, start]
    start = end
    return { ...section, interval }
  })
}

export const portLength = port => port.sections.reduce((sum, section) => sum + section.length, 0)

function sectionFit(male, female) {
  // A compliant pin lip can deflect through the normal pin bore.
  if (male.shape === 'L' && female.shape === 'R' &&
      female.radius >= 6 - RADIUS_TOLERANCE && male.radius <= female.radius + 0.5) return 'clear'
  // A wider round counterbore may clear a shaft without supporting it.
  const different = male.radius - female.radius
  if (different > RADIUS_TOLERANCE) return 'blocked'
  if (male.shape === 'A' && female.shape === 'A') {
    return Math.abs(different) <= RADIUS_TOLERANCE ? 'contact' : 'clear'
  }
  if (female.shape === 'R' && (male.shape === 'A' || male.shape === 'R')) {
    return Math.abs(different) <= RADIUS_TOLERANCE ? 'contact' : 'clear'
  }
  return 'blocked'
}

function fitAt(male, female, offset, direction) {
  const size = portLength(female)
  const maleSections = profile(male, offset, direction)
  const low = Math.min(...maleSections.map(section => section.interval[0]))
  const high = Math.max(...maleSections.map(section => section.interval[1]))
  if ((!female.openings.includes('start') && low < -EPSILON) ||
      (!female.openings.includes('end') && high > size + EPSILON)) {
    return { reason: 'closed-end' }
  }

  let engagement = 0
  const femaleSections = profile(female)
  for (const m of maleSections) {
    for (const f of femaleSections) {
      const amount = overlap(m.interval, f.interval)
      if (amount <= EPSILON) continue
      const fit = sectionFit(m, f)
      if (fit === 'blocked') return { reason: 'profile-interference' }
      if (fit === 'contact') engagement += amount
    }
  }
  return { engagement, interval: [Math.max(0, low), Math.min(size, high)] }
}

function breakpoints(male, female, direction) {
  const ends = sections => [...new Set(sections.flatMap(section => section.interval))]
  return [...new Set(ends(profile(female)).flatMap(f =>
    ends(profile(male, 0, direction)).map(m => f - m)))].sort((a, b) => a - b)
}

function sweep(male, female, offset, direction, side, events) {
  // Between consecutive section crossings the set of overlapping sections is constant.
  const intervals = [...events.filter(point => side === 'start' ? point < offset : point > offset), offset]
    .sort((a, b) => side === 'start' ? a - b : b - a)
  for (let i = 1; i < intervals.length; i++) {
    const middle = (intervals[i - 1] + intervals[i]) / 2
    const fit = fitAt(male, female, middle, direction)
    if (fit.reason) return fit.reason
  }
  return null
}

function travelLimit(male, female, offset, direction, events, sign) {
  const stops = events.filter(point => sign * (point - offset) > EPSILON)
  if (sign < 0) stops.reverse()
  let current = offset
  let currentEngagement = fitAt(male, female, current, direction).engagement
  for (const next of stops) {
    const atMiddle = fitAt(male, female, (current + next) / 2, direction)
    if (atMiddle.reason) break
    const atNext = fitAt(male, female, next, direction)
    if (atNext.reason) break
    if (atNext.engagement < MIN_ENGAGEMENT) {
      return current + (next - current) * (currentEngagement - MIN_ENGAGEMENT) /
        (currentEngagement - atNext.engagement)
    }
    current = next
    currentEngagement = atNext.engagement
  }
  return current
}

export function evaluateInsertion(male, female, { offset, direction = 1, side = 'start', roll = 0 } = {}) {
  if (male?.gender !== 'M' || female?.gender !== 'F') return { ok: false, reason: 'connector-role' }
  const mode = MOTION[`${male.role}:${female.role}`]
  if (!mode) return { ok: false, reason: 'incompatible-family' }
  if (!Number.isFinite(offset) || !Number.isFinite(roll) || ![1, -1].includes(direction) ||
      !['start', 'end'].includes(side)) return { ok: false, reason: 'invalid-placement' }
  if (mode.rotation === 'detented' &&
      (!Array.isArray(female.detents) || !female.detents.length || !female.detents.every(Number.isFinite))) {
    return { ok: false, reason: 'missing-detents' }
  }
  if (!female.openings.includes(side)) return { ok: false, reason: 'closed-entry' }

  const fit = fitAt(male, female, offset, direction)
  if (fit.reason || fit.engagement < MIN_ENGAGEMENT) {
    return { ok: false, reason: fit.reason ?? 'insufficient-engagement' }
  }
  const events = breakpoints(male, female, direction)
  const pathBlocked = sweep(male, female, offset, direction, side, events)
  if (pathBlocked) return { ok: false, reason: pathBlocked }

  const keyStep = mode.rotation === 'locked' ? Math.PI / 2 : null
  const snappedRoll = keyStep === null ? roll : Math.round(roll / keyStep) * keyStep
  const [low, high] = fit.interval.map(point => (point - offset) * direction).sort((a, b) => a - b)
  return {
    ok: true,
    occupancy: { shaft: [low, high], socket: fit.interval },
    motion: {
      rotation: mode.rotation,
      friction: mode.friction ?? false,
      detents: mode.rotation === 'detented' ? [...(female.detents ?? [])] : [],
      travel: mode.translation
        ? [-1, 1].map(sign => travelLimit(male, female, offset, direction, events, sign) - offset)
        : [0, 0],
    },
    placement: { offset, direction, side, roll: snappedRoll, keyStep },
  }
}
