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
  if (mShape === 'R' && fShape === 'R') return { compatible: true, keyed: false, mode: 'round-round' }
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
    .filter(candidate => candidate.clearance >= -RADIUS_TOLERANCE_LDU)
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
  // Conservative validation at every interval boundary. A candidate only passes
  // when overlapping material alternates male/female rather than male/male.
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

function boundingSignature(bound) {
  if (!bound) return ''
  if (bound.kind === 'point') return 'pnt'
  if (bound.kind === 'box') return `box:${bound.halfExtentsLdu.join(',')}`
  if (bound.kind === 'cube') return `cube:${bound.halfSizeLdu}`
  if (bound.kind === 'cylinder') return `cyl:${bound.radiusLdu},${bound.lengthLdu}`
  if (bound.kind === 'sphere') return `sph:${bound.radiusLdu}`
  return ''
}

function genericMatch(a, b) {
  if (a.family !== 'generic' || b.family !== 'generic') return { compatible: false, reason: 'generic-pair' }
  if (!a.group || a.group !== b.group) return { compatible: false, reason: 'group' }
  if (!oppositeGender(a.gender, b.gender)) return { compatible: false, reason: 'generic-gender' }
  const sizeMatchRequested = a.snap?.match === 'size' || b.snap?.match === 'size'
  if (sizeMatchRequested && boundingSignature(a.geometry.bounding) !== boundingSignature(b.geometry.bounding)) return { compatible: false, reason: 'generic-size' }
  const free = a.snap?.placement === 'free' || b.snap?.placement === 'free'
  return {
    compatible: true,
    family: 'generic',
    reason: a.group,
    keyed: !free,
    rotationalSymmetry: free ? Infinity : 1,
    editorMotion: { axialSlide: false, freeTwist: free },
    kinematicHint: free ? 'spherical' : 'fixed',
    physicsReady: false,
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
    editorMotion: { axialSlide: false, freeTwist: true },
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
