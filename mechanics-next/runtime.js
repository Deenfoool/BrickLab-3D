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
import { rigidPoseFromMatrix4 } from './math/rigid.js'
import { discoverMechanicalTransmissions } from './transmission/discovery.js'
import { createTransmissionCompiler } from './transmission/compiler.js'
import { findBestMechanicalCandidate } from './connectors/candidate-search.js'
import { createMechanicsDragSession } from './interaction/drag-session.js'
import { rotaryFrameForRecord } from './interaction/motion-plan.js'
import { rotationalDragProjection } from './interaction/view-projection.js'
import { createCompoundStateRegistry } from './compounds/state.js'
import { createCompoundDecompositionRegistry } from './compounds/decomposition-registry.js'
import { mapDecompositionToScene } from './compounds/scene-member-map.js'
import { assignCompoundEndpointOwnership } from './compounds/endpoint-ownership.js'
import { createMechanicsPhysicsRuntime } from './physics/runtime.js'

export const MECHANICS_NEXT_RUNTIME_MODE = 'observe-only'

export function createMechanicsNextRuntime({
  globals = globalThis,
  legacyProvider = globals.BrickLabConnectorV4,
  subsystems = globals.BrickLabSubsystems,
} = {}) {
  const ownership = createOwnershipLedger()
  const graph = createAssemblyGraph()
  const solver = createKinematicSolver()
  const transmissionCompiler = createTransmissionCompiler({ solver, graph })
  const compoundState = createCompoundStateRegistry()
  let legacySnapshot = snapshotLegacyV4(legacyProvider)
  let decompositionRefreshQueued = false

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

  const compoundDecompositions = globals.BrickLabLDraw?.readText
    ? createCompoundDecompositionRegistry({
        ldraw:globals.BrickLabLDraw,
        onResolved() {
          if (decompositionRefreshQueued) return
          decompositionRefreshQueued = true
          queueMicrotask(() => {
            decompositionRefreshQueued = false
            scheduleSceneSync()
          })
        },
      })
    : null

  let syncQueued = false
  let lastSceneSync = null
  let lastTransmissionSync = null
  let physicsPreview = null
  let activeDragSession = null
  let activeDragApply = false

  const mechanicalRecords = () => {
    if (!sceneObserver || !subsystems?.editor?.ready?.()) return Object.freeze([])
    const records = []
    for (const instance of sceneObserver.instances()) {
      const instanceId = instance?.body?.instanceId
      const object = subsystems.editor.objectById?.(instanceId)
      if (!object) continue
      try {
        object.updateWorldMatrix?.(true, false)
        const elements = object.matrixWorld?.elements
        if (!elements) continue
        const pose = rigidPoseFromMatrix4(Array.from(elements))
        const connectivitySnapshot = connectivity.get(instance.body.partId)
        const compoundDecomposition=compoundDecompositions?.cached(instanceId) ?? null
        const compoundSceneMap=compoundDecomposition
          ?mapDecompositionToScene(object,compoundDecomposition)
          :null
        const baseRecord={
          instance,
          pose,
          visualOffsetStud:Object.freeze(
            Array.isArray(connectivitySnapshot?.visualOffsetStud)
              ? [...connectivitySnapshot.visualOffsetStud]
              : [0,0,0],
          ),
          compoundDecomposition,
          compoundSceneMap,
          object,
        }
        const compoundEndpointOwnership=compoundSceneMap?.complete
          ?assignCompoundEndpointOwnership(baseRecord)
          :null
        records.push(Object.freeze({
          ...baseRecord,
          compoundEndpointOwnership,
        }))
      } catch (error) {
        console.warn('[BrickLab Mechanics Next] Could not observe rigid pose.', instanceId, error)
      }
    }
    return Object.freeze(records)
  }

  const refreshLegacySnapshot = () => {
    legacySnapshot = snapshotLegacyV4(legacyProvider || globals.BrickLabConnectorV4)
    assertLegacyReadOnly(legacySnapshot)
    return legacySnapshot
  }

  const syncScene = () => {
    if (activeDragSession?.active) {
      activeDragSession.cancel()
      activeDragSession = null
      activeDragApply = false
    }
    if (!sceneObserver || !subsystems?.editor?.ready?.()) {
      return Object.freeze({ unavailable:true, reason:'editor-contract-not-ready' })
    }
    refreshLegacySnapshot()
    const scene = sceneObserver.sync()
    void compoundDecompositions?.prefetch?.(sceneObserver.instances())
    const connections = connectionInterpreter?.sync(legacySnapshot.connections) ?? null
    const records = mechanicalRecords()
    const discovery = discoverMechanicalTransmissions({
      records,
      graph,
      relations:connectionInterpreter?.relations?.() ?? [],
      compoundState,
    })
    lastTransmissionSync = transmissionCompiler.sync(discovery)
    physicsPreview = createMechanicsPhysicsRuntime({
      graph,
      discovery,
      records,
      studMeters:.008,
    })
    lastSceneSync = Object.freeze({
      scene,
      connections,
      transmissions:lastTransmissionSync,
      physics:Object.freeze({
        pass:physicsPreview.pass,
        structural:physicsPreview.structuralPlan.stats,
        couplings:physicsPreview.couplingPlan.stats,
        blockerCount:physicsPreview.blockers.length,
      }),
      observedRecords:records.length,
    })
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
    transmissionCompiler,
    compoundState,
    compoundDecompositions,
    physicsPreview:() => physicsPreview,
    refreshLegacySnapshot,
    legacySnapshot:() => legacySnapshot,
    describePart(partId, options) {
      return intelligence?.describe(partId, options) ?? null
    },
    mechanicalInstance(instanceId) {
      return sceneObserver?.instance(instanceId) ?? null
    },
    records:mechanicalRecords,
    solveKinematics(options = {}) {
      return transmissionCompiler.solve(options)
    },
    setDriver(options = {}) {
      return solver.setDriver(options)
    },
    clearDriver(id) {
      return solver.clearDriver(id)
    },
    getCompoundState(key) {
      return compoundState.get(key)
    },
    setCompoundState(key, value) {
      const result = compoundState.set(key, value)
      scheduleSceneSync()
      return result
    },
    clearCompoundState(key) {
      const result = compoundState.delete(key)
      if (result) scheduleSceneSync()
      return result
    },
    findCandidate(instanceId, targetInstanceIds = null, options = {}) {
      const records = mechanicalRecords()
      const moving = records.find(record => record.instance.body.instanceId === String(instanceId))
      if (!moving) return null
      const wanted = Array.isArray(targetInstanceIds) ? new Set(targetInstanceIds.map(String)) : null
      const targets = records.filter(record =>
        record !== moving && (!wanted || wanted.has(String(record.instance.body.instanceId))))
      return findBestMechanicalCandidate({
        moving,
        targets,
        includeSemanticUnknown:options.includeSemanticUnknown === true,
        captureDistanceStud:options.captureDistanceStud,
        minAxisAlignment:options.minAxisAlignment,
        collisionProbe:options.collisionProbe,
      })
    },
    beginDrag({
      instanceId,
      start,
      camera = globals.BrickLabViewportV1?.camera?.(),
      viewportRect = globals.document?.querySelector?.('#viewport')?.getBoundingClientRect?.(),
      apply = false,
      balancedDifferentials = 'auto',
      tolerance,
      tangentScale,
      minimumRadiusPx,
    } = {}) {
      if (activeDragSession?.active) activeDragSession.cancel()
      activeDragSession = null
      activeDragApply = false

      const records = mechanicalRecords()
      const selected = records.find(record =>
        String(record.instance.body.instanceId) === String(instanceId))
      if (!selected) throw new Error(`Mechanical instance not found: ${instanceId}`)
      const frame = rotaryFrameForRecord(selected)
      if (!frame) throw new Error(`Mechanical instance has no rotary DOF: ${instanceId}`)
      if (!camera?.isCamera) throw new Error('Active viewport camera is unavailable')
      if (!viewportRect?.width || !viewportRect?.height) throw new Error('Viewport rectangle is unavailable')

      const projection = rotationalDragProjection(
        camera,
        frame.pivot,
        frame.axis,
        viewportRect,
      )
      activeDragApply = apply === true
      activeDragSession = createMechanicsDragSession({
        records,
        discovery:transmissionCompiler.discovery,
        instanceId,
        start,
        pivot:projection.pivot,
        axisScreenSign:projection.axisScreenSign,
        fallbackDirection:projection.fallbackDirection,
        balancedDifferentials,
        tolerance,
        tangentScale,
        minimumRadiusPx,
      })
      return Object.freeze({
        version:activeDragSession.constructor?.name ?? 'MechanicsDragSession',
        instanceId:String(instanceId),
        bodyId:selected.instance.body.id,
        projection,
        apply:activeDragApply,
      })
    },
    updateDrag(current, options = {}) {
      if (!activeDragSession?.active) return null
      const apply = options.apply == null ? activeDragApply : options.apply === true
      return activeDragSession.update(current, { apply })
    },
    endDrag({ restore = true } = {}) {
      if (!activeDragSession) return null
      const result = activeDragSession.close({ restore })
      activeDragSession = null
      activeDragApply = false
      return result
    },
    cancelDrag() {
      if (!activeDragSession) return false
      const result = activeDragSession.cancel()
      activeDragSession = null
      activeDragApply = false
      return result
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
        transmissionCompiler:transmissionCompiler.snapshot(),
        transmissionSolve:transmissionCompiler.solve(),
        compoundState:compoundState.snapshot(),
        compoundDecompositions:compoundDecompositions?.status?.() ?? null,
        physicsPreview:physicsPreview?.status?.() ?? null,
        dragSession:Object.freeze({
          active:Boolean(activeDragSession?.active),
          apply:activeDragApply,
          selectedInstanceId:activeDragSession?.selected?.instance?.body?.instanceId ?? null,
          lastStatus:activeDragSession?.last?.solution?.status ?? null,
        }),
        lastTransmissionSync,
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
