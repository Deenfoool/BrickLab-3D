import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'
import { connectorWorldAxis, connectorWorldPosition } from './snapping.js'
import {
  CONNECTOR_RULE_VERSION,
  connectionEndpoints,
  endpointKey,
} from './connections.js'

const RECOVERY_DISTANCE_STUD = 0.12
const RECOVERY_ALIGNMENT = 0.985
const originalBuild = PhysicsSession.prototype.build

function validEndpoint(objectsById, endpoint) {
  const object = objectsById.get(endpoint?.instanceId)
  if (!object) return false
  const definition = findPart(object.userData?.partId)
  return Boolean(definition?.connectors?.some(connector => connector.id === endpoint?.connectorId))
}

function usedEndpointKeys(objectsById, connections) {
  const used = new Set()
  for (const connection of connections ?? []) {
    for (const endpoint of connectionEndpoints(connection)) {
      if (!validEndpoint(objectsById, endpoint)) continue
      used.add(endpointKey(endpoint.instanceId, endpoint.connectorId))
    }
  }
  return used
}

function mechanicalEndpoints(objects, used) {
  const axles = []
  const holes = []

  for (const object of objects ?? []) {
    const definition = findPart(object.userData?.partId)
    for (const connector of definition?.connectors ?? []) {
      if (connector.type !== 'axle' && connector.type !== 'axle-hole') continue
      const key = endpointKey(object.userData.instanceId, connector.id)
      if (used.has(key)) continue

      const endpoint = {
        object,
        connector,
        key,
        position: connectorWorldPosition(object, connector),
        axis: connectorWorldAxis(object, connector).normalize(),
      }
      if (connector.type === 'axle') axles.push(endpoint)
      else holes.push(endpoint)
    }
  }

  return { axles, holes }
}

function normalizedEndpoint(entry) {
  return {
    instanceId: entry.object.userData.instanceId,
    connectorId: entry.connector.id,
    connectorType: entry.connector.type,
  }
}

function recoverAxleConnections(objects, sourceConnections) {
  const objectsById = new Map((objects ?? []).map(object => [object.userData.instanceId, object]))
  const used = usedEndpointKeys(objectsById, sourceConnections)
  const { axles, holes } = mechanicalEndpoints(objects, used)
  const candidates = []

  for (const axle of axles) {
    for (const hole of holes) {
      if (axle.object === hole.object) continue

      const distance = axle.position.distanceTo(hole.position)
      if (distance > RECOVERY_DISTANCE_STUD) continue

      const alignment = Math.abs(axle.axis.dot(hole.axis))
      if (alignment < RECOVERY_ALIGNMENT) continue

      // Distance dominates. Alignment is only a tie-breaker for coincident ports.
      const score = distance + (1 - alignment) * 0.04
      candidates.push({ axle, hole, distance, alignment, score })
    }
  }

  candidates.sort((a, b) => a.score - b.score)
  const recovered = []

  for (const candidate of candidates) {
    if (used.has(candidate.axle.key) || used.has(candidate.hole.key)) continue
    used.add(candidate.axle.key)
    used.add(candidate.hole.key)

    const a = normalizedEndpoint(candidate.axle)
    const b = normalizedEndpoint(candidate.hole)
    recovered.push({
      id: `auto-axle:${a.instanceId}:${a.connectorId}:${b.instanceId}:${b.connectorId}`,
      schemaVersion: 3,
      ruleVersion: CONNECTOR_RULE_VERSION,
      kind: 'axle',
      inferred: true,
      source: 'connector-mechanical-recovery-v4',
      contactCount: 1,
      a,
      b,
      recovery: {
        distanceStud: candidate.distance,
        alignment: candidate.alignment,
      },
    })
  }

  return recovered
}

PhysicsSession.prototype.build = function buildWithMechanicalRecoveryV4() {
  const source = Array.isArray(this.connections) ? this.connections : []
  const recovered = recoverAxleConnections(this.objects, source)
  if (recovered.length) this.connections = [...source, ...recovered]

  globalThis.__bricklabMechanicalRecovery = {
    recoveredAxleLinks: recovered.length,
    links: recovered.map(connection => ({
      a: connection.a,
      b: connection.b,
      distanceStud: connection.recovery.distanceStud,
      alignment: connection.recovery.alignment,
    })),
  }

  return originalBuild.call(this)
}

export const MECHANICAL_RECOVERY_VERSION = 'mechanical-recovery-v4'
