import { axialSpanV4 } from './schema-v4.js?v=connector-v4-20260910-v1'
import { MATCHER_TOLERANCES_V4 } from './matcher-v4.js?v=connector-v4-20260910-v1'

export const AXIAL_FIT_VERSION_V4 = 'axial-fit-v4.0.0'
export const MIN_ENGAGEMENT_LDU_V4 = 0.5
const EPS = 1e-6

function rigidShape(section) {
  return section?.shape === '_L' || section?.shape === 'L_' ? 'R' : section?.shape
}

function sectionCompatible(male, female) {
  if (!male || !female) return false
  if (male.radiusLdu > female.radiusLdu + MATCHER_TOLERANCES_V4.radiusLdu) return false
  const m = rigidShape(male)
  const f = rigidShape(female)
  if (m === 'R') return f === 'R' || f === 'S'
  if (m === 'A') return f === 'A' || f === 'R'
  if (m === 'S') return f === 'S' || f === 'R'
  return false
}

// A clip is an open round female interval, not a zero-length snap point.
export function axialConnectorV4(connector) {
  if (connector?.family !== 'clip') return connector
  return {...connector, family:'cylinder', gender:'female', geometry:{
    sections:[{shape:'R',radiusLdu:connector.geometry.radiusLdu,lengthLdu:connector.geometry.lengthLdu}],
    centered:connector.geometry.centered, caps:'none',
  }}
}

function connectorSegments(connector) {
  if (connector?.family !== 'cylinder') return []
  const [spanStart] = axialSpanV4(connector)
  let cursor = spanStart
  return (connector.geometry?.sections ?? []).map((section, index) => {
    const start = cursor
    const end = cursor + section.lengthLdu
    cursor = end
    const adjacent = connector.geometry.sections[index + (section.shape === 'L_' ? 1 : -1)]
    // Elastic extensions compress only to the referenced neighbouring section.
    const compressed = ['L_','_L'].includes(section.shape) && adjacent && !['L_','_L'].includes(adjacent.shape)
    return { ...section, ...(compressed ? {shape:adjacent.shape,radiusLdu:Math.min(section.radiusLdu,adjacent.radiusLdu)} : {}), index, start, end }
  })
}

function normalizedCaps(connector) {
  const caps = String(connector?.geometry?.caps || 'one').trim().toLowerCase()
  if (caps === 'none') return { a:false, b:false }
  if (caps === 'two') return { a:true, b:true }
  if (caps === 'a') return { a:true, b:false }
  if (caps === 'b') return { a:false, b:true }
  // LDCad "one": male closes A (bottom), female closes B (top).
  return connector?.gender === 'female' ? { a:false, b:true } : { a:true, b:false }
}

function maleFemale(a, b) {
  if (a?.gender === 'male' && b?.gender === 'female') return { male:a, female:b, movingIsMale:true }
  if (b?.gender === 'male' && a?.gender === 'female') return { male:b, female:a, movingIsMale:false }
  return null
}

function pairBreakpoints(maleSegments, femaleSegments) {
  const points = new Set()
  for (const m of maleSegments) {
    for (const f of femaleSegments) {
      points.add(f.start - m.start)
      points.add(f.start - m.end)
      points.add(f.end - m.start)
      points.add(f.end - m.end)
    }
  }
  return [...points].filter(Number.isFinite).sort((a,b) => a-b)
}

function overlapLength(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1,b1) - Math.max(a0,b0))
}

function femaleCapAllows(maleSpan, femaleSpan, femaleCaps) {
  if (femaleCaps.a && maleSpan[0] < femaleSpan[0] - EPS) return false
  if (femaleCaps.b && maleSpan[1] > femaleSpan[1] + EPS) return false
  return true
}

function evaluateMaleOffset(male, female, offsetLdu) {
  const maleSegments = connectorSegments(male)
  const femaleSegments = connectorSegments(female)
  if (!maleSegments.length || !femaleSegments.length) return { valid:false, engagementLdu:0, reason:'missing-segments' }

  const maleSpan0 = axialSpanV4(male)
  const femaleSpan = axialSpanV4(female)
  const maleSpan = [maleSpan0[0] + offsetLdu, maleSpan0[1] + offsetLdu]
  if (!femaleCapAllows(maleSpan, femaleSpan, normalizedCaps(female))) {
    return { valid:false, engagementLdu:0, reason:'female-cap' }
  }

  const maleCaps = normalizedCaps(male)
  if ((maleCaps.a && femaleSpan[0] < maleSpan[0] - EPS) || (maleCaps.b && femaleSpan[1] > maleSpan[1] + EPS)) return {valid:false,engagementLdu:0,reason:'male-cap'}

  let engagementLdu = 0
  for (const m of maleSegments) {
    const ms = m.start + offsetLdu
    const me = m.end + offsetLdu
    for (const f of femaleSegments) {
      const overlap = overlapLength(ms, me, f.start, f.end)
      if (overlap <= EPS) continue
      if (!sectionCompatible(m, f)) return { valid:false, engagementLdu, reason:'profile-collision', maleSection:m.index, femaleSection:f.index }
      engagementLdu += overlap
    }
  }

  if (engagementLdu < MIN_ENGAGEMENT_LDU_V4 - EPS) return { valid:false, engagementLdu, reason:'insufficient-engagement' }
  return { valid:true, engagementLdu, reason:'fit' }
}

function refineBoundary(male, female, lo, hi, seekValidAtHigh, iterations = 32) {
  let a = lo
  let b = hi
  for (let i=0; i<iterations; i += 1) {
    const mid = (a+b)/2
    const valid = evaluateMaleOffset(male, female, mid).valid
    if (valid === seekValidAtHigh) b = mid
    else a = mid
  }
  return (a+b)/2
}

function mergeWindows(windows, epsilon = 1e-5) {
  const sorted = windows.filter(w => w[1] >= w[0]).sort((a,b) => a[0]-b[0])
  const result = []
  for (const window of sorted) {
    const last = result.at(-1)
    if (!last || window[0] > last[1] + epsilon) result.push([...window])
    else last[1] = Math.max(last[1], window[1])
  }
  return result
}

export function cylinderAxialWindowsV4(moving, target) {
  moving = axialConnectorV4(moving); target = axialConnectorV4(target)
  const pair = maleFemale(moving, target)
  if (!pair || moving?.family !== 'cylinder' || target?.family !== 'cylinder') {
    return { valid:false, reason:'not-cylinder-male-female', movingWindows:[], maleWindows:[] }
  }

  const maleSegments = connectorSegments(pair.male)
  const femaleSegments = connectorSegments(pair.female)
  const breaks = pairBreakpoints(maleSegments, femaleSegments)
  if (breaks.length < 2) return { valid:false, reason:'no-profile-domain', movingWindows:[], maleWindows:[] }

  // Extend by the engagement threshold because the valid region can start/end
  // slightly inside a pure topology breakpoint.
  const candidates = [breaks[0] - MIN_ENGAGEMENT_LDU_V4, ...breaks, breaks.at(-1) + MIN_ENGAGEMENT_LDU_V4]
  const windows = breaks.filter(p => evaluateMaleOffset(pair.male,pair.female,p).valid).map(p => [p,p])
  for (let i=0; i<candidates.length-1; i += 1) {
    const lo = candidates[i]
    const hi = candidates[i+1]
    if (hi-lo <= EPS) continue
    const mid = (lo+hi)/2
    if (!evaluateMaleOffset(pair.male, pair.female, mid).valid) continue

    let start = lo
    let end = hi
    if (!evaluateMaleOffset(pair.male, pair.female, lo).valid) start = refineBoundary(pair.male, pair.female, lo, mid, true)
    if (!evaluateMaleOffset(pair.male, pair.female, hi).valid) end = refineBoundary(pair.male, pair.female, mid, hi, false)
    windows.push([start,end])
  }

  const maleWindows = mergeWindows(windows)
  const movingWindows = pair.movingIsMale ? maleWindows.map(w=>[...w]) : maleWindows.map(([a,b])=>[-b,-a]).sort((a,b)=>a[0]-b[0])
  return {
    valid: movingWindows.length > 0,
    reason: movingWindows.length ? 'profile-windows' : 'no-valid-profile-window',
    movingIsMale: pair.movingIsMale,
    maleWindows,
    movingWindows,
    femaleCaps: normalizedCaps(pair.female),
  }
}

export function nearestAxialOffsetV4(moving, target, requestedOffsetLdu = 0) {
  const solved = cylinderAxialWindowsV4(moving, target)
  if (!solved.valid) return { ...solved, offsetLdu:null, clamped:false }
  const requested = Number.isFinite(requestedOffsetLdu) ? requestedOffsetLdu : 0
  for (const [start,end] of solved.movingWindows) {
    if (requested >= start && requested <= end) return { ...solved, offsetLdu:requested, clamped:false }
  }
  let best = null
  for (const [start,end] of solved.movingWindows) {
    for (const value of [start,end]) {
      const distance = Math.abs(value-requested)
      if (!best || distance < best.distance) best = { value, distance }
    }
  }
  return { ...solved, offsetLdu:best?.value ?? null, clamped:true }
}

export function evaluateAxialOffsetV4(moving, target, movingOffsetLdu = 0) {
  moving = axialConnectorV4(moving); target = axialConnectorV4(target)
  const pair = maleFemale(moving, target)
  if (!Number.isFinite(movingOffsetLdu)) return {valid:false,engagementLdu:0,reason:'non-finite-offset'}
  if (!pair) return { valid:false, engagementLdu:0, reason:'gender' }
  const maleOffset = pair.movingIsMale ? movingOffsetLdu : -movingOffsetLdu
  return evaluateMaleOffset(pair.male, pair.female, maleOffset)
}
