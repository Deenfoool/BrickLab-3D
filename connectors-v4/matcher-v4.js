import { axialSpanV4, totalProfileLengthV4 } from './schema-v4.js'

const EPS = 1e-6
const RADIUS_TOLERANCE_LDU = 0.35
const LENGTH_TOLERANCE_LDU = 0.5

function oppositeGender(a, b) {
  return (a === 'male' && b === 'female') || (a === 'female' && b === 'male')
}

function groupCompatible(a, b) {
  const ga = String(a?.group || '')
  const gb = String(b?.group || '')
  return !ga && !gb ? true : ga === gb
}

function rigidShape(section) {
  return section?.shape === '_L' || section?.shape === 'L_' ? 'R' : section?.shape
}

function maleFemale(a, b) {
  if (a?.gender === 'male' && b?.gender === 'female') return [a, b]
  if (b?.gender === 'male' && a?.gender === 'female') return [b, a]
  return [null, null]
}

function sectionFit(male, female) {
  const mShape = rigidShape(male)
  const fShape = rigidShape(female)
  const radialFit = male.radiusLdu <= female.radiusLdu + RADIUS_TOLERANCE_LDU
  if (!radialFit) return { compatible: false, keyed: false, mode: 'radius' }
  if (mShape === 'R' && ['R','S'].includes(fShape)) return { compatible: true, keyed: false, mode: 'round-round' }
  if (mShape === 'A' && fShape === 'A') return { compatible: true, keyed: true, symmetry: 4, mode: 'axle-axle' }
  if (mShape === 'S' && fShape === 'S') return { compatible: true, keyed: true, symmetry: 4, mode: 'square-square' }
  // Axle/square profiles can sit inside a sufficiently large round bore. This is
  // deliberately one-way: a round cylinder is NOT assumed to fit a keyed hole.
  if ((mShape === 'A' || mShape === 'S') && fShape === 'R') return { compatible: true, keyed: false, mode: `${mShape.toLowerCase()}-round` }
  return { compatible: false, keyed: false, mode: 'shape' }
}

function bestCylinderSectionFit(male, female) {
  let best = null
  for (const m of male.geometry.sections ?? []) {
    for (const f of female.geometry.sections ?? []) {
      const fit = sectionFit(m, f)
      if (!fit.compatible) continue
      const clearance = f.radiusLdu - m.radiusLdu
      const score = Math.abs(clearance) + (fit.keyed ? 0 : 0.05)
      if (!best || score < best.score) best = { ...fit, maleSection: m, femaleSection: f, clearanceLdu: clearance, score }
    }
  }
  return best
}

function cylinderMatch(a, b) {
  const [male, female] = maleFemale(a, b)
  if (!male || !female) return { compatible: false, reason: 'cylinder-gender' }
  const fit = bestCylinderSectionFit(male, female)
  if (!fit) return { compatible: false, reason: 'cylinder-profile' }
  const slideSnap = Boolean(male.snap?.slide || female.snap?.slide)
  let kinematicHint
  if (fit.keyed) kinematicHint = slideSnap ? 'prismatic' : 'fixed'
  else kinematicHint = slideSnap ? 'cylindrical' : 'revolute'
  const elastic = [...(male.geometry.sections ?? []), ...(female.geometry.sections ?? [])].some(section => section.elastic)
  return {
    compatible: true,
    family: 'cylinder',
    reason: fit.mode,
    keyed: Boolean(fit.keyed),
    rotationalSymmetry: fit.symmetry ?? Infinity,
    editorMotion: { axialSlide: slideSnap, freeTwist: !fit.keyed },
    kinematicHint,
    physicsReady: false,
    frictionHint: elastic ? 'friction-fit' : 'unspecified',
    male,
    female,
    fit,
    axialSpans: { male: axialSpanV4(male), female: axialSpanV4(female) },
  }
}

function clipCylinderMatch(a, b) {
  const clip = a.family === 'clip' ? a : b.family === 'clip' ? b : null
  const cylinder = a.family === 'cylinder' ? a : b.family === 'cylinder' ? b : null
  if (!clip || !cylinder || cylinder.gender !== 'male') return { compatible: false, reason: 'clip-pair' }
  const roundSections = (cylinder.geometry.sections ?? []).filter(section => rigidShape(section) === 'R')
  const fit = roundSections
    .map(section => ({ section, clearance: clip.geometry.radiusLdu - section.radiusLdu }))
    .filter(candidate => Math.abs(candidate.clearance) <= RADIUS_TOLERANCE_LDU)
    .sort((x, y) => Math.abs(x.clearance) - Math.abs(y.clearance))[0]
  if (!fit) return { compatible: false, reason: 'clip-radius' }
  const slideSnap = Boolean(clip.snap?.slide || cylinder.snap?.slide)
  return {
    compatible: true,
    family: 'clip-cylinder',
    reason: 'round-clip',
    keyed: false,
    rotationalSymmetry: Infinity,
    editorMotion: { axialSlide: slideSnap, freeTwist: true },
    kinematicHint: slideSnap ? 'cylindrical' : 'revolute',
    physicsReady: false,
    fit: { clearanceLdu: fit.clearance, cylinderSection: fit.section },
  }
}

function fingerSegments(connector) {
  const seq = connector.geometry.sequenceLdu ?? []
  const total = seq.reduce((sum, value) => sum + value, 0)
  let cursor = connector.geometry.centered ? -total / 2 : 0
  let gender = connector.geometry.firstGender
  return seq.map(length => {
    const segment = { start: cursor, end: cursor + length, gender }
    cursor += length
    gender = gender === 'male' ? 'female' : 'male'
    return segment
  })
}

function fingersMatch(a, b) {
  if (a.family !== 'fingers' || b.family !== 'fingers') return { compatible: false, reason: 'fingers-pair' }
  if (!groupCompatible(a, b)) return { compatible: false, reason: 'group' }
  if (Math.abs(a.geometry.radiusLdu - b.geometry.radiusLdu) > RADIUS_TOLERANCE_LDU) return { compatible: false, reason: 'finger-radius' }
  const lenA = totalProfileLengthV4(a)
  const lenB = totalProfileLengthV4(b)
  if (Math.abs(lenA - lenB) > LENGTH_TOLERANCE_LDU) return { compatible: false, reason: 'finger-length' }
  const sa = fingerSegments(a)
  const sb = fingerSegments(b)
  const points = [...new Set([...sa.flatMap(x => [x.start, x.end]), ...sb.flatMap(x => [x.start, x.end])])].sort((x, y) => x - y)
  for (let i = 0; i < points.length - 1; i += 1) {
    const mid = (points[i] + points[i + 1]) / 2
    const aa = sa.find(x => mid > x.start + EPS && mid < x.end - EPS)
    const bb = sb.find(x => mid > x.start + EPS && mid < x.end - EPS)
    if (aa && bb && aa.gender === bb.gender) return { compatible: false, reason: 'finger-overlap' }
  }
  return {
    compatible: true,
    family: 'fingers',
    reason: 'interlocking-fingers',
    keyed: false,
    rotationalSymmetry: Infinity,
    editorMotion: { axialSlide: false, freeTwist: true },
    kinematicHint: 'revolute',
    physicsReady: false,
  }
}

function boundingKind(bound) {
  return bound?.kind || 'point'
}

function boundingSignature(bound) {
  if (!bound || bound.kind === 'point') return 'point'
  if (bound.kind === 'box') return `box:${bound.halfExtentsLdu.join(',')}`
  if (bound.kind === 'cube') return `cube:${bound.halfSizeLdu}`
  if (bound.kind === 'cylinder') return `cylinder:${bound.radiusLdu},${bound.lengthLdu}`
  if (bound.kind === 'sphere') return `sphere:${bound.radiusLdu}`
  return `unknown:${String(bound.kind || '')}`
}

function close(a, b, tolerance) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance
}

function boundingSizeCompatible(a, b) {
  const kind = boundingKind(a)
  if (kind !== boundingKind(b)) return false
  if (kind === 'point') return true
  if (kind === 'sphere') return close(a.radiusLdu, b.radiusLdu, RADIUS_TOLERANCE_LDU)
  if (kind === 'cube') return close(a.halfSizeLdu, b.halfSizeLdu, LENGTH_TOLERANCE_LDU)
  if (kind === 'cylinder') return close(a.radiusLdu, b.radiusLdu, RADIUS_TOLERANCE_LDU) && close(a.lengthLdu, b.lengthLdu, LENGTH_TOLERANCE_LDU)
  if (kind === 'box') return Array.isArray(a.halfExtentsLdu) && Array.isArray(b.halfExtentsLdu) && a.halfExtentsLdu.length === 3 && a.halfExtentsLdu.every((value, index) => close(value, b.halfExtentsLdu[index], LENGTH_TOLERANCE_LDU))
  return boundingSignature(a) === boundingSignature(b)
}

function requestedGenericMatch(a, b) {
  const rank = { group: 0, shape: 1, size: 2 }
  const modeA = String(a.snap?.match || 'shape').toLowerCase()
  const modeB = String(b.snap?.match || 'shape').toLowerCase()
  return (rank[modeA] ?? 1) >= (rank[modeB] ?? 1) ? modeA : modeB
}

function genericMatch(a, b) {
  if (a.family !== 'generic' || b.family !== 'generic') return { compatible: false, reason: 'generic-pair' }
  if (!oppositeGender(a.gender, b.gender)) return { compatible: false, reason: 'generic-gender' }

  // LDCad's generic matcher always compares group values (empty counts as the same
  // unnamed group). `shape` is the default and additionally checks bounding kind;
  // `size` is stricter and also compares dimensions. If peers request different
  // modes BrickLab uses the stricter requirement so it never creates a false match.
  if (String(a.group || '') !== String(b.group || '')) return { compatible: false, reason: 'group' }
  const mode = requestedGenericMatch(a, b)
  const boundA = a.geometry?.bounding
  const boundB = b.geometry?.bounding
  if (mode === 'shape' && boundingKind(boundA) !== boundingKind(boundB)) return { compatible: false, reason: 'generic-shape' }
  if (mode === 'size' && !boundingSizeCompatible(boundA, boundB)) return { compatible: false, reason: 'generic-size' }

  const placementA = String(a.snap?.placement || 'aligned').toLowerCase()
  const placementB = String(b.snap?.placement || 'aligned').toLowerCase()
  const free = placementA === 'free' || placementB === 'free'
  const retained = placementA === 'retain' || placementB === 'retain'
  const spherical = free && boundingKind(boundA) === 'sphere' && boundingKind(boundB) === 'sphere'
  return {
    compatible: true,
    family: 'generic',
    reason: `generic-${mode}`,
    matchMode: mode,
    keyed: !(free || retained),
    rotationalSymmetry: free || retained ? Infinity : 1,
    editorMotion: {
      axialSlide: false,
      freeTwist: free || retained,
      freeOrientation: free,
      retainOrientation: retained,
    },
    kinematicHint: spherical ? 'spherical' : (free ? null : 'fixed'),
    physicsReady: false,
    bounding: { a: boundingSignature(boundA), b: boundingSignature(boundB) },
  }
}

function sphereMatch(a, b) {
  if (a.family !== 'sphere' || b.family !== 'sphere') return { compatible: false, reason: 'sphere-pair' }
  if (!oppositeGender(a.gender, b.gender)) return { compatible: false, reason: 'sphere-gender' }
  if (!groupCompatible(a, b)) return { compatible: false, reason: 'group' }
  if (Math.abs(a.geometry.radiusLdu - b.geometry.radiusLdu) > RADIUS_TOLERANCE_LDU) return { compatible: false, reason: 'sphere-radius' }
  return {
    compatible: true,
    family: 'sphere',
    reason: 'ball-socket',
    keyed: false,
    rotationalSymmetry: Infinity,
    editorMotion: { axialSlide: false, freeTwist: true, freeOrientation: true },
    kinematicHint: 'spherical',
    physicsReady: false,
  }
}

export function matchConnectorV4(a, b) {
  if (!a || !b) return { compatible: false, reason: 'missing' }
  if (!groupCompatible(a, b)) return { compatible: false, reason: 'group' }
  if (a.family === 'cylinder' && b.family === 'cylinder') return cylinderMatch(a, b)
  if ((a.family === 'clip' && b.family === 'cylinder') || (b.family === 'clip' && a.family === 'cylinder')) return clipCylinderMatch(a, b)
  if (a.family === 'fingers' && b.family === 'fingers') return fingersMatch(a, b)
  if (a.family === 'generic' && b.family === 'generic') return genericMatch(a, b)
  if (a.family === 'sphere' && b.family === 'sphere') return sphereMatch(a, b)
  return { compatible: false, reason: 'family' }
}

export const MATCHER_TOLERANCES_V4 = Object.freeze({ radiusLdu: RADIUS_TOLERANCE_LDU, lengthLdu: LENGTH_TOLERANCE_LDU })
