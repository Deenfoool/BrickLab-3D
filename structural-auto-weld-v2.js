import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'
import { connectorWorldAxis, connectorWorldPosition } from './snapping.js'
import { endpointKey } from './connections.js'

const POSITION_TOLERANCE = 0.14
const AXIS_ALIGNMENT = -0.94
const CELL_SIZE = 0.18

const originalBuild = PhysicsSession.prototype.build

function cellCoord(value) {
  return Math.floor(value / CELL_SIZE)
}

function cellKey(position) {
  return `${cellCoord(position.x)}:${cellCoord(position.y)}:${cellCoord(position.z)}`
}

function usedEndpointSet(connections) {
  const used = new Set()
  for (const connection of connections ?? []) {
    if (connection?.a?.instanceId && connection?.a?.connectorId) {
      used.add(endpointKey(connection.a.instanceId, connection.a.connectorId))
    }
    if (connection?.b?.instanceId && connection?.b?.connectorId) {
      used.add(endpointKey(connection.b.instanceId, connection.b.connectorId))
    }
  }
  return used
}

function collectStructuralConnectors(objects, used) {
  const studs = []
  const tubes = []

  for (const object of objects ?? []) {
    object.updateWorldMatrix(true, false)
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
        axis: connectorWorldAxis(object, connector).normalize(),
      }
      if (connector.type === 'stud') studs.push(entry)
      else tubes.push(entry)
    }
  }

  return { studs, tubes }
}

function buildTubeHash(tubes) {
  const hash = new Map()
  for (const tube of tubes) {
    const key = cellKey(tube.position)
    if (!hash.has(key)) hash.set(key, [])
    hash.get(key).push(tube)
  }
  return hash
}

function nearbyTubes(stud, hash) {
  const cx = cellCoord(stud.position.x)
  const cy = cellCoord(stud.position.y)
  const cz = cellCoord(stud.position.z)
  const results = []

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const bucket = hash.get(`${cx + dx}:${cy + dy}:${cz + dz}`)
        if (bucket) results.push(...bucket)
      }
    }
  }
  return results
}

function inferredFixedConnection(stud, tube) {
  return {
    id: `auto-fixed:${stud.object.userData.instanceId}:${stud.connector.id}|${tube.object.userData.instanceId}:${tube.connector.id}`,
    kind: 'fixed',
    inferred: true,
    source: 'structural-auto-weld-v2',
    a: {
      instanceId: stud.object.userData.instanceId,
      connectorId: stud.connector.id,
      connectorType: 'stud',
    },
    b: {
      instanceId: tube.object.userData.instanceId,
      connectorId: tube.connector.id,
      connectorType: 'tube',
    },
  }
}

export function inferStructuralWelds(objects, connections) {
  const existing = Array.isArray(connections) ? connections : []
  const used = usedEndpointSet(existing)
  const { studs, tubes } = collectStructuralConnectors(objects, used)
  const tubeHash = buildTubeHash(tubes)
  const candidates = []

  for (const stud of studs) {
    for (const tube of nearbyTubes(stud, tubeHash)) {
      if (stud.object === tube.object) continue
      const distance = stud.position.distanceTo(tube.position)
      if (distance > POSITION_TOLERANCE) continue

      const axisDot = stud.axis.dot(tube.axis)
      if (axisDot > AXIS_ALIGNMENT) continue

      // Distance dominates; axis error only breaks ties between nearly identical candidates.
      const score = distance + (axisDot + 1) * -0.01
      candidates.push({ stud, tube, distance, axisDot, score })
    }
  }

  candidates.sort((a, b) => a.score - b.score)

  const inferred = []
  for (const candidate of candidates) {
    if (used.has(candidate.stud.key) || used.has(candidate.tube.key)) continue
    used.add(candidate.stud.key)
    used.add(candidate.tube.key)
    inferred.push(inferredFixedConnection(candidate.stud, candidate.tube))
  }

  return inferred
}

PhysicsSession.prototype.build = function buildWithStructuralAutoWeld() {
  const explicitConnections = Array.isArray(this.connections) ? this.connections : []
  const inferred = inferStructuralWelds(this.objects, explicitConnections)

  if (inferred.length) this.connections = [...explicitConnections, ...inferred]

  const explicitFixed = explicitConnections.filter(connection => connection.kind === 'fixed').length
  this.autoWeldStats = {
    explicitFixed,
    inferredFixed: inferred.length,
    totalFixed: explicitFixed + inferred.length,
    originalConnections: explicitConnections.length,
    physicsConnections: this.connections.length,
  }
  globalThis.__bricklabLastAutoWeldStats = { ...this.autoWeldStats }

  const result = originalBuild.call(this)

  window.dispatchEvent(new CustomEvent('bricklab:autoweld', {
    detail: { ...this.autoWeldStats },
  }))
  return result
}
