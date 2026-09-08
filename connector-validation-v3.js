import { PARTS, findPart } from './parts.js'
import {
  CONNECTOR_RULE_VERSION,
  CONNECTOR_RULES,
  connectorRule,
  connectionEndpoints,
  endpointKey,
} from './connections.js'

const ALLOWED_TYPES = new Set(['stud', 'tube', 'pin', 'pin-hole', 'axle', 'axle-hole'])

function finiteVector(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
}

function mechanicsRequirements(part) {
  const mechanics = part.mechanics ?? {}
  const requirements = []
  const add = (label, id, type) => { if (id) requirements.push({ label, id, type }) }
  add('motor.connectorId', mechanics.motor?.connectorId, 'axle')
  add('transmission.inputConnectorId', mechanics.transmission?.inputConnectorId, 'axle-hole')
  add('transmission.outputConnectorId', mechanics.transmission?.outputConnectorId, 'axle-hole')
  add('differential.inputConnectorId', mechanics.differential?.inputConnectorId, 'axle-hole')
  add('differential.leftConnectorId', mechanics.differential?.leftConnectorId, 'axle-hole')
  add('differential.rightConnectorId', mechanics.differential?.rightConnectorId, 'axle-hole')
  add('suspensionArm.pivotConnectorId', mechanics.suspensionArm?.pivotConnectorId, 'pin')
  return requirements
}

export function validateConnectorCatalog(parts = PARTS) {
  const errors = []
  const warnings = []
  const counts = {}
  const partIds = new Set()

  for (const part of parts) {
    if (!part?.id || partIds.has(part.id)) errors.push(`duplicate or missing part id: ${part?.id ?? ''}`)
    partIds.add(part?.id)
    const connectors = part.connectors ?? []
    const ids = new Set()
    const positions = new Set()

    for (const connector of connectors) {
      counts[connector.type] = (counts[connector.type] ?? 0) + 1
      if (!connector.id || ids.has(connector.id)) errors.push(`${part.id}: duplicate or missing connector id "${connector.id ?? ''}"`)
      ids.add(connector.id)
      if (!ALLOWED_TYPES.has(connector.type)) errors.push(`${part.id}:${connector.id}: unsupported type ${connector.type}`)
      if (!finiteVector(connector.position)) errors.push(`${part.id}:${connector.id}: invalid position`)
      if (!finiteVector(connector.axis)) errors.push(`${part.id}:${connector.id}: invalid axis`)
      else {
        const length = Math.hypot(...connector.axis)
        if (length < 0.5) errors.push(`${part.id}:${connector.id}: zero/short axis`)
        else if (Math.abs(length - 1) > 0.02) warnings.push(`${part.id}:${connector.id}: non-unit axis ${length.toFixed(3)}`)
      }

      if (finiteVector(connector.position)) {
        const key = `${connector.type}:${connector.position.map(value => Number(value).toFixed(4)).join(',')}`
        if (positions.has(key)) warnings.push(`${part.id}:${connector.id}: duplicate ${connector.type} position`)
        positions.add(key)
      }
    }

    for (const requirement of mechanicsRequirements(part)) {
      const connector = connectors.find(item => item.id === requirement.id)
      if (!connector) errors.push(`${part.id}: ${requirement.label} references missing connector ${requirement.id}`)
      else if (connector.type !== requirement.type) {
        errors.push(`${part.id}: ${requirement.label} must be ${requirement.type}, got ${connector.type}`)
      }
    }

    if (part.mechanics?.gear && !connectors.some(connector => connector.type === 'axle-hole')) {
      errors.push(`${part.id}: gear requires an axle-hole connector`)
    }
    if (part.mechanics?.wheel && !connectors.some(connector => connector.type === 'axle-hole')) {
      errors.push(`${part.id}: wheel requires an axle-hole connector`)
    }
  }

  for (const type of ALLOWED_TYPES) {
    if (![...ALLOWED_TYPES].some(other => connectorRule(type, other))) {
      errors.push(`connector type ${type} has no compatibility rule`)
    }
  }

  return {
    version: CONNECTOR_RULE_VERSION,
    parts: parts.length,
    connectors: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts,
    errors,
    warnings,
    ok: errors.length === 0,
  }
}

function instanceIdOf(object) {
  return object?.userData?.instanceId ?? object?.instanceId ?? null
}

function partIdOf(object) {
  return object?.userData?.partId ?? object?.partId ?? null
}

function endpointDefinition(objectsById, endpoint) {
  if (!endpoint?.instanceId || !endpoint?.connectorId) return null
  const object = objectsById.get(endpoint.instanceId)
  if (!object) return null
  const part = findPart(partIdOf(object))
  const connector = part?.connectors?.find(item => item.id === endpoint.connectorId)
  return connector ? { object, part, connector } : null
}

export function validateConnectionGraph(objects = [], connections = []) {
  const errors = []
  const warnings = []
  const used = new Map()
  const objectsById = new Map()

  for (const object of objects ?? []) {
    const instanceId = instanceIdOf(object)
    if (instanceId) objectsById.set(instanceId, object)
  }

  let contacts = 0
  for (const connection of connections ?? []) {
    const refA = endpointDefinition(objectsById, connection?.a)
    const refB = endpointDefinition(objectsById, connection?.b)
    if (!refA || !refB) {
      errors.push(`${connection?.id ?? 'connection'}: missing part or primary connector`)
      continue
    }
    if (refA.object === refB.object) {
      errors.push(`${connection.id}: self connection is invalid`)
      continue
    }

    const rule = connectorRule(refA.connector.type, refB.connector.type)
    if (!rule) {
      errors.push(`${connection.id}: incompatible ${refA.connector.type} ↔ ${refB.connector.type}`)
      continue
    }
    if (connection.kind !== rule.kind) warnings.push(`${connection.id}: kind ${connection.kind} should be ${rule.kind}`)

    const localKeys = new Set()
    for (const endpoint of connectionEndpoints(connection)) {
      const ref = endpointDefinition(objectsById, endpoint)
      if (!ref) {
        errors.push(`${connection.id}: missing connector ${endpoint.instanceId}:${endpoint.connectorId}`)
        continue
      }
      if (endpoint.connectorType && endpoint.connectorType !== ref.connector.type) {
        warnings.push(`${connection.id}: stale type metadata for ${endpoint.connectorId}`)
      }
      const key = endpointKey(endpoint.instanceId, endpoint.connectorId)
      if (localKeys.has(key)) errors.push(`${connection.id}: duplicate endpoint ${key}`)
      localKeys.add(key)
      const owner = used.get(key)
      if (owner && owner !== connection.id) errors.push(`${connection.id}: endpoint ${key} already used by ${owner}`)
      else used.set(key, connection.id)
    }

    const partPair = new Set([connection.a.instanceId, connection.b.instanceId])
    for (const contact of connection.contacts ?? []) {
      contacts += 1
      if (!rule.multiContact) errors.push(`${connection.id}: contacts are only valid for multi-contact rules`)
      if (!partPair.has(contact?.a?.instanceId) || !partPair.has(contact?.b?.instanceId)) {
        errors.push(`${connection.id}: contact crosses a different part pair`)
      }
      const contactA = endpointDefinition(objectsById, contact?.a)
      const contactB = endpointDefinition(objectsById, contact?.b)
      if (contactA && contactB && connectorRule(contactA.connector.type, contactB.connector.type)?.kind !== rule.kind) {
        errors.push(`${connection.id}: contact has incompatible connector types`)
      }
    }

    const expectedCount = 1 + (connection.contacts?.length ?? 0)
    if (connection.contactCount != null && connection.contactCount !== expectedCount) {
      warnings.push(`${connection.id}: contactCount ${connection.contactCount} should be ${expectedCount}`)
    }
  }

  return {
    version: CONNECTOR_RULE_VERSION,
    objects: objectsById.size,
    connections: connections?.length ?? 0,
    contacts,
    occupiedEndpoints: used.size,
    errors,
    warnings,
    ok: errors.length === 0,
  }
}

const catalog = validateConnectorCatalog()
globalThis.BrickLabConnectorDiagnostics = catalog
globalThis.BrickLabConnectors = Object.freeze({
  version: CONNECTOR_RULE_VERSION,
  rules: CONNECTOR_RULES,
  catalog,
  validateCatalog: validateConnectorCatalog,
  validateGraph: validateConnectionGraph,
})

if (catalog.errors.length) console.error('[BrickLab] connector catalog errors', catalog.errors)
if (catalog.warnings.length) console.warn('[BrickLab] connector catalog warnings', catalog.warnings)
window.dispatchEvent(new CustomEvent('bricklab:connectorvalidation', { detail: catalog }))
