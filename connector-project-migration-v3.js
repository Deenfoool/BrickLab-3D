import * as THREE from 'three'
import { findPart } from './parts.js'
import { CONNECTOR_RULE_VERSION, connectorRule, endpointKey } from './connections.js'

const PROJECT_KEYS = ['bricklab.project.v2', 'bricklab.demo.backup.v1']
const PRIMARY_DISTANCE_TOLERANCE = 0.18
let lastNormalization = null

function partMatrix(part) {
  const position = new THREE.Vector3().fromArray(Array.isArray(part.position) ? part.position : [0, 0, 0])
  const rotation = Array.isArray(part.rotation) ? part.rotation : [0, 0, 0]
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0, 'XYZ'))
  return {
    matrix: new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)),
    quaternion,
  }
}

function ref(parts, endpoint) {
  const part = parts.get(endpoint?.instanceId)
  if (!part) return null
  const definition = findPart(part.partId)
  const connector = definition?.connectors?.find(item => item.id === endpoint.connectorId)
  if (!connector) return null
  return { part, definition, connector, ...partMatrix(part) }
}

function worldPosition(reference) {
  return new THREE.Vector3(...reference.connector.position).applyMatrix4(reference.matrix)
}

function worldAxis(reference) {
  return new THREE.Vector3(...reference.connector.axis).normalize().applyQuaternion(reference.quaternion).normalize()
}

function normalizedEndpoint(reference) {
  return {
    instanceId: reference.part.instanceId,
    connectorId: reference.connector.id,
    connectorType: reference.connector.type,
  }
}

function contactSignature(a, b) {
  return [endpointKey(a.instanceId, a.connectorId), endpointKey(b.instanceId, b.connectorId)].sort().join('<>')
}

function geometryValid(referenceA, referenceB, rule, maxDistance = PRIMARY_DISTANCE_TOLERANCE) {
  const distance = worldPosition(referenceA).distanceTo(worldPosition(referenceB))
  if (distance > maxDistance) return false
  const dot = worldAxis(referenceA).dot(worldAxis(referenceB))
  if (rule.axis === 'opposed') return dot <= -(rule.contactAlignment ?? rule.minAlignment ?? 0.9)
  return Math.abs(dot) >= (rule.minAlignment ?? 0.9)
}

function fixedExtras(parts, partA, partB, occupied, primaryA, primaryB) {
  const definitionA = findPart(partA.partId)
  const definitionB = findPart(partB.partId)
  const primaryKeyA = endpointKey(primaryA.instanceId, primaryA.connectorId)
  const primaryKeyB = endpointKey(primaryB.instanceId, primaryB.connectorId)
  const primarySignature = contactSignature(primaryA, primaryB)
  const candidates = []

  for (const connectorA of definitionA?.connectors ?? []) {
    for (const connectorB of definitionB?.connectors ?? []) {
      const rule = connectorRule(connectorA.type, connectorB.type)
      if (rule?.kind !== 'fixed') continue
      const referenceA = ref(parts, { instanceId: partA.instanceId, connectorId: connectorA.id })
      const referenceB = ref(parts, { instanceId: partB.instanceId, connectorId: connectorB.id })
      if (!referenceA || !referenceB) continue
      const keyA = endpointKey(partA.instanceId, connectorA.id)
      const keyB = endpointKey(partB.instanceId, connectorB.id)
      if (keyA === primaryKeyA || keyB === primaryKeyB) continue
      if (occupied.has(keyA) || occupied.has(keyB)) continue
      if (!geometryValid(referenceA, referenceB, rule, rule.contactTolerance ?? 0.105)) continue
      candidates.push({
        a: normalizedEndpoint(referenceA),
        b: normalizedEndpoint(referenceB),
        keyA,
        keyB,
        distance: worldPosition(referenceA).distanceTo(worldPosition(referenceB)),
      })
    }
  }

  candidates.sort((a, b) => a.distance - b.distance)
  const localUsed = new Set()
  const extras = []
  for (const candidate of candidates) {
    if (localUsed.has(candidate.keyA) || localUsed.has(candidate.keyB)) continue
    if (contactSignature(candidate.a, candidate.b) === primarySignature) continue
    localUsed.add(candidate.keyA)
    localUsed.add(candidate.keyB)
    occupied.add(candidate.keyA)
    occupied.add(candidate.keyB)
    extras.push({ a: candidate.a, b: candidate.b })
  }
  return extras
}

export function normalizeProjectConnections(project) {
  if (!project || !Array.isArray(project.parts)) return project
  if (!Array.isArray(project.connections)) project.connections = []

  const parts = new Map(project.parts.filter(part => part?.instanceId).map(part => [part.instanceId, part]))
  const occupied = new Set()
  const normalized = []
  const stats = {
    inputConnections: project.connections.length,
    keptConnections: 0,
    hydratedContacts: 0,
    droppedMissing: 0,
    droppedIncompatible: 0,
    droppedGeometry: 0,
    endpointConflicts: 0,
  }

  for (const raw of project.connections) {
    const referenceA = ref(parts, raw?.a)
    const referenceB = ref(parts, raw?.b)
    if (!referenceA || !referenceB || referenceA.part === referenceB.part) {
      stats.droppedMissing += 1
      continue
    }

    const rule = connectorRule(referenceA.connector.type, referenceB.connector.type)
    if (!rule) {
      stats.droppedIncompatible += 1
      continue
    }
    if (!geometryValid(referenceA, referenceB, rule)) {
      stats.droppedGeometry += 1
      continue
    }

    const a = normalizedEndpoint(referenceA)
    const b = normalizedEndpoint(referenceB)
    const keyA = endpointKey(a.instanceId, a.connectorId)
    const keyB = endpointKey(b.instanceId, b.connectorId)
    if (occupied.has(keyA) || occupied.has(keyB)) {
      stats.endpointConflicts += 1
      continue
    }

    occupied.add(keyA)
    occupied.add(keyB)
    const connection = {
      ...raw,
      id: raw?.id || `migrated:${contactSignature(a, b)}`,
      schemaVersion: 3,
      ruleVersion: CONNECTOR_RULE_VERSION,
      kind: rule.kind,
      a,
      b,
    }

    if (rule.multiContact) {
      const extras = fixedExtras(parts, referenceA.part, referenceB.part, occupied, a, b)
      connection.contactCount = 1 + extras.length
      if (extras.length) connection.contacts = extras
      else delete connection.contacts
      stats.hydratedContacts += extras.length
    } else {
      connection.contactCount = 1
      delete connection.contacts
    }

    normalized.push(connection)
  }

  project.connections = normalized
  stats.keptConnections = normalized.length
  lastNormalization = stats
  return project
}

function migrateStoredProject(key) {
  const raw = localStorage.getItem(key)
  if (!raw) return false
  try {
    const project = JSON.parse(raw)
    const before = JSON.stringify(project.connections ?? [])
    normalizeProjectConnections(project)
    const after = JSON.stringify(project.connections ?? [])
    if (before === after) return false
    localStorage.setItem(key, JSON.stringify(project))
    return true
  } catch (error) {
    console.warn(`[BrickLab] could not migrate connector data in ${key}`, error)
    return false
  }
}

let migrated = 0
for (const key of PROJECT_KEYS) if (migrateStoredProject(key)) migrated += 1

globalThis.BrickLabProjectConnectors = Object.freeze({
  version: CONNECTOR_RULE_VERSION,
  normalizeProject: normalizeProjectConnections,
  migratedStoredProjects: migrated,
  get lastNormalization() { return lastNormalization },
})
