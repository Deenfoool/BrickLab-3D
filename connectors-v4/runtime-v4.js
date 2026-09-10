import { PARTS, findPart } from '../parts.js'
import { CONNECTOR_SCHEMA_VERSION_V4, CONNECTOR_SYSTEM_VERSION_V4, SHADOW_SOURCE_V4 } from './schema-v4.js'
import { matchConnectorV4 } from './matcher-v4.js'
import { connectorToBrickLabV4, createShadowResolverV4 } from './shadow-resolver-v4.js'
import { finalizeConnectorIdentitiesV4 } from './identity-v4.js'
import { applyPlacementV4, connectorWorldFrameV4, solvePlacementV4 } from './placement-solver-v4.js'
import { findBestPlacementCandidateV4, findPlacementCandidatesV4 } from './candidate-v4.js'
import { createConnectionGraphV4, createConnectionProposalV4 } from './connections-v4.js'
import { auditConnectorDefinitionV4 } from './audit-v4.js'
import { proposeConstraintV4 } from './constraints-v4.js'
import { createAxialOccupancyV4 } from './occupancy-v4.js'
import { ACTIVATION_POLICY_VERSION_V4, certifyCandidateV4, certifyConnectivityV4 } from './activation-v4.js'
import { runConnectorV4SelfTest } from './selftest-v4.js'
import { validateConnectedGeometryV4 } from './validity-v4.js'
import {
  clearPersistedGraphV4,
  persistGraphV4,
  projectWithConnectionsV4,
  pruneGraphForObjectsV4,
  restorePersistedGraphV4,
  restoreRecordsIntoGraphV4,
} from './persistence-v4.js'

const LDRAW_RAW_ROOT = 'https://raw.githubusercontent.com/pybricks/ldraw/master/'
const SHADOW_RAW_ROOT = `https://raw.githubusercontent.com/${SHADOW_SOURCE_V4.repository}/${SHADOW_SOURCE_V4.commit}/`
const SHADOW_TREE_URL = `https://api.github.com/repos/${SHADOW_SOURCE_V4.repository}/git/trees/${SHADOW_SOURCE_V4.commit}?recursive=1`
const hydration = new Map()
const status = new Map()
const lastRoots = new Map()
const wrappedDefinitions = new WeakSet()
const occupancy = createAxialOccupancyV4()
const connectionGraph = createConnectionGraphV4()
const selfTest = runConnectorV4SelfTest()
const runtimeMode = selfTest.pass ? 'hybrid-pilot' : 'observe-safe'
let shadowManifestPromise = null
let manifestFallbackWarned = false

const normalizedPath = value => String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
const encodedPath = value => String(value || '').split('/').map(encodeURIComponent).join('/')

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))
}

async function fetchTextOrNull(url) {
  const response = await fetch(url, { mode:'cors', cache:'force-cache' })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return response.text()
}

async function shadowManifest() {
  if (shadowManifestPromise) return shadowManifestPromise
  shadowManifestPromise = (async () => {
    const response = await fetch(SHADOW_TREE_URL, {
      mode:'cors', cache:'force-cache', headers:{ Accept:'application/vnd.github+json' },
    })
    if (!response.ok) throw new Error(`Shadow manifest HTTP ${response.status}`)
    const data = await response.json()
    if (!Array.isArray(data.tree) || data.truncated) throw new Error('Shadow manifest is missing or truncated')
    const map = new Map()
    for (const item of data.tree) {
      if (item.type !== 'blob' || !/\.dat$/i.test(item.path || '')) continue
      map.set(normalizedPath(item.path), item.path)
    }
    return map
  })()
  try { return await shadowManifestPromise }
  catch (error) {
    shadowManifestPromise = null
    throw error
  }
}

async function fetchShadowText(path) {
  const normalized = normalizedPath(path)
  try {
    const manifest = await shadowManifest()
    const actualPath = manifest.get(normalized)
    if (!actualPath) return null
    return fetchTextOrNull(`${SHADOW_RAW_ROOT}${encodedPath(actualPath)}`)
  } catch (error) {
    if (!manifestFallbackWarned) {
      manifestFallbackWarned = true
      console.warn('[BrickLab Connector V4] Shadow manifest unavailable; using direct shadow lookup.', error)
    }
    return fetchTextOrNull(`${SHADOW_RAW_ROOT}${encodedPath(normalized)}`)
  }
}

const resolver = createShadowResolverV4({
  fetchOfficialText: path => fetchTextOrNull(`${LDRAW_RAW_ROOT}${encodedPath(path)}`),
  fetchShadowText,
})

function isLDrawDefinition(def) {
  return Boolean(def?.ldraw?.file && String(def.id || '').startsWith('ldraw-'))
}

function publish(def, detail = {}) {
  window.dispatchEvent(new CustomEvent('bricklab:connectorv4', {
    detail: {
      partId: def?.id ?? null,
      file: def?.ldraw?.file ?? null,
      schemaVersion: CONNECTOR_SCHEMA_VERSION_V4,
      systemVersion: CONNECTOR_SYSTEM_VERSION_V4,
      mode: runtimeMode,
      ...detail,
    },
  }))
}

function publishRuntime(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(type, {
    detail: {
      schemaVersion: CONNECTOR_SCHEMA_VERSION_V4,
      systemVersion: CONNECTOR_SYSTEM_VERSION_V4,
      activationPolicyVersion: ACTIVATION_POLICY_VERSION_V4,
      mode: runtimeMode,
      ...detail,
    },
  }))
}

function visualOffsetFor(def, root = lastRoots.get(def?.id)) {
  if (!root) return null
  const visual = root.children?.find?.(child => child?.userData?.ldrawVisual)
  if (!visual?.position) return null
  return [visual.position.x, visual.position.y, visual.position.z]
}

function instrumentDefinition(def) {
  if (!isLDrawDefinition(def) || wrappedDefinitions.has(def) || typeof def.create !== 'function') return
  const originalCreate = def.create
  def.create = function connectorV4ObservedCreate(...args) {
    const root = originalCreate.apply(this, args)
    if (root) {
      lastRoots.set(def.id, root)
      queueMicrotask(() => { if (def.ldraw?.ready) void hydrateConnectorV4(def, root) })
    }
    return root
  }
  wrappedDefinitions.add(def)
}

function finalizeResolved(resolved, offset) {
  const identity = finalizeConnectorIdentitiesV4(resolved.file, resolved.connectors)
  const connectors = identity.connectors.map(connector => connectorToBrickLabV4(connector, offset))
  return { connectors, identity }
}

export async function hydrateConnectorV4(defOrId, rootOverride = null) {
  const def = typeof defOrId === 'string' ? findPart(defOrId) : defOrId
  if (!isLDrawDefinition(def)) return null
  if (!def.ldraw?.ready) return null
  if (def.connectivityV4?.status === 'ready' && def.connectivityV4.systemVersion === CONNECTOR_SYSTEM_VERSION_V4) return def.connectivityV4
  if (hydration.has(def.id)) return hydration.get(def.id)

  const promise = (async () => {
    status.set(def.id, 'loading')
    def.connectivityV4 = {
      schemaVersion: CONNECTOR_SCHEMA_VERSION_V4,
      systemVersion: CONNECTOR_SYSTEM_VERSION_V4,
      status:'loading', source:SHADOW_SOURCE_V4, mode:runtimeMode, connectors:[], warnings:[],
    }
    publish(def, { status:'loading' })

    try {
      const resolved = await resolver.resolve(def.ldraw.file)
      const offset = visualOffsetFor(def, rootOverride)
      if (!offset) throw new Error('LDraw visual offset is not available yet; V4 hydration waits for an instantiated visual')
      const finalized = finalizeResolved(resolved, offset)
      def.connectivityV4 = {
        schemaVersion:CONNECTOR_SCHEMA_VERSION_V4,
        systemVersion:CONNECTOR_SYSTEM_VERSION_V4,
        status:'ready', source:SHADOW_SOURCE_V4, mode:runtimeMode, connectors:finalized.connectors,
        warnings:resolved.warnings,
        stats:{
          ...resolved.stats,
          identityInput:finalized.identity.stats.input,
          identityOutput:finalized.identity.stats.output,
          deduplicated:finalized.identity.stats.deduplicated,
        },
        visualOffsetStud:[...offset],
      }
      const health = certifyConnectivityV4(def)
      def.connectivityV4.health = health
      status.set(def.id, health.pass ? 'ready' : 'quarantined')
      publish(def, {
        status:health.pass ? 'ready' : 'quarantined',
        connectors:finalized.connectors.length,
        warnings:resolved.warnings.length,
        deduplicated:finalized.identity.stats.deduplicated,
        health,
      })
      return def.connectivityV4
    } catch (error) {
      const message = String(error?.message || error)
      def.connectivityV4 = {
        schemaVersion:CONNECTOR_SCHEMA_VERSION_V4,
        systemVersion:CONNECTOR_SYSTEM_VERSION_V4,
        status:'error', source:SHADOW_SOURCE_V4, mode:runtimeMode, connectors:[],
        warnings:[{ code:'hydrate-error', detail:message }],
      }
      status.set(def.id, 'error')
      console.warn(`[BrickLab Connector V4] Could not resolve ${def.ldraw.file}`, error)
      publish(def, { status:'error', error:message })
      return def.connectivityV4
    } finally {
      hydration.delete(def.id)
    }
  })()
  hydration.set(def.id, promise)
  return promise
}

function scanReadyDefinitions() {
  for (const def of PARTS) {
    if (!isLDrawDefinition(def)) continue
    instrumentDefinition(def)
    if (def.ldraw?.ready && lastRoots.has(def.id) && (def.connectivityV4?.status !== 'ready' || def.connectivityV4.systemVersion !== CONNECTOR_SYSTEM_VERSION_V4) && !hydration.has(def.id)) {
      void hydrateConnectorV4(def)
    }
  }
}

function connectorForEndpoint(partId, endpointId) {
  return findPart(partId)?.connectivityV4?.connectors?.find(connector => connector.endpointId === endpointId) ?? null
}

function objectIndex(objects) {
  return new Map((objects ?? []).filter(Boolean).map(object => [object.userData?.instanceId, object]))
}

function reconcileGraph(objects, { persist = true } = {}) {
  const pruned = pruneGraphForObjectsV4(connectionGraph, objects)
  const byId = objectIndex(objects)
  let invalidGeometry = 0
  let missingEndpoint = 0
  let pending = 0
  const removed = [...pruned.reasons]

  for (const record of connectionGraph.list()) {
    const objectA = byId.get(record.a.instanceId)
    const objectB = byId.get(record.b.instanceId)
    if (!objectA || !objectB) continue
    const defA = findPart(objectA.userData.partId)
    const defB = findPart(objectB.userData.partId)
    if (defA?.connectivityV4?.status !== 'ready' || defB?.connectivityV4?.status !== 'ready') {
      pending += 1
      continue
    }
    const connectorA = connectorForEndpoint(objectA.userData.partId, record.a.endpointId)
    const connectorB = connectorForEndpoint(objectB.userData.partId, record.b.endpointId)
    if (!connectorA || !connectorB) {
      connectionGraph.remove(record.id)
      missingEndpoint += 1
      removed.push({ connectionId:record.id, reason:'missing-endpoint' })
      continue
    }
    const validity = validateConnectedGeometryV4(objectA, connectorA, objectB, connectorB)
    if (!validity.valid) {
      connectionGraph.remove(record.id)
      invalidGeometry += 1
      removed.push({ connectionId:record.id, reason:`geometry:${validity.reason}` })
    }
  }

  if (persist && removed.length) persistGraphV4(connectionGraph)
  if (removed.length) publishRuntime('bricklab:connectorv4reconcile', { removed:clone(removed) })
  return {
    removed:removed.length,
    staleObjects:pruned.removed,
    missingEndpoint,
    invalidGeometry,
    pending,
    kept:connectionGraph.list().length,
    reasons:removed,
  }
}

const candidateOptions = options => ({ ...options, getDefinition:findPart })

function certifiedCandidate(movingObject, targetObjects, options = {}) {
  if (!selfTest.pass) return null
  reconcileGraph([movingObject, ...(targetObjects ?? [])])
  const candidates = findPlacementCandidatesV4(movingObject, targetObjects, candidateOptions({ ...options, maxResults:Math.max(24, options.maxResults ?? 0) }))
  for (const candidate of candidates) {
    const certification = certifyCandidateV4(candidate, findPart)
    if (!certification.pass || !certification.activation?.editor || !certification.activation?.graph) continue
    let proposal
    try { proposal = createConnectionProposalV4(candidate, { metadata:{ activation:certification.activation } }) }
    catch { continue }
    if (!proposal.occupancyReady || connectionGraph.get(proposal.id)) continue
    const availability = connectionGraph.canAdd(proposal)
    if (!availability.accepted) continue
    return {
      ...candidate,
      v4Active:true,
      placementOnly:true,
      certification,
      proposal,
    }
  }
  return null
}

function restorePose(object, position, quaternion) {
  object.position.fromArray(position)
  object.quaternion.fromArray(quaternion).normalize()
  object.updateMatrixWorld?.(true)
}

function commitCertifiedCandidate(candidate) {
  if (!selfTest.pass || !candidate?.v4Active) return { accepted:false, reason:'v4-not-active' }
  const certification = certifyCandidateV4(candidate, findPart)
  if (!certification.pass) return { accepted:false, reason:`certification:${certification.reason}`, certification }

  let proposal
  try { proposal = createConnectionProposalV4(candidate, { metadata:{ activation:certification.activation } }) }
  catch (error) { return { accepted:false, reason:'proposal-error', error:String(error?.message || error) } }
  if (!proposal.occupancyReady) return { accepted:false, reason:'occupancy-not-ready' }
  if (connectionGraph.get(proposal.id)) return { accepted:false, reason:'duplicate-connection' }
  const availability = connectionGraph.canAdd(proposal)
  if (!availability.accepted) return { accepted:false, reason:'occupied', conflicts:availability.conflicts }

  proposal.activation = clone(certification.activation)
  proposal.physicsReady = certification.activation.physics === true
  proposal.metadata = {
    ...(proposal.metadata || {}),
    activationPolicyVersion:ACTIVATION_POLICY_VERSION_V4,
    systemVersion:CONNECTOR_SYSTEM_VERSION_V4,
  }

  const object = candidate.sourceObject
  const previousPosition = object.position.toArray()
  const previousQuaternion = object.quaternion.toArray()
  try {
    applyPlacementV4(object, candidate.solution)
    const validity = validateConnectedGeometryV4(candidate.sourceObject, candidate.source, candidate.targetObject, candidate.target)
    if (!validity.valid) {
      restorePose(object, previousPosition, previousQuaternion)
      return { accepted:false, reason:`post-placement:${validity.reason}`, validity }
    }
    const added = connectionGraph.add(proposal)
    if (!added.accepted) {
      restorePose(object, previousPosition, previousQuaternion)
      return { accepted:false, reason:added.reason || 'graph-rejected', conflicts:added.conflicts || [] }
    }
    persistGraphV4(connectionGraph)
    publishRuntime('bricklab:connectorv4commit', {
      connectionId:added.connection.id,
      family:certification.activation.family,
      physicsReady:Boolean(added.connection.physicsReady),
    })
    return { accepted:true, connection:added.connection, validity, certification }
  } catch (error) {
    restorePose(object, previousPosition, previousQuaternion)
    return { accepted:false, reason:'commit-error', error:String(error?.message || error) }
  }
}

window.addEventListener('bricklab:ldrawloaded', event => {
  const def = findPart(event.detail?.id)
  if (def) { instrumentDefinition(def); void hydrateConnectorV4(def) }
})
window.addEventListener('bricklab:partcatalogchange', scanReadyDefinitions)
scanReadyDefinitions()

const requestedStartMode = globalThis.__bricklabConnectorV4StartMode
let restoreResult = { restored:0, rejected:0, errors:[] }
if (requestedStartMode === 'new' || requestedStartMode === 'open') {
  connectionGraph.clear()
  clearPersistedGraphV4()
} else {
  restoreResult = restorePersistedGraphV4(connectionGraph)
}

if (!selfTest.pass) {
  console.error('[BrickLab Connector V4] Runtime self-test failed; active V4 snapping is disabled.', selfTest)
}
publishRuntime('bricklab:connectorv4runtime', { selfTest, restoreResult })

export const BrickLabConnectorV4 = Object.freeze({
  schemaVersion:CONNECTOR_SCHEMA_VERSION_V4,
  systemVersion:CONNECTOR_SYSTEM_VERSION_V4,
  activationPolicyVersion:ACTIVATION_POLICY_VERSION_V4,
  source:SHADOW_SOURCE_V4,
  mode:runtimeMode,
  selfTest,
  occupancy,
  connectionGraph,
  async resolve(file, visualOffsetStud = [0,0,0]) {
    const resolved = await resolver.resolve(file)
    const finalized = finalizeResolved(resolved, visualOffsetStud)
    return { ...resolved, connectors:finalized.connectors, identity:finalized.identity.stats }
  },
  hydrate:hydrateConnectorV4,
  async hydrateObjects(objects) {
    const tasks = []
    for (const object of objects ?? []) {
      const def = findPart(object?.userData?.partId)
      if (isLDrawDefinition(def) && def.ldraw?.ready) tasks.push(hydrateConnectorV4(def, object))
    }
    return Promise.all(tasks)
  },
  get(partId) { return findPart(partId)?.connectivityV4 ?? null },
  getConnector(partId, endpointId) { return connectorForEndpoint(partId, endpointId) },
  health(partId) { return certifyConnectivityV4(findPart(partId)) },
  match:matchConnectorV4,
  worldFrame:connectorWorldFrameV4,
  solvePlacement:solvePlacementV4,
  applyPlacement:applyPlacementV4,
  findCandidates(movingObject, targetObjects, options = {}) {
    return findPlacementCandidatesV4(movingObject, targetObjects, candidateOptions(options))
  },
  findCandidate(movingObject, targetObjects, options = {}) {
    return findBestPlacementCandidateV4(movingObject, targetObjects, candidateOptions(options))
  },
  findActiveCandidate:certifiedCandidate,
  commitActiveCandidate:commitCertifiedCandidate,
  proposeConnection(candidate, options = {}) { return createConnectionProposalV4(candidate, options) },
  proposeConstraint:proposeConstraintV4,
  audit:auditConnectorDefinitionV4,
  reconcileGraph,
  removePartConnections(instanceId) {
    const removed = connectionGraph.removePart(instanceId)
    if (removed) persistGraphV4(connectionGraph)
    return removed
  },
  clearGraph() {
    connectionGraph.clear()
    clearPersistedGraphV4()
  },
  restoreConnections(records, options = {}) {
    const result = restoreRecordsIntoGraphV4(connectionGraph, records, { replace:options.replace !== false })
    persistGraphV4(connectionGraph)
    return result
  },
  projectConnections() { return connectionGraph.list() },
  enrichProject(project) { return projectWithConnectionsV4(project, connectionGraph) },
  physicsBlockers(objects = []) {
    reconcileGraph(objects)
    return connectionGraph.list().filter(connection => connection.physicsReady !== true)
  },
  clearCache() { resolver.clearCache(); shadowManifestPromise = null },
  stats() {
    const ready = PARTS.filter(def => def.connectivityV4?.status === 'ready' && def.connectivityV4.systemVersion === CONNECTOR_SYSTEM_VERSION_V4)
    return {
      mode:runtimeMode,
      systemVersion:CONNECTOR_SYSTEM_VERSION_V4,
      activationPolicyVersion:ACTIVATION_POLICY_VERSION_V4,
      selfTest:{ pass:selfTest.pass, passed:selfTest.passed, failed:selfTest.failed },
      readyParts:ready.length,
      connectors:ready.reduce((sum, def) => sum + (def.connectivityV4.connectors?.length || 0), 0),
      warnings:ready.reduce((sum, def) => sum + (def.connectivityV4.warnings?.length || 0), 0),
      deduplicated:ready.reduce((sum, def) => sum + (def.connectivityV4.stats?.deduplicated || 0), 0),
      graph:connectionGraph.stats(),
      loadingParts:[...status.values()].filter(value => value === 'loading').length,
      quarantinedParts:[...status.values()].filter(value => value === 'quarantined').length,
      errorParts:[...status.values()].filter(value => value === 'error').length,
    }
  },
})

globalThis.BrickLabConnectorV4 = BrickLabConnectorV4
