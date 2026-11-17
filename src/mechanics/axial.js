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
  'hinge-pin:detent-hinge': { rotation: 'detented' },
  'stud:anti-stud': { rotation: 'fixed', seat: true },
  'stud:bearing': { rotation: 'continuous', seat: true },
  'axle-pin:bearing': { rotation: 'continuous' },
  'friction-axle-pin:bearing': { rotation: 'continuous', friction: true },
  'axle-pin:key': { rotation: 'locked' },
  'friction-axle-pin:key': { rotation: 'locked' },
  'axle-pin:blind-key': { rotation: 'locked' },
  'friction-axle-pin:blind-key': { rotation: 'locked' },
  'axle-pin:bush': { rotation: 'locked' },
  'friction-axle-pin:bush': { rotation: 'locked' },
  'duplo-axle:duplo-key': { rotation: 'locked', translation: true },
  'duplo-axle:duplo-bearing': { rotation: 'continuous', translation: true },
  'duplo-pin:duplo-bearing': { rotation: 'continuous' },
  'duplo-stud:duplo-anti-stud': { rotation: 'fixed', seat: true },
  'stud-pin:hollow-stud': { rotation: 'fixed', seat: true },
  'rod:hollow-stud': { rotation: 'continuous', translation: true },
  'wheel-spindle:wheel-bearing': { rotation: 'continuous' },
  'wheel-spindle:rod-bore': { rotation: 'continuous' },
  'rod:wheel-bearing': { rotation: 'continuous' },
  'labeled-pin:labeled-bore': { rotation: 'continuous', group: true },
  'rod:rod-bore': { rotation: 'continuous', translation: true },
}

export function connectionMode(male, female) {
  if (male?.gender !== 'M' || female?.gender !== 'F') return undefined
  if (male.role === 'rim-seat' && female.role === 'tyre-seat') {
    const mate = male.mates?.[female.design]
    return mate && { rotation: 'locked', rimSeat: mate }
  }
  const family = `${male.role}:${female.role}`
  if (family === 'clutch-driver:clutch-face' &&
      Math.abs(male.sections[0].radius - female.sections[0].radius) <= RADIUS_TOLERANCE) {
    return { rotation: 'locked', clutch: true }
  }
  if (family === 'rod:tube-end' && male.pneumatic) return { rotation: 'fixed', tube: true }
  if (family === 'ball:ball-socket' && male.group === female.group &&
      Math.abs(male.sections[0].radius - female.sections[0].radius) <= RADIUS_TOLERANCE) {
    return { rotation: 'ball', anchor: 'sphere' }
  }
  if (family === 'pivot:clip' && male.group === female.group &&
      Math.abs(male.sections[0].radius - female.sections[0].radius) <= RADIUS_TOLERANCE &&
      Math.abs(portLength(male) - portLength(female)) <= .05) {
    return { rotation: 'continuous', anchor: 'pivot' }
  }
  if (family === 'plug:receptacle' && male.group && male.group === female.group) {
    const coupled = male.group === 'techWhlCon1' || male.group.endsWith(':differential-ring')
    return { rotation: coupled ? 'locked' : 'fixed', anchor: 'keyed' }
  }
  const mode = MOTION[family]
  if (mode?.group && (!male.group || male.group !== female.group)) return undefined
  return mode
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
      male.radius <= female.radius + 0.5) return 'clear'
  // A wider round counterbore may clear a shaft without supporting it.
  const different = male.radius - female.radius
  if (male.shape === 'K' && female.shape === 'K' && Math.abs(different) <= RADIUS_TOLERANCE) return 'contact'
  if (different > RADIUS_TOLERANCE) return 'blocked'
  if (female.shape === 'S' && different < -RADIUS_TOLERANCE) return 'clear'
  if (male.shape === 'R' && female.shape === 'S' && Math.abs(different) <= RADIUS_TOLERANCE) return 'contact'
  if (male.shape === 'R' && female.shape === 'A' && different < -RADIUS_TOLERANCE) return 'clear'
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

export function nearestDetent(detents, angle) {
  const distance = detent => Math.abs(Math.sin((angle - detent) / 2))
  return detents.reduce((best, candidate) => distance(candidate) < distance(best) ? candidate : best)
}

export function evaluateInsertion(male, female, { offset, direction = 1, side = 'start', roll = 0 } = {}, { seated = false } = {}) {
  if (male?.gender !== 'M' || female?.gender !== 'F') return { ok: false, reason: 'connector-role' }
  const mode = connectionMode(male, female)
  if (!mode) return { ok: false, reason: 'incompatible-family' }
  if (!Number.isFinite(offset) || !Number.isFinite(roll) || ![1, -1].includes(direction) ||
      !['start', 'end'].includes(side)) return { ok: false, reason: 'invalid-placement' }
  if (mode.rotation === 'detented' &&
      (!Array.isArray(female.detents) || !female.detents.length || !female.detents.every(Number.isFinite))) {
    return { ok: false, reason: 'missing-detents' }
  }
  if (!female.openings.includes(side)) return { ok: false, reason: 'closed-entry' }
  if (mode.anchor || mode.rimSeat) {
    const [seat, orientation] = mode.rimSeat ?? [0, mode.anchor === 'pivot' ? direction : 1]
    if (orientation !== direction || Math.abs(offset - seat) > .01) return { ok: false, reason: 'seat-alignment' }
    const keyStep = mode.anchor === 'keyed' ? Math.PI * 2 : null
    return {
      ok: true,
      occupancy: { shaft: [0, portLength(male)], socket: [0, portLength(female)] },
      motion: { rotation: mode.rotation, friction: false, detents: [], travel: [0, 0] },
      placement: { offset, direction, side, roll: keyStep ? 0 : roll, keyStep, ...(mode.anchor && { anchor: mode.anchor }) },
    }
  }
  if (mode.clutch && (direction !== -1 || side !== 'start' ||
      Math.abs(offset - Math.min(portLength(male), portLength(female))) > .01)) {
    return { ok: false, reason: 'clutch-seat' }
  }
  if (mode.tube) {
    if (side !== 'start' || direction !== 1 || Math.abs(offset) > EPSILON) return { ok: false, reason: 'tube-seat' }
    // The rubber tube's 3 LDU opening expands over the nominal 4 LDU pneumatic nipple.
    female = { ...female, sections: female.sections.map(section => ({ ...section, radius: 4 })) }
  }
  if (!mode.seat && mode.rotation !== 'detented' && !male.openings.includes((side === 'start') === (direction > 0) ? 'end' : 'start')) {
    return { ok: false, reason: 'closed-tip' }
  }
  if (mode.seat && (direction !== (side === 'start' ? 1 : -1) ||
      Math.abs(offset - (side === 'start' ? 0 : portLength(female))) > EPSILON)) {
    return { ok: false, reason: 'stud-seat' }
  }
  if (mode.rotation === 'detented' && female.seat !== undefined && Math.abs(offset - female.seat) > EPSILON) {
    return { ok: false, reason: 'hinge-seat' }
  }

  const fit = fitAt(male, female, offset, direction)
  if (fit.reason || fit.engagement + EPSILON < MIN_ENGAGEMENT) {
    return { ok: false, reason: fit.reason ?? 'insufficient-engagement' }
  }
  const events = breakpoints(male, female, direction)
  const pathBlocked = !seated && sweep(male, female, offset, direction, side, events)
  if (pathBlocked) return { ok: false, reason: pathBlocked }

  const detents = mode.rotation === 'detented' ? [...female.detents] : []
  const keyStep = !mode.tube && ['locked', 'fixed'].includes(mode.rotation) ? Math.PI / 2 : null
  const snappedRoll = detents.length ? nearestDetent(detents, roll)
    : keyStep === null ? roll : Math.round(roll / keyStep) * keyStep
  const [low, high] = fit.interval.map(point => (point - offset) * direction).sort((a, b) => a - b)
  return {
    ok: true,
    occupancy: { shaft: [low, high], socket: fit.interval },
    motion: {
      rotation: mode.rotation,
      friction: mode.friction ?? false,
      detents,
      travel: mode.translation
        ? [-1, 1].map(sign => travelLimit(male, female, offset, direction, events, sign) - offset)
        : [0, 0],
    },
    placement: { offset, direction, side, roll: snappedRoll, keyStep, ...(detents.length ? { detents } : {}) },
  }
}
