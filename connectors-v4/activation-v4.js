import { CONNECTOR_SCHEMA_VERSION_V4, CONNECTOR_SYSTEM_VERSION_V4, validateConnectorV4 } from './schema-v4.js'

export const ACTIVATION_POLICY_VERSION_V4 = 'connector-activation-v4.1.1'

const CRITICAL_WARNING_CODES = new Set([
  'invalid-snap-meta',
  'include-not-found',
  'geometry-scale-rejected',
  'inheritance-scale-rejected',
  'inheritance-mirror-rejected',
  'cycle',
  'max-depth',
  'node-budget',
  'hydrate-error',
])

const PROFILE_EPS_LDU = 0.08
const FRAME_EPS = 2e-4
const MAX_CONNECTORS_PER_PART = 4096

const approx = (a, b, eps = PROFILE_EPS_LDU) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= eps
const rigidShape = section => section?.shape === '_L' || section?.shape === 'L_' ? 'R' : section?.shape
const finiteArray = (value, length) => Array.isArray(value) && value.length === length && value.every(Number.isFinite)

function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }
function len(a) { return Math.hypot(a[0], a[1], a[2]) }
function col(m, i) { return [m[i], m[3+i], m[6+i]] }
function det(m) {
  return m[0]*(m[4]*m[8]-m[5]*m[7]) - m[1]*(m[3]*m[8]-m[5]*m[6]) + m[2]*(m[3]*m[7]-m[4]*m[6])
}

export function connectorFrameHealthV4(connector) {
  const orientation = connector?.frame?.orientationBrickLab ?? connector?.frame?.orientation
  if (!finiteArray(orientation, 9)) return { pass:false, reason:'orientation-missing' }
  const x = col(orientation, 0), y = col(orientation, 1), z = col(orientation, 2)
  const lengths = [len(x), len(y), len(z)]
  const orthogonality = Math.max(Math.abs(dot(x,y)), Math.abs(dot(x,z)), Math.abs(dot(y,z)))
  const determinant = det(orientation)
  const pass = lengths.every(value => Math.abs(value - 1) <= FRAME_EPS)
    && orthogonality <= FRAME_EPS
    && Math.abs(determinant - 1) <= FRAME_EPS * 4
  return { pass, reason:pass ? 'ok' : 'non-orthonormal-frame', lengths, orthogonality, determinant }
}

export function classifyConnectorV4(connector) {
  if (!connector || connector.family !== 'cylinder') return 'other'
  const sections = connector.geometry?.sections ?? []
  const shapes = sections.map(rigidShape)
  const allA6 = sections.length > 0 && sections.every((section, index) => shapes[index] === 'A' && approx(section.radiusLdu, 6))
  const allR = sections.length > 0 && shapes.every(shape => shape === 'R')

  if (
    connector.gender === 'male' && connector.snap?.slide === true && connector.geometry?.centered === true &&
    String(connector.geometry?.caps || '').toLowerCase() === 'none' && allA6
  ) return 'technic-axle'

  if (
    connector.gender === 'female' && connector.snap?.slide === true &&
    String(connector.geometry?.caps || '').toLowerCase() === 'none' && allA6
  ) return 'technic-axle-hole'

  if (
    connector.gender === 'female' && connector.snap?.slide === true && connector.geometry?.centered === true && allR &&
    sections.some(section => approx(section.radiusLdu, 6))
  ) return 'technic-round-hole'

  if (
    connector.gender === 'male' && connector.snap?.slide === false && sections.length === 1 &&
    shapes[0] === 'R' && approx(sections[0].radiusLdu, 6) && approx(sections[0].lengthLdu, 4) &&
    String(connector.geometry?.caps || 'one').toLowerCase() === 'one'
  ) return 'stud'

  if (
    connector.gender === 'female' && connector.snap?.slide === false && sections.length === 1 &&
    ['R','S'].includes(shapes[0]) && approx(sections[0].radiusLdu, 6) &&
    String(connector.geometry?.caps || 'one').toLowerCase() === 'one'
  ) return 'anti-stud'

  return 'cylinder-other'
}

export function certifyConnectivityV4(definition) {
  const connectivity = definition?.connectivityV4
  const failures = []
  if (!connectivity) failures.push('missing-connectivity')
  if (connectivity?.status !== 'ready') failures.push(`status:${connectivity?.status || 'missing'}`)
  if (connectivity?.schemaVersion !== CONNECTOR_SCHEMA_VERSION_V4) failures.push('schema-version')
  if (connectivity?.systemVersion !== CONNECTOR_SYSTEM_VERSION_V4) failures.push('system-version')

  const connectors = Array.isArray(connectivity?.connectors) ? connectivity.connectors : []
  if (!connectors.length) failures.push('no-connectors')
  if (connectors.length > MAX_CONNECTORS_PER_PART) failures.push('connector-budget')

  const endpointIds = new Set()
  for (const connector of connectors) {
    const validation = validateConnectorV4(connector)
    if (!validation.valid) failures.push(`connector-invalid:${validation.errors.join('|')}`)
    if (!connector.endpointId) failures.push('endpoint-id-missing')
    else if (endpointIds.has(connector.endpointId)) failures.push(`endpoint-id-duplicate:${connector.endpointId}`)
    else endpointIds.add(connector.endpointId)
    const frame = connectorFrameHealthV4(connector)
    if (!frame.pass) failures.push(`frame:${connector.endpointId || 'unknown'}:${frame.reason}`)
    if (!finiteArray(connector.frame?.positionStud, 3)) failures.push(`position:${connector.endpointId || 'unknown'}`)
  }

  for (const warning of connectivity?.warnings ?? []) {
    if (CRITICAL_WARNING_CODES.has(warning?.code)) failures.push(`warning:${warning.code}`)
  }

  return {
    policyVersion: ACTIVATION_POLICY_VERSION_V4,
    pass: failures.length === 0,
    partId: definition?.id ?? null,
    connectors: connectors.length,
    failures: [...new Set(failures)],
  }
}

export function activationForMatchV4(source, target, match) {
  const sourceRole = classifyConnectorV4(source)
  const targetRole = classifyConnectorV4(target)
  const roles = new Set([sourceRole, targetRole])

  if (
    roles.has('technic-axle') && roles.has('technic-axle-hole') &&
    match?.compatible === true && match?.family === 'cylinder' && match?.keyed === true &&
    match?.rotationalSymmetry === 4 && match?.kinematicHint === 'prismatic'
  ) {
    return {
      active:true,
      family:'technic-axle-keyed-hole',
      editor:true,
      graph:true,
      // Physics intentionally remains fail-closed until V4 supports dynamic
      // disengagement/breakaway. A permanently limited prismatic joint would
      // falsely trap an axle that should be able to leave an open axle hole.
      physics:false,
      physicsReason:'dynamic-disengagement-not-certified',
      constraintKind:'prismatic',
      evidence:'ldcad-shadow:exact-A6-keyed-profile',
      sourceRole,
      targetRole,
    }
  }

  if (match?.compatible) {
    let family = null
    let kind = match.kinematicHint
    if (roles.has('technic-axle') && roles.has('technic-round-hole')) family='technic-axle-round-hole'
    else if (roles.has('stud') && roles.has('anti-stud')) family='stud-anti-stud'
    else if (match.family === 'cylinder' && Math.abs(match.fit?.clearanceLdu ?? Infinity) <= PROFILE_EPS_LDU) {
      const m=match.male, f=match.female
      if (m.geometry.sections.some(s=>s.elastic) && roles.has('technic-round-hole')) family='technic-pin-hole'
      else if (m.geometry.sections.every(s=>s.shape==='R' && approx(s.radiusLdu,4)) && f.geometry.sections.every(s=>s.shape==='R')) family='bar-round-hole'
      else if (m.geometry.sections.every(s=>s.shape==='A') && f.geometry.sections.every(s=>s.shape==='A')) family='keyed-shaft-interface'
    }
    else if (match.family === 'clip-cylinder') family='bar-clip'
    else if (match.kinematicHint === 'spherical') {
      const ra=source.geometry.radiusLdu ?? source.geometry.bounding?.radiusLdu
      const rb=target.geometry.radiusLdu ?? target.geometry.bounding?.radiusLdu
      if (approx(ra,rb)) family='ball-socket'
    }
    else if (match.family === 'fingers') family='hinge-fingers'
    else if (match.family === 'generic' && source.group && source.group===target.group) family='generic-group'
    if (family) return {active:true,family,editor:true,graph:true,physics:false,
      physicsReason:'requires-physical-policy-and-collider-preflight',constraintKind:kind,
      evidence:'ldcad-shadow:shape-profile',sourceRole,targetRole}
  }

  return {
    active:false,
    family:null,
    editor:false,
    graph:false,
    physics:false,
    constraintKind:null,
    evidence:null,
    sourceRole,
    targetRole,
    reason:'not-certified-for-active-v4',
  }
}

export function certifyCandidateV4(candidate, getDefinition) {
  if (!candidate?.solution?.valid || !candidate?.match?.compatible) {
    return { pass:false, reason:'invalid-placement-candidate', activation:null, sourceHealth:null, targetHealth:null }
  }
  const sourceDef = typeof getDefinition === 'function' ? getDefinition(candidate.sourcePartId) : null
  const targetDef = typeof getDefinition === 'function' ? getDefinition(candidate.targetPartId) : null
  const sourceHealth = certifyConnectivityV4(sourceDef)
  const targetHealth = certifyConnectivityV4(targetDef)
  const activation = activationForMatchV4(candidate.source, candidate.target, candidate.match)
  const pass = sourceHealth.pass && targetHealth.pass && activation.active
  return {
    pass,
    reason: pass ? 'certified' : !sourceHealth.pass ? 'source-connectivity-health' : !targetHealth.pass ? 'target-connectivity-health' : activation.reason,
    activation,
    sourceHealth,
    targetHealth,
  }
}

export const CONNECTOR_V4_CRITICAL_WARNINGS = Object.freeze([...CRITICAL_WARNING_CODES])
