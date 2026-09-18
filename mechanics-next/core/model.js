export const MECHANICS_NEXT_VERSION = 'mechanics-next-0.1.0-alpha.1'
export const MECHANICS_SCHEMA_VERSION = 1

export const DOF_KEYS = Object.freeze(['tx', 'ty', 'tz', 'rx', 'ry', 'rz'])
export const DOF_STATES = Object.freeze(['locked', 'free', 'limited', 'driven'])
export const MOTION_CHANNELS = Object.freeze(['omega','theta','slide','displacement'])
export const CONSTRAINT_KINDS = Object.freeze([
  'fixed', 'revolute', 'prismatic', 'cylindrical', 'spherical', 'planar', 'custom',
])
export const EDGE_KINDS = Object.freeze(['constraint', 'transmission', 'contact'])
export const CONFIDENCE_LEVELS = Object.freeze(['verified', 'strong', 'inferred', 'weak', 'unknown'])

const CONFIDENCE_SCORE = Object.freeze({
  verified:1,
  strong:0.9,
  inferred:0.7,
  weak:0.4,
  unknown:0,
})

export function confidenceScore(level = 'unknown') {
  return CONFIDENCE_SCORE[level] ?? 0
}

export function cloneMechanical(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

export function deterministicId(namespace, ...parts) {
  const input = [namespace, ...parts].map(value => String(value ?? '')).join('\u001f')
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${namespace}:${hash.toString(36)}`
}

export function evidence({
  source = 'unknown',
  confidence = 'unknown',
  reason = null,
  detail = null,
} = {}) {
  if (!CONFIDENCE_LEVELS.includes(confidence)) throw new TypeError(`Unknown confidence: ${confidence}`)
  return Object.freeze({
    source:String(source),
    confidence,
    score:confidenceScore(confidence),
    reason:reason == null ? null : String(reason),
    detail:detail == null ? null : cloneMechanical(detail),
  })
}

export function createBodyDescriptor({
  id,
  instanceId = id,
  partId = null,
  family = 'unknown',
  role = 'part',
  mass = null,
  metadata = null,
  evidence:bodyEvidence = evidence(),
} = {}) {
  if (!id) throw new TypeError('Mechanical body requires id')
  return Object.freeze({
    schemaVersion:MECHANICS_SCHEMA_VERSION,
    id:String(id),
    instanceId:String(instanceId ?? id),
    partId:partId == null ? null : String(partId),
    family:String(family || 'unknown'),
    role:String(role || 'part'),
    mass:Number.isFinite(mass) && mass >= 0 ? Number(mass) : null,
    metadata:metadata == null ? null : cloneMechanical(metadata),
    evidence:bodyEvidence,
  })
}

export function createEndpointDescriptor({
  id,
  bodyId,
  family,
  gender = null,
  frame = null,
  profile = null,
  capabilities = [],
  metadata = null,
  evidence:endpointEvidence = evidence(),
} = {}) {
  if (!id || !bodyId || !family) throw new TypeError('Endpoint requires id, bodyId and family')
  return Object.freeze({
    schemaVersion:MECHANICS_SCHEMA_VERSION,
    id:String(id),
    bodyId:String(bodyId),
    family:String(family),
    gender:gender == null ? null : String(gender),
    frame:frame == null ? null : cloneMechanical(frame),
    profile:profile == null ? null : cloneMechanical(profile),
    capabilities:Object.freeze([...new Set(capabilities.map(String))].sort()),
    metadata:metadata == null ? null : cloneMechanical(metadata),
    evidence:endpointEvidence,
  })
}

export function createTransmission({
  id,
  kind,
  bodies,
  parameters = {},
  equations = [],
  metadata = null,
  evidence:transmissionEvidence = evidence(),
} = {}) {
  if (!id || !kind || !Array.isArray(bodies) || bodies.length < 2) {
    throw new TypeError('Transmission requires id, kind and at least two bodies')
  }
  return Object.freeze({
    schemaVersion:MECHANICS_SCHEMA_VERSION,
    id:String(id),
    kind:String(kind),
    bodies:Object.freeze(bodies.map(String)),
    parameters:Object.freeze(cloneMechanical(parameters)),
    equations:Object.freeze(cloneMechanical(equations)),
    metadata:metadata == null ? null : cloneMechanical(metadata),
    evidence:transmissionEvidence,
  })
}

export function mechanicalVariable(bodyId, channel = 'rz') {
  if (!bodyId) throw new TypeError('bodyId is required')
  if (!DOF_KEYS.includes(channel) && !MOTION_CHANNELS.includes(channel)) {
    throw new TypeError(`Unsupported mechanical channel: ${channel}`)
  }
  return `${String(bodyId)}::${channel}`
}
