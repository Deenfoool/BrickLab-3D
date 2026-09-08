import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'
import { connectorWorldAxis, connectorWorldPosition } from './snapping.js'
import {
  CONNECTOR_RULE_VERSION,
  connectorRule,
  connectionEndpoints,
  endpointKey,
} from './connections.js'

const INTEGRITY_DISTANCE = 0.18
const STRUCTURAL_CELL = 0.14
const originalBuild = PhysicsSession.prototype.build

function objectIndex(objects) {
  return new Map((objects ?? []).map(object => [object.userData.instanceId, object]))
}

function connectorRef(objectsById, endpoint) {
  if (!endpoint?.instanceId || !endpoint?.connectorId) return null
  const object = objectsById.get(endpoint.instanceId)
  if (!object) return null
  const definition = findPart(object.userData.partId)
  const connector = definition?.connectors?.find(item => item.id === endpoint.connectorId)
  if (!connector) return null
  return { object, definition, connector }
}

function normalizedEndpoint(ref) {
  return {
    instanceId: ref.object.userData.instanceId,
    connectorId: ref.connector.id,
    connectorType: ref.connector.type,
  }
}

function geometryValid(refA, refB, rule, maxDistance = INTEGRITY_DISTANCE) {
  const distance = connectorWorldPosition(refA.object, refA.connector)
    .distanceTo(connectorWorldPosition(refB.object, refB.connector))
  if (distance > maxDistance) return false
  const dot = connectorWorldAxis(refA.object, refA.connector)
    .dot(connectorWorldAxis(refB.object, refB.connector))
  if (rule.axis === 'opposed') return dot <= -(rule.contactAlignment ?? rule.minAlignment ?? 0.9)
  return Math.abs(dot) >= (rule.minAlignment ?? 0.9)
}

function pairId(a, b) {
  return [a.userData.instanceId, b.userData.instanceId].sort().join('<>')
}

function contactSignature(a, b) {
  return [endpointKey(a.instanceId, a.connectorId), endpointKey(b.instanceId, b.connectorId)].sort().join('<>')
}

function structuralContactsBetween(objectA, objectB, used, includeUsed = new Set()) {
  const defA = findPart(objectA.userData.partId)
  const defB = findPart(objectB.userData.partId)
  const candidates = []

  for (const connectorA of defA?.connectors ?? []) {
    for (const connectorB of defB?.connectors ?? []) {
      const rule = connectorRule(connectorA.type, connectorB.type)
      if (rule?.kind !== 'fixed') continue
      const keyA = endpointKey(objectA.userData.instanceId, connectorA.id)
      const keyB = endpointKey(objectB.userData.instanceId, connectorB.id)
      if ((used.has(keyA) && !includeUsed.has(keyA)) || (used.has(keyB) && !includeUsed.has(keyB))) continue
      const refA = { object: objectA, connector: connectorA }
      const refB = { object: objectB, connector: connectorB }
      if (!geometryValid(refA, refB, rule, rule.contactTolerance ?? 0.105)) continue
      const distance = connectorWorldPosition(objectA, connectorA).distanceTo(connectorWorldPosition(objectB, connectorB))
      candidates.push({ refA, refB, keyA, keyB, distance })
    }
  }

  candidates.sort((a, b) => a.distance - b.distance)
  const localUsed = new Set()
  const contacts = []
  for (const candidate of candidates) {
    if (localUsed.has(candidate.keyA) || localUsed.has(candidate.keyB)) continue
    localUsed.add(candidate.keyA)
    localUsed.add(candidate.keyB)
    contacts.push({
      a: normalizedEndpoint(candidate.refA),
      b: normalizedEndpoint(candidate.refB),
    })
  }
  return contacts
}

function sanitizeExplicit(objects, sourceConnections) {
  const objectsById = objectIndex(objects)
  const used = new Set()
  const connections = []
  const stats = {
    droppedInvalid: 0,
    endpointConflicts: 0,
    geometryRejected: 0,
    normalizedKinds: 0,
    hydratedContacts: 0,
  }

  for (const raw of sourceConnections ?? []) {
    const refA = connectorRef(objectsById, raw?.a)
    const refB = connectorRef(objectsById, raw?.b)
    if (!refA || !refB || refA.object === refB.object) {
      stats.droppedInvalid += 1
      continue
    }
    const rule = connectorRule(refA.connector.type, refB.connector.type)
    if (!rule) {
      stats.droppedInvalid += 1
      continue
    }
    if (!geometryValid(refA, refB, rule)) {
      stats.geometryRejected += 1
      continue
    }

    const a = normalizedEndpoint(refA)
    const b = normalizedEndpoint(refB)
    const keyA = endpointKey(a.instanceId, a.connectorId)
    const keyB = endpointKey(b.instanceId, b.connectorId)
    if (used.has(keyA) || used.has(keyB)) {
      stats.endpointConflicts += 1
      continue
    }

    const normalized = {
      ...raw,
      id: raw.id || `physics:${crypto.randomUUID()}`,
      schemaVersion: 3,
      ruleVersion: CONNECTOR_RULE_VERSION,
      kind: rule.kind,
      a,
      b,
    }
    if (raw.kind !== rule.kind) stats.normalizedKinds += 1

    used.add(keyA)
    used.add(keyB)

    if (rule.multiContact) {
      const primaryKeys = new Set([keyA, keyB])
      const contacts = structuralContactsBetween(refA.object, refB.object, used, primaryKeys)
      const extras = []
      const primarySignature = contactSignature(a, b)
      for (const contact of contacts) {
        if (contactSignature(contact.a, contact.b) === primarySignature) continue
        const contactKeyA = endpointKey(contact.a.instanceId, contact.a.connectorId)
        const contactKeyB = endpointKey(contact.b.instanceId, contact.b.connectorId)
        if (used.has(contactKeyA) || used.has(contactKeyB)) continue
        used.add(contactKeyA)
        used.add(contactKeyB)
        extras.push(contact)
      }
      normalized.contactCount = 1 + extras.length
      if (extras.length) normalized.contacts = extras
      else delete normalized.contacts
      stats.hydratedContacts += extras.length
    } else {
      normalized.contactCount = 1
      delete normalized.contacts
    }
    connections.push(normalized)
  }

  return { connections, used, stats }
}

function cellCoord(value) {
  return Math.floor(value / STRUCTURAL_CELL)
}

function cellKey(position) {
  return `${cellCoord(position.x)}:${cellCoord(position.y)}:${cellCoord(position.z)}`
}

function collectFreeStructural(objects, used) {
  const studs = []
  const tubes = []
  for (const object of objects ?? []) {
    const definition = findPart(object.userData.partId)
    for (const connector of definition?.connectors ?? []) {
      if (connector.type !== 'stud' && connector.type !== 'tube') continue
      const key = endpointKey(object.userData.instanceId, connector.id)
      if (used.has(key)) continue
      const entry = {
        object,
        connector,
        key,
        position: connectorWorldPosition(object, connector),
        axis: connectorWorldAxis(object, connector),
      }
      if (connector.type === 'stud') studs.push(entry)
      else tubes.push(entry)
    }
  }
  return { studs, tubes }
}

function tubeHash(tubes) {
  const hash = new Map()
  for (const tube of tubes) {
    const key = cellKey(tube.position)
    if (!hash.has(key)) hash.set(key, [])
    hash.get(key).push(tube)
  }
  return hash
}

function nearby(entry, hash) {
  const cx = cellCoord(entry.position.x)
  const cy = cellCoord(entry.position.y)
  const cz = cellCoord(entry.position.z)
  const result = []
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        result.push(...(hash.get(`${cx + x}:${cy + y}:${cz + z}`) ?? []))
      }
    }
  }
  return result
}

function inferStructural(objects, used) {
  const { studs, tubes } = collectFreeStructural(objects, used)
  const hash = tubeHash(tubes)
  const rule = connectorRule('stud', 'tube')
  const tolerance = rule?.contactTolerance ?? 0.105
  const alignment = rule?.contactAlignment ?? 0.96
  const candidates = []

  for (const stud of studs) {
    for (const tube of nearby(stud, hash)) {
      if (stud.object === tube.object) continue
      const distance = stud.position.distanceTo(tube.position)
      if (distance > tolerance) continue
      if (stud.axis.dot(tube.axis) > -alignment) continue
      candidates.push({ stud, tube, distance })
    }
  }
  candidates.sort((a, b) => a.distance - b.distance)

  const groups = new Map()
  for (const candidate of candidates) {
    if (used.has(candidate.stud.key) || used.has(candidate.tube.key)) continue
    used.add(candidate.stud.key)
    used.add(candidate.tube.key)
    const groupKey = pairId(candidate.stud.object, candidate.tube.object)
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey).push({
      a: normalizedEndpoint({ object: candidate.stud.object, connector: candidate.stud.connector }),
      b: normalizedEndpoint({ object: candidate.tube.object, connector: candidate.tube.connector }),
    })
  }

  const inferred = []
  for (const contacts of groups.values()) {
    if (!contacts.length) continue
    const [primary, ...extras] = contacts
    inferred.push({
      id: `auto-fixed:${contactSignature(primary.a, primary.b)}`,
      schemaVersion: 3,
      kind: 'fixed',
      ruleVersion: CONNECTOR_RULE_VERSION,
      inferred: true,
      source: 'connector-physics-v3',
      contactCount: contacts.length,
      a: primary.a,
      b: primary.b,
      ...(extras.length ? { contacts: extras } : {}),
    })
  }
  return inferred
}

export function preparePhysicsConnections(objects, sourceConnections) {
  const sanitized = sanitizeExplicit(objects, Array.isArray(sourceConnections) ? sourceConnections : [])
  const inferred = inferStructural(objects, sanitized.used)
  const inferredContacts = inferred.reduce((sum, connection) => sum + (connection.contactCount ?? 1), 0)
  return {
    connections: [...sanitized.connections, ...inferred],
    stats: {
      originalConnections: Array.isArray(sourceConnections) ? sourceConnections.length : 0,
      explicitConnections: sanitized.connections.length,
      explicitFixed: sanitized.connections.filter(connection => connection.kind === 'fixed').length,
      hydratedContacts: sanitized.stats.hydratedContacts,
      inferredFixedLinks: inferred.length,
      inferredFixedContacts: inferredContacts,
      droppedInvalid: sanitized.stats.droppedInvalid,
      endpointConflicts: sanitized.stats.endpointConflicts,
      geometryRejected: sanitized.stats.geometryRejected,
      normalizedKinds: sanitized.stats.normalizedKinds,
      physicsConnections: sanitized.connections.length + inferred.length,
      connectorRuleVersion: CONNECTOR_RULE_VERSION,
    },
  }
}

PhysicsSession.prototype.build = function buildWithConnectorIntegrityV3() {
  const prepared = preparePhysicsConnections(this.objects, this.connections)
  this.connections = prepared.connections
  this.autoWeldStats = prepared.stats
  globalThis.__bricklabLastAutoWeldStats = { ...prepared.stats }
  const result = originalBuild.call(this)
  window.dispatchEvent(new CustomEvent('bricklab:autoweld', { detail: { ...prepared.stats } }))
  return result
}
