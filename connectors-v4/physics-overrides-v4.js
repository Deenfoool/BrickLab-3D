export const PHYSICS_OVERRIDES_VERSION_V4 = 'connector-physics-overrides-v4.0.1'

// Physics overrides are an explicit trust boundary. Shadow connectivity can prove
// that two endpoints mate, but some mechanisms also need information that is not
// present in snapping metadata (angular limits, detents, retention, etc.). Those
// mechanisms stay BUILD-only until a deterministic override is registered here.

const VALID_KINDS = new Set(['fixed','revolute','prismatic','cylindrical','spherical'])
const registry = []

function clean(value) { return String(value ?? '').trim().toLowerCase() }
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) }
function normalizedSet(values) { return [...new Set(values.map(clean).filter(Boolean))].sort() }

function normalizeMatcher(match = {}) {
  const result = {
    family: match.family ? clean(match.family) : null,
    group: match.group ? clean(match.group) : null,
    groups: Array.isArray(match.groups) ? normalizedSet(match.groups) : null,
    partIds: Array.isArray(match.partIds) ? normalizedSet(match.partIds) : null,
    endpointIds: Array.isArray(match.endpointIds) ? normalizedSet(match.endpointIds) : null,
  }
  if (!result.family) throw new TypeError('Connector V4 physics override requires a family')
  return result
}

function normalizeRule(rule = {}) {
  if (!VALID_KINDS.has(rule.kind)) throw new TypeError(`Unsupported Connector V4 override kind: ${rule.kind}`)
  const normalized = {
    kind: rule.kind,
    retention: rule.retention ? clean(rule.retention) : 'explicit-override',
    release: rule.release ?? null,
    contacts: rule.contacts === 'enabled' ? 'enabled' : 'disabled',
    limits: rule.limits ? clone(rule.limits) : null,
    resistance: rule.resistance ? clone(rule.resistance) : null,
    evidence: String(rule.evidence || '').trim(),
  }
  if (!normalized.evidence) throw new TypeError('Connector V4 physics override requires evidence')
  return normalized
}

export function registerPhysicsOverrideV4({ id, match, rule } = {}) {
  const normalizedId = String(id || '').trim()
  if (!normalizedId) throw new TypeError('Connector V4 physics override requires a stable id')
  if (registry.some(entry => entry.id === normalizedId)) throw new Error(`Duplicate Connector V4 physics override: ${normalizedId}`)
  const entry = Object.freeze({ id: normalizedId, match: Object.freeze(normalizeMatcher(match)), rule: Object.freeze(normalizeRule(rule)) })
  registry.push(entry)
  return entry
}

function endpointGroups(entry) {
  return normalizedSet([entry?.connectorA?.group, entry?.connectorB?.group])
}

function endpointPartIds(entry) {
  return normalizedSet([entry?.objectA?.userData?.partId, entry?.objectB?.userData?.partId])
}

function endpointIds(entry) {
  return normalizedSet([entry?.connectorA?.endpointId, entry?.connectorB?.endpointId])
}

function sameSet(actual, expected) {
  if (!expected) return true
  if (actual.length !== expected.length) return false
  return expected.every((value, index) => actual[index] === value)
}

function matches(entry, override) {
  const wanted = override.match
  if (clean(entry?.family) !== wanted.family) return false
  const groups = endpointGroups(entry)
  if (wanted.group && !groups.includes(wanted.group)) return false
  if (!sameSet(groups, wanted.groups)) return false
  if (!sameSet(endpointPartIds(entry), wanted.partIds)) return false
  if (!sameSet(endpointIds(entry), wanted.endpointIds)) return false
  return true
}

export function resolvePhysicsOverrideV4(entry) {
  const found = registry.find(override => matches(entry, override))
  return found ? { id: found.id, rule: clone(found.rule), match: clone(found.match), version: PHYSICS_OVERRIDES_VERSION_V4 } : null
}

export function listPhysicsOverridesV4() {
  return registry.map(entry => ({ id: entry.id, match: clone(entry.match), rule: clone(entry.rule) }))
}

export const CONNECTOR_V4_OVERRIDE_KINDS = Object.freeze([...VALID_KINDS])
