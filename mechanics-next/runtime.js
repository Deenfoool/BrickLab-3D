import { MECHANICS_NEXT_VERSION } from './core/model.js'
import { createOwnershipLedger } from './core/ownership.js'
import { createAssemblyGraph } from './topology/assembly-graph.js'
import { createKinematicSolver } from './solver/kinematic-solver.js'
import {
  assertLegacyReadOnly,
  createLegacyConnectivityObservationProvider,
  snapshotLegacyV4,
} from './adapters/legacy-v4-readonly.js'
import { createCatalogObservationProvider } from './adapters/catalog-readonly.js'
import { createPartIntelligenceRegistry } from './intelligence/registry.js'
import { createSceneMechanicalObserver } from './intelligence/scene-observer.js'
import { createShadowConnectionInterpreter } from './intelligence/connection-interpreter.js'

export const MECHANICS_NEXT_RUNTIME_MODE = 'observe-only'

export function createMechanicsNextRuntime({
  globals = globalThis,
  legacyProvider = globals.BrickLabConnectorV4,
  subsystems = globals.BrickLabSubsystems,
} = {}) {
  const ownership = createOwnershipLedger()
  const graph = createAssemblyGraph()
  const solver = createKinematicSolver()
  let legacySnapshot = snapshotLegacyV4(legacyProvider)

  const catalog = subsystems?.parts
    ? createCatalogObservationProvider(subsystems)
    : null
  const connectivity = createLegacyConnectivityObservationProvider(legacyProvider)

  const intelligence = catalog
    ? createPartIntelligenceRegistry({ catalog, connectivity })
    : null

  const sceneObserver = intelligence
    ? createSceneMechanicalObserver({
        registry:intelligence,
        graph,
        listObjects:() => subsystems?.editor?.ready?.() ? subsystems.editor.objects() : [],
      })
    : null

  const connectionInterpreter = sceneObserver
    ? createShadowConnectionInterpreter({
        graph,
        sceneObserver,
        objectById:instanceId => subsystems?.editor?.objectById?.(instanceId) ?? null,
      })
    : null

  let syncQueued = false
  let lastSceneSync = null

  const refreshLegacySnapshot = () => {
    legacySnapshot = snapshotLegacyV4(legacyProvider || globals.BrickLabConnectorV4)
    assertLegacyReadOnly(legacySnapshot)
    return legacySnapshot
  }

  const syncScene = () => {
    if (!sceneObserver || !subsystems?.editor?.ready?.()) {
      return Object.freeze({ unavailable:true, reason:'editor-contract-not-ready' })
    }
    refreshLegacySnapshot()
    const scene = sceneObserver.sync()
    const connections = connectionInterpreter?.sync(legacySnapshot.connections) ?? null
    lastSceneSync = Object.freeze({ scene, connections })
    return lastSceneSync
  }

  const scheduleSceneSync = () => {
    if (syncQueued || !sceneObserver) return
    syncQueued = true
    const enqueue = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : callback => Promise.resolve().then(callback)
    enqueue(() => {
      syncQueued = false
      try { syncScene() }
      catch (error) {
        console.warn('[BrickLab Mechanics Next] Observe-only scene sync failed.', error)
      }
    })
  }

  const invalidatePart = partId => {
    if (!partId || !intelligence) return false
    const invalidated = intelligence.invalidate(partId)
    sceneObserver?.invalidatePart(partId)
    scheduleSceneSync()
    return invalidated
  }

  const api = Object.freeze({
    version:MECHANICS_NEXT_VERSION,
    mode:MECHANICS_NEXT_RUNTIME_MODE,
    ownership,
    graph,
    solver,
    intelligence,
    sceneObserver,
    connectionInterpreter,
    refreshLegacySnapshot,
    legacySnapshot:() => legacySnapshot,
    describePart(partId, options) {
      return intelligence?.describe(partId, options) ?? null
    },
    mechanicalInstance(instanceId) {
      return sceneObserver?.instance(instanceId) ?? null
    },
    syncScene,
    invalidatePart,
    status() {
      return Object.freeze({
        version:MECHANICS_NEXT_VERSION,
        mode:MECHANICS_NEXT_RUNTIME_MODE,
        ownsProductionDomains:false,
        graphRevision:graph.revision,
        graphBodies:graph.size,
        solverRevision:solver.revision,
        legacyAvailable:legacySnapshot.available,
        legacySystemVersion:legacySnapshot.systemVersion,
        legacyConnections:legacySnapshot.connections.length,
        partIntelligence:intelligence?.stats?.() ?? null,
        scene:sceneObserver?.stats?.() ?? null,
        interpretedConnections:connectionInterpreter?.stats?.() ?? null,
        lastSceneSync,
        ownership:ownership.snapshot(),
      })
    },
  })

  const refreshLegacy = event => {
    try { refreshLegacySnapshot() }
    catch (error) {
      console.warn('[BrickLab Mechanics Next] Legacy observation refresh failed.', error)
    }
    const partId = event?.detail?.partId ?? event?.detail?.id ?? null
    if (partId) invalidatePart(partId)
  }

  globals.addEventListener?.('bricklab:connectorv4runtime', refreshLegacy)
  globals.addEventListener?.('bricklab:connectorv4reconcile', refreshLegacy)
  globals.addEventListener?.('bricklab:connectorv4', refreshLegacy)

  globals.addEventListener?.('bricklab:ldrawloaded', event => {
    const partId = event?.detail?.id
    if (partId) invalidatePart(partId)
  })
  globals.addEventListener?.('bricklab:partcatalogchange', () => {
    intelligence?.invalidateAll?.()
    scheduleSceneSync()
  })
  globals.addEventListener?.('bricklab:mechanicalintelligencechange', () => {
    intelligence?.invalidateAll?.()
    scheduleSceneSync()
  })
  globals.addEventListener?.('bricklab:editorcontractready', scheduleSceneSync)
  globals.addEventListener?.('bricklab:editorexternalmutation', scheduleSceneSync)

  globals.BrickLabMechanicsNext = api
  if (typeof globals.CustomEvent === 'function') {
    globals.dispatchEvent?.(new globals.CustomEvent('bricklab:mechanicsnextready', {
      detail:api.status(),
    }))
  }

  scheduleSceneSync()
  return api
}

const installed = globalThis.BrickLabMechanicsNext
export const BrickLabMechanicsNext = installed?.version === MECHANICS_NEXT_VERSION
  ? installed
  : createMechanicsNextRuntime()
