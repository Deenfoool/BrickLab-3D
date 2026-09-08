import * as THREE from 'three'
import { findPart } from './parts.js'
import { CONNECTOR_RULE_VERSION, connectorRule, endpointKey } from './connections.js'

const PROJECT_KEYS = ['bricklab.project.v2', 'bricklab.demo.backup.v1']

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
  return { part, connector, ...partMatrix(part) }
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

function hydrateFixed(project, parts, connection, owners) {
  const partA = parts.get(connection.a?.instanceId)
  const partB = parts.get(connection.b?.instanceId)
  if (!partA || !partB) return false
  const defA = findPart(partA.partId)
  const defB = findPart(partB.partId)
  if (!defA || !defB) return false

  const primaryA = ref(parts, connection.a)
  const primaryB = ref(parts, connection.b)
  if (!primaryA || !primaryB) return false
  const primaryRule = connectorRule(primaryA.connector.type, primaryB.connector.type)
  if (primaryRule?.kind !== 'fixed') return false

  connection.a = normalizedEndpoint(primaryA)
  connection.b = normalizedEndpoint(primaryB)
  connection.kind = 'fixed'
  connection.ruleVersion = CONNECTOR_RULE_VERSION
  connection.schemaVersion = 3

  const candidates = []
  for (const connectorA of defA.connectors ?? []) {
    for (const connectorB of defB.connectors ?? []) {
      const rule = connectorRule(connectorA.type, connectorB.type)
      if (rule?.kind !== 'fixed') continue
      const refA = ref(parts, { instanceId: partA.instanceId, connectorId: connectorA.id })
      const refB = ref(parts, { instanceId: partB.instanceId, connectorId: connectorB.id })
      const keyA = endpointKey(partA.instanceId, connectorA.id)
      const keyB = endpointKey(partB.instanceId, connectorB.id)
      const ownerA = owners.get(keyA)
      const ownerB = owners.get(keyB)
      if ((ownerA && ownerA !== connection.id) || (ownerB && ownerB !== connection.id)) continue
      const distance = worldPosition(refA).distanceTo(worldPosition(refB))
      if (distance > (rule.contactTolerance ?? 0.105)) continue
      if (worldAxis(refA).dot(worldAxis(refB)) > -(rule.contactAlignment ?? 0.96)) continue
      candidates.push({ refA, refB, keyA, keyB, distance })
    }
  }
  candidates.sort((a, b) => a.distance - b.distance)

  const primarySignature = contactSignature(connection.a, connection.b)
  const localUsed = new Set()
  const extras = []
  for (const candidate of candidates) {
    if (localUsed.has(candidate.keyA) || localUsed.has(candidate.keyB)) continue
    localUsed.add(candidate.keyA)
    localUsed.add(candidate.keyB)
    const a = normalizedEndpoint(candidate.refA)
    const b = normalizedEndpoint(candidate.refB)
    if (contactSignature(a, b) === primarySignature) continue
    extras.push({ a, b })
    owners.set(candidate.keyA, connection.id)
    owners.set(candidate.keyB, connection.id)
  }

  if (extras.length) connection.contacts = extras
  else delete connection.contacts
  connection.contactCount = 1 + extras.length
  return true
}

export function normalizeProjectConnections(project) {
  if (!project || !Array.isArray(project.parts) || !Array.isArray(project.connections)) return project
  const parts = new Map(project.parts.filter(part => part?.instanceId).map(part => [part.instanceId, part]))
  const owners = new Map()

  for (const connection of project.connections) {
    for (const endpoint of [connection?.a, connection?.b]) {
      if (endpoint?.instanceId && endpoint?.connectorId) owners.set(endpointKey(endpoint.instanceId, endpoint.connectorId), connection.id)
    }
  }

  for (const connection of project.connections) {
    const refA = ref(parts, connection?.a)
    const refB = ref(parts, connection?.b)
    if (!refA || !refB) continue
    const rule = connectorRule(refA.connector.type, refB.connector.type)
    connection.a = normalizedEndpoint(refA)
    connection.b = normalizedEndpoint(refB)
    if (!rule) continue
    connection.kind = rule.kind
    connection.ruleVersion = CONNECTOR_RULE_VERSION
    connection.schemaVersion = 3
    if (rule.multiContact) hydrateFixed(project, parts, connection, owners)
    else {
      delete connection.contacts
      connection.contactCount = 1
    }
  }
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
})
