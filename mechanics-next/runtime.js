import { deterministicId, MECHANICS_NEXT_VERSION } from './core/model.js'
import { createOwnershipLedger } from './core/ownership.js'
import { createAssemblyGraph } from './topology/assembly-graph.js'
import { createKinematicSolver } from './solver/kinematic-solver.js'
import { createCatalogObservationProvider } from './adapters/catalog-readonly.js'
import { createPartIntelligenceRegistry } from './intelligence/registry.js'
import { createNativeConnectivityProvider } from './ldraw/native-connectivity-provider.js'
import { createSceneMechanicalObserver } from './intelligence/scene-observer.js'
import { createShadowConnectionInterpreter } from './intelligence/connection-interpreter.js'
import { endpointSemanticKind } from './intelligence/endpoint-semantics.js'
import { rigidPoseFromMatrix4 } from './math/rigid.js'
import { discoverMechanicalTransmissions } from './transmission/discovery.js'
import { createTransmissionCompiler } from './transmission/compiler.js'
import { findBestMechanicalCandidate } from './connectors/candidate-search.js'
import { OccupancyLedger, endpointChannel } from './connectors/occupancy.js'
import { commitPlacementTransaction } from './connectors/placement-transaction.js'
import { solveMechanicalPlacement } from './connectors/placement-solver.js'
import { worldConnectorFrame } from './connectors/world-frame.js'
import { createMechanicsDragSession } from './interaction/drag-session.js'
import { rotaryFrameForRecord } from './interaction/motion-plan.js'
import { rotationalDragProjection } from './interaction/view-projection.js'
import { createCompoundStateRegistry } from './compounds/state.js'
import { createCompoundDecompositionRegistry } from './compounds/decomposition-registry.js'
import { mapDecompositionToScene } from './compounds/scene-member-map.js'
import {
  assignCompoundEndpointOwnership,
  summarizeCompoundEndpointOwnership,
} from './compounds/endpoint-ownership.js'
import { createMechanicsPhysicsRuntime } from './physics/runtime.js'
import { revalidateSceneConnections } from './physics/scene-connection-revalidator.js'
import { applyPhysicsJointRelease, createReleasedConnectionState } from './physics/release-state.js'
import { exportMechanicsProjectState, persistenceCompatibilityReport, probeMechanicsProjectState, restoreMechanicsProjectState } from './migration/project-state.js'
import { evaluateMechanicsMigrationGate } from './migration/gate.js'
import { runMechanicsMigrationRegressionSuite } from './migration/regression-suite.js'

export const MECHANICS_NEXT_RUNTIME_MODE = 'migration-pilot'
export const MECHANICS_NEXT_BUILD_OWNER_VERSION = 'mechanics-next-build-owner-0.1.0'
export const MECHANICS_NEXT_OWNER_ID = 'mechanics-next'

export function createMechanicsNextRuntime({
  globals = globalThis,
  subsystems = globals.BrickLabSubsystems,
} = {}) {
  const ownership = createOwnershipLedger()
  const graph = createAssemblyGraph()
  const solver = createKinematicSolver()
  const transmissionCompiler = createTransmissionCompiler({ solver, graph })
  const compoundState = createCompoundStateRegistry()
  const occupancy = new OccupancyLedger()
  const nativeObservedRecords = new Map()
  const releasedObservedConnectionIds = createReleasedConnectionState()
  let nativeProjectAuthoritative = false
  let legacyImportRecords = Object.freeze([])
  let decompositionRefreshQueued = false

  const catalog = subsystems?.parts
    ? createCatalogObservationProvider(subsystems)
    : null
  let connectivity=null
  connectivity=catalog&&globals.BrickLabLDraw?.readText
    ?createNativeConnectivityProvider({
        parts:subsystems.parts,
        ldraw:globals.BrickLabLDraw,
        onUpdate(partId,value){
          intelligence?.invalidate?.(partId)
          sceneObserver?.invalidatePart?.(partId)
          scheduleSceneSync()
        },
      })
    :null

  const intelligence = catalog&&connectivity
    ? createPartIntelligenceRegistry({ catalog, connectivity })
    : null

  const migrationParitySummary=partIds=>{
    const ids=[...new Set((partIds||[]).map(String).filter(Boolean))]
    let semanticPass=0,geometryPass=0,semanticFail=0,geometryFail=0
    let nativeOnly=0,compared=0,nativeUnavailable=0,referenceUnavailable=0
    const failures=[]

    for(const partId of ids){
      const native=connectivity?.get?.(partId)
      if(native?.status!=='ready'){
        nativeUnavailable+=1
        semanticFail+=1
        geometryFail+=1
        failures.push(Object.freeze({partId,reason:'native-connectivity-not-ready',status:native?.status??null}))
        continue
      }

      nativeOnly+=1
      compared+=1
      if(Array.isArray(native.connectors)){
        semanticPass+=1
        geometryPass+=1
      }else{
        semanticFail+=1
        geometryFail+=1
        failures.push(Object.freeze({partId,reason:'native-connectivity-empty'}))
      }
    }

    return Object.freeze({
      parts:ids.length,
      compared,
      nativeOnly,
      nativeUnavailable,
      referenceUnavailable,
      semanticPass,
      geometryPass,
      semanticFail,
      geometryFail,
      failures:Object.freeze(failures),
    })
  }

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
  let lastMechanicalRecordFailures = Object.freeze([])
  let lastTransmissionSync = null
  let physicsPreview = null
  let nativeRestoredRelations = Object.freeze([])
  let lastPersistenceReport = null
  let regressionEvidence = runMechanicsMigrationRegressionSuite()
  let parityEvidence = null
  let activeDragSession = null
  let activeDragApply = false
  let buildOwnershipPublished = false

  const publishBuildOwnership = reason => {
    if(buildOwnershipPublished&&globals.BrickLabMechanicsNextBuildOwner?.active===true){
      return globals.BrickLabMechanicsNextBuildOwner
    }
    buildOwnershipPublished=true
    const owner=Object.freeze({
      version:MECHANICS_NEXT_BUILD_OWNER_VERSION,
      active:true,
      engine:MECHANICS_NEXT_VERSION,
      reason:String(reason||'native-handoff'),
      authoritative:()=>nativeProjectAuthoritative,
      status:()=>api?.status?.()??null,
    })
    globals.BrickLabMechanicsNextBuildOwner=owner
    globals.dispatchEvent?.(new CustomEvent('bricklab:mechanicsnextbuildowner',{
      detail:{
        version:owner.version,
        engine:owner.engine,
        reason:owner.reason,
      },
    }))
    return owner
  }

  const restoreCompoundStateSnapshot = snapshot => {
    compoundState.clear()
    const states=snapshot?.states
    if(states&&typeof states==='object'){
      for(const[key,value]of Object.entries(states))compoundState.set(key,value)
    }
    return compoundState.snapshot()
  }

  const mechanicalRecords = () => {
    if (!sceneObserver || !subsystems?.editor?.ready?.()) return Object.freeze([])
    const records = []
    const failures = []
    for (const instance of sceneObserver.instances()) {
      const instanceId = instance?.body?.instanceId
      const object = subsystems.editor.objectById?.(instanceId)
      if (!object) {
        failures.push(Object.freeze({
          instanceId:instanceId??null,
          partId:instance?.body?.partId??null,
          reason:'scene-object-missing',
        }))
        continue
      }
      try {
        object.updateWorldMatrix?.(true, false)
        const elements = object.matrixWorld?.elements
        if (!elements) {
          failures.push(Object.freeze({
            instanceId:instanceId??null,
            partId:instance?.body?.partId??null,
            reason:'matrix-world-missing',
          }))
          continue
        }
        const pose = rigidPoseFromMatrix4(Array.from(elements))
        const visual=object.children?.find?.(child=>child?.userData?.ldrawVisual)
        const visualOffsetStud=visual?.position
          ?[visual.position.x,visual.position.y,visual.position.z]
          :[0,0,0]
        const compoundDecomposition=compoundDecompositions?.cached(instanceId) ?? null
        const compoundSceneMap=compoundDecomposition
          ?mapDecompositionToScene(object,compoundDecomposition)
          :null
        const baseRecord={
          instance,
          pose,
          visualOffsetStud:Object.freeze([...visualOffsetStud]),
          compoundDecomposition,
          compoundSceneMap,
          object,
        }
        const compoundEndpointOwnership=compoundDecomposition
          ?assignCompoundEndpointOwnership(baseRecord)
          :null
        records.push(Object.freeze({
          ...baseRecord,
          compoundEndpointOwnership,
        }))
      } catch (error) {
        const failure=Object.freeze({
          instanceId:instanceId??null,
          partId:instance?.body?.partId??null,
          reason:'mechanical-record-observation-failed',
          detail:String(error?.message||error),
        })
        failures.push(failure)
        console.warn('[BrickLab Mechanics Next] Could not observe rigid pose.', instanceId, error)
      }
    }
    lastMechanicalRecordFailures=Object.freeze(failures)
    return Object.freeze(records)
  }

  const adoptPersistedConnectionsAsObserved = state => {
    nativeObservedRecords.clear()
    for(const record of state?.connections||[]){
      const endpointA=record?.a?.observedEndpointId??record?.a?.endpointId
      const endpointB=record?.b?.observedEndpointId??record?.b?.endpointId
      if(!record?.a?.instanceId||!record?.b?.instanceId||!endpointA||!endpointB)continue
      const stableObservedId=String(
        record.observedConnectionId ??
        deterministicId(
          'observed-link',
          ...[
            `${record.a.instanceId}::${endpointA}`,
            `${record.b.instanceId}::${endpointB}`,
          ].sort(),
        )
      )
      nativeObservedRecords.set(stableObservedId,Object.freeze({
        id:stableObservedId,
        a:Object.freeze({
          instanceId:String(record.a.instanceId),
          endpointId:String(endpointA),
        }),
        b:Object.freeze({
          instanceId:String(record.b.instanceId),
          endpointId:String(endpointB),
        }),
        occupancy:record.occupancy??null,
        metadata:Object.freeze({
          mechanicsNextNative:true,
          restoredFromProject:true,
          persistedConstraintId:record.id,
          connectionGeometry:record.geometry??null,
        }),
      }))
      graph.removeEdge(record.id)
    }
    return nativeObservedRecords.size
  }

  const normalizedObservedConnections = () => {
    const result=[]
    const seen=new Set()
    const add=record=>{
      const recordId=String(record?.id||'')
      if(recordId&&releasedObservedConnectionIds.has(recordId))return
      const a=record?.a,b=record?.b
      if(!a?.instanceId||!b?.instanceId)return
      const endpointA=a.endpointId??a.connectorId
      const endpointB=b.endpointId??b.connectorId
      if(!endpointA||!endpointB)return
      const left=`${a.instanceId}::${endpointA}`
      const right=`${b.instanceId}::${endpointB}`
      const key=[left,right].sort().join('<>')
      if(seen.has(key))return
      seen.add(key)
      result.push(Object.freeze({
        ...record,
        id:String(record.id??deterministicId('observed-link',key)),
        a:Object.freeze({...a,endpointId:String(endpointA)}),
        b:Object.freeze({...b,endpointId:String(endpointB)}),
        metadata:Object.freeze({
          ...(record.metadata||{}),
          observedSource:record?.a?.endpointId||record?.b?.endpointId?'connector-v4':'legacy-v3',
        }),
      }))
    }
    for(const record of nativeObservedRecords.values())add(record)
    if(!nativeProjectAuthoritative){
      for(const record of legacyImportRecords)add(record)
      const project=subsystems?.editor?.projectState?.()
      for(const record of project?.connections||[])add(record)
    }
    return Object.freeze(result)
  }

  const rebuildNativeOccupancy=()=>{
    occupancy.clear()
    for(const edge of graph.edges('constraint')){
      const metadata=edge.metadata||{}
      const instanceA=sceneObserver?.instance?.(metadata.instanceAId)
      const instanceB=sceneObserver?.instance?.(metadata.instanceBId)
      const endpointA=instanceA?.endpoints?.find(item=>item.id===metadata.endpointAId)
      const endpointB=instanceB?.endpoints?.find(item=>item.id===metadata.endpointBId)
      if(!endpointA||!endpointB)continue
      const savedPlan=metadata.occupancy
      if(savedPlan?.connectionId&&Array.isArray(savedPlan.exclusiveChannels)&&Array.isArray(savedPlan.axialReservations)){
        try{
          occupancy.reserve(Object.freeze({
            connectionId:String(savedPlan.connectionId),
            exclusiveChannels:Object.freeze([...savedPlan.exclusiveChannels]),
            axialReservations:Object.freeze(savedPlan.axialReservations.map(item=>Object.freeze({
              ...item,
              channel:String(item.channel),
              interval:Object.freeze([...(item.interval||[])]),
            }))),
          }))
          continue
        }catch{}
      }

      const exclusive=[]
      if(endpointA.family==='cylinder'&&endpointB.family==='cylinder'){
        if(endpointA.gender==='female')exclusive.push(endpointChannel(edge.bodyA,endpointA.id))
        if(endpointB.gender==='female')exclusive.push(endpointChannel(edge.bodyB,endpointB.id))
      }else{
        exclusive.push(endpointChannel(edge.bodyA,endpointA.id))
        exclusive.push(endpointChannel(edge.bodyB,endpointB.id))
      }
      try{
        occupancy.reserve({
          connectionId:edge.id,
          exclusiveChannels:Object.freeze(exclusive),
          axialReservations:Object.freeze([]),
        })
      }catch{}
    }
    return occupancy.snapshot()
  }

  const endpointObservedId=endpoint=>
    endpoint?.metadata?.compatibilityEndpointId ??
    endpoint?.metadata?.sourceEndpointId ??
    endpoint?.metadata?.builtinConnectorId ??
    endpoint?.id

  const recordFromCandidate=candidate=>Object.freeze({
    id:String(candidate.key),
    kind:candidate.match?.interfaceRule?.kind??'generic',
    a:Object.freeze({
      instanceId:String(candidate.moving.instance.body.instanceId),
      partId:String(candidate.moving.instance.body.partId),
      endpointId:String(endpointObservedId(candidate.source)),
      connectorId:String(endpointObservedId(candidate.source)),
      connectorType:endpointSemanticKind(candidate.source),
    }),
    b:Object.freeze({
      instanceId:String(candidate.targetRecord.instance.body.instanceId),
      partId:String(candidate.targetRecord.instance.body.partId),
      endpointId:String(endpointObservedId(candidate.target)),
      connectorId:String(endpointObservedId(candidate.target)),
      connectorType:endpointSemanticKind(candidate.target),
    }),
    match:Object.freeze({
      family:candidate.match?.family??null,
      keyed:candidate.match?.keyed===true,
      freeTwist:candidate.match?.freeTwist===true,
    }),
    occupancy:candidate.occupancyPlan??null,
    metadata:Object.freeze({
      mechanicsNextNative:true,
      candidateKey:candidate.key,
      supportCount:candidate.supportCount??1,
    }),
  })

  const currentPoseForRecord=record=>{
    const object=record?.object
    object?.updateWorldMatrix?.(true,false)
    const elements=object?.matrixWorld?.elements
    if(!elements)return record?.pose??null
    return rigidPoseFromMatrix4(Array.from(elements))
  }

  const validateCommittedCandidate=candidate=>{
    const moving={...candidate.moving,pose:currentPoseForRecord(candidate.moving)}
    const sourceFrame=worldConnectorFrame(moving.pose,candidate.source,{
      visualOffsetStud:moving.visualOffsetStud||[0,0,0],
    })
    const targetPose=currentPoseForRecord(candidate.targetRecord)
    const targetFrame=worldConnectorFrame(targetPose,candidate.target,{
      visualOffsetStud:candidate.targetRecord.visualOffsetStud||[0,0,0],
    })
    const solution=solveMechanicalPlacement({
      source:candidate.source,
      target:candidate.target,
      sourceFrame,
      targetFrame,
      objectPose:moving.pose,
      match:candidate.match,
      requestedOffsetLdu:candidate.solution?.axial?.offsetLdu,
      axisPolarity:candidate.axisPolarity,
    })
    const translation=solution?.diagnostics?.translationStud??Infinity
    const rotation=solution?.diagnostics?.rotationRad??Infinity
    return Object.freeze({
      valid:solution?.valid===true&&translation<=1e-4&&rotation<=1e-4,
      reason:solution?.valid?(`residual:${translation}:${rotation}`):(solution?.reason??'invalid'),
      solution,
    })
  }

  const handlePhysicsJointRelease = event => {
    const detail=applyPhysicsJointRelease(event,{
      graph,
      occupancy,
      nativeObservedRecords,
      releasedConnections:releasedObservedConnectionIds,
    })
    globals.dispatchEvent?.(new CustomEvent('bricklab:mechanicsnextjointrelease',{detail}))
    return detail
  }

  const revalidateExistingConnections = records => revalidateSceneConnections({
    graph,
    records,
    releaseConstraint:handlePhysicsJointRelease,
  })

  const syncScene = () => {
    if (activeDragSession?.active) {
      activeDragSession.cancel()
      activeDragSession = null
      activeDragApply = false
    }
    if (!sceneObserver || !subsystems?.editor?.ready?.()) {
      return Object.freeze({ unavailable:true, reason:'editor-contract-not-ready' })
    }
    const scene = sceneObserver.sync()
    void connectivity?.prefetch?.(sceneObserver.instances().map(instance=>instance.body.partId))
    void compoundDecompositions?.prefetch?.(sceneObserver.instances())
    const records = mechanicalRecords()
    const compoundEndpointOwnership=summarizeCompoundEndpointOwnership(records)
    const preRevalidation=revalidateExistingConnections(records)
    const observedConnections=normalizedObservedConnections()
    let connections = connectionInterpreter?.sync(observedConnections) ?? null
    const postRevalidation=revalidateExistingConnections(records)
    if(postRevalidation.released>0){
      connections=connectionInterpreter?.sync(normalizedObservedConnections())??connections
    }
    const revalidation=Object.freeze({
      checked:preRevalidation.checked+postRevalidation.checked,
      released:preRevalidation.released+postRevalidation.released,
      failures:Object.freeze([
        ...preRevalidation.failures,
        ...postRevalidation.failures,
      ]),
      pre:preRevalidation,
      post:postRevalidation,
    })
    const discovery = discoverMechanicalTransmissions({
      records,
      graph,
      relations:Object.freeze([
        ...(connectionInterpreter?.relations?.() ?? []),
        ...nativeRestoredRelations,
      ]),
      compoundState,
      controlState:instanceId=>globals.BrickLabControls?.getRuntime?.(instanceId)??null,
    })
    lastTransmissionSync = transmissionCompiler.sync(discovery)
    const persistenceState=exportMechanicsProjectState({
      graph,
      relations:[
        ...(connectionInterpreter?.relations?.() ?? []),
        ...nativeRestoredRelations,
      ],
      compoundState,
    })
    lastPersistenceReport=probeMechanicsProjectState(persistenceState,{
      sceneObserver,
      objectByInstanceId:instanceId=>subsystems?.editor?.objectById?.(instanceId)??null,
    })
    physicsPreview = createMechanicsPhysicsRuntime({
      graph,
      discovery,
      records,
      worldUnitsPerStud:.008,
      controlState:instanceId=>globals.BrickLabControls?.getRuntime?.(instanceId)??null,
      onJointRelease:handlePhysicsJointRelease,
    })
    lastSceneSync = Object.freeze({
      scene,
      recordObservationFailures:lastMechanicalRecordFailures,
      compoundEndpointOwnership,
      revalidation,
      connections,
      transmissions:lastTransmissionSync,
      physics:Object.freeze({
        pass:physicsPreview.pass,
        structural:physicsPreview.structuralPlan.stats,
        couplings:physicsPreview.couplingPlan.stats,
        blockerCount:physicsPreview.blockers.length,
      }),
      observedRecords:records.length,
      observedConnections:observedConnections.length,
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
    handoffDomains(domains, reason='validated-production-migration') {
      const wanted=[...new Set((domains||[]).map(String).filter(Boolean))]
      const handed=[]
      for(const domain of wanted){
        const current=ownership.owner(domain)
        if(current===MECHANICS_NEXT_OWNER_ID)continue
        handed.push(ownership.handoff(domain,current,MECHANICS_NEXT_OWNER_ID,{
          reason,
          checks:{
            tests:regressionEvidence?.status==='passed',
            migration:true,
            diagnostics:true,
            rollback:true,
          },
        }))
      }
      return Object.freeze(handed)
    },
    graph,
    solver,
    intelligence,
    sceneObserver,
    connectionInterpreter,
    transmissionCompiler,
    compoundState,
    compoundDecompositions,
    physicsPreview:() => physicsPreview,
    async prepareMigration() {
      if(!sceneObserver||!subsystems?.editor?.ready?.()){
        return Object.freeze({
          pass:false,
          blockers:Object.freeze([{id:'editor-contract-not-ready'}]),
        })
      }
      const objects=subsystems.editor.objects?.()??[]
      const initial=sceneObserver.sync(objects)
      const instances=sceneObserver.instances()
      await connectivity?.prefetch?.(instances.map(instance=>instance.body.partId))
      intelligence?.invalidateAll?.()
      sceneObserver.sync(objects)
      await compoundDecompositions?.prefetch?.(sceneObserver.instances())
      const pendingProject=globals.__bricklabPendingMechanicsNextProject
      if(pendingProject){
        const restored=api.restoreProjectState(pendingProject,{replace:true})
        if(restored.rejected===0&&restored.compatibility?.pass===true){
          delete globals.__bricklabPendingMechanicsNextProject
        }
      }
      parityEvidence=migrationParitySummary(sceneObserver.instances().map(instance=>instance.body.partId))
      const refreshed=syncScene()
      return Object.freeze({
        ...api.migrationGate(),
        prepared:Object.freeze({
          objects:objects.length,
          initial,
          refreshed,
          nativeConnectivity:connectivity?.stats?.()??null,
          parity:parityEvidence,
        }),
      })
    },
    clearProjectState({keepAuthority=true}={}) {
      const retainAuthority=keepAuthority===true&&nativeProjectAuthoritative===true
      if(activeDragSession?.active){
        activeDragSession.cancel()
        activeDragSession=null
        activeDragApply=false
      }
      nativeObservedRecords.clear()
      releasedObservedConnectionIds.clear()
      nativeRestoredRelations=Object.freeze([])
      occupancy.clear()
      compoundState.clear()
      connectionInterpreter?.sync?.([])
      transmissionCompiler.clear()
      solver.clearDrivers?.()
      for(const edge of [...graph.edges()])graph.removeEdge(edge.id)
      lastPersistenceReport=null
      lastTransmissionSync=null
      physicsPreview=null
      nativeProjectAuthoritative=retainAuthority
      if(!retainAuthority){
        buildOwnershipPublished=false
        if(globals.BrickLabMechanicsNextBuildOwner?.version===MECHANICS_NEXT_BUILD_OWNER_VERSION){
          delete globals.BrickLabMechanicsNextBuildOwner
        }
      }
      return Object.freeze({
        cleared:true,
        keepAuthority:retainAuthority,
        graphRevision:graph.revision,
      })
    },
    exportProjectState() {
      return exportMechanicsProjectState({
        graph,
        relations:[
          ...(connectionInterpreter?.relations?.() ?? []),
          ...nativeRestoredRelations,
        ],
        compoundState,
      })
    },
    restoreProjectState(state, { replace = false } = {}) {
      releasedObservedConnectionIds.clear()
      const result=restoreMechanicsProjectState(state,{
        graph,
        sceneObserver,
        objectByInstanceId:instanceId=>subsystems?.editor?.objectById?.(instanceId)??null,
        visualOffsetForPart:(partId,instanceId)=>{
          const object=subsystems?.editor?.objectById?.(instanceId)
          const visual=object?.children?.find?.(child=>child?.userData?.ldrawVisual)
          return visual?.position
            ?[visual.position.x,visual.position.y,visual.position.z]
            :[0,0,0]
        },
        replace,
      })
      lastPersistenceReport=persistenceCompatibilityReport({
        exportedState:state,
        restoredResult:result,
      })
      nativeProjectAuthoritative=lastPersistenceReport.pass
      if(nativeProjectAuthoritative){
        nativeRestoredRelations=result.relations??Object.freeze([])
        restoreCompoundStateSnapshot(result.compoundState)
      }else{
        nativeRestoredRelations=Object.freeze([])
        compoundState.clear()
      }
      if(nativeProjectAuthoritative){
        adoptPersistedConnectionsAsObserved(state)
      }
      const refreshed=syncScene()
      const restoredObservedIds=new Set(
        (state?.connections||[]).map(record=>String(
          record.observedConnectionId ??
          deterministicId(
            'observed-link',
            ...[
              `${record.a?.instanceId}::${record.a?.observedEndpointId??record.a?.endpointId}`,
              `${record.b?.instanceId}::${record.b?.observedEndpointId??record.b?.endpointId}`,
            ].sort(),
          )
        )),
      )
      const geometryFailures=(refreshed?.revalidation?.failures||[]).filter(item=>
        restoredObservedIds.has(String(item?.observedConnectionId||''))
      )
      if(nativeProjectAuthoritative&&geometryFailures.length){
        let geometryRolledBack=0
        for(const edge of [...graph.edges('constraint')]){
          const observedId=String(edge?.metadata?.observedConnectionId||'')
          if(!restoredObservedIds.has(observedId))continue
          if(graph.removeEdge(edge.id))geometryRolledBack+=1
          occupancy.release(observedId)
        }
        for(const observedId of restoredObservedIds){
          nativeObservedRecords.delete(observedId)
          releasedObservedConnectionIds.release(observedId)
          occupancy.release(observedId)
        }
        connectionInterpreter?.sync?.(normalizedObservedConnections())
        nativeRestoredRelations=Object.freeze([])
        compoundState.clear()
        nativeProjectAuthoritative=false
        buildOwnershipPublished=false
        if(globals.BrickLabMechanicsNextBuildOwner?.version===MECHANICS_NEXT_BUILD_OWNER_VERSION){
          delete globals.BrickLabMechanicsNextBuildOwner
        }
        const failures=Object.freeze([
          ...(result.failures||[]),
          ...geometryFailures.map(item=>Object.freeze({
            code:'connection-geometry-invalid',
            connectionId:item.constraintId??null,
            observedConnectionId:item.observedConnectionId??null,
            reason:item.reason??'scene-connection-invalid',
          })),
        ])
        lastPersistenceReport=Object.freeze({
          ...lastPersistenceReport,
          pass:false,
          restored:0,
          rejected:failures.length,
          failures,
          geometryRolledBack,
        })
        return Object.freeze({
          ...result,
          restored:0,
          rejected:failures.length,
          rolledBack:Number(result.rolledBack||0)+geometryRolledBack,
          failures,
          relations:Object.freeze([]),
          compatibility:lastPersistenceReport,
          refreshed,
        })
      }
      if(nativeProjectAuthoritative){
        rebuildNativeOccupancy()
        api.handoffDomains(
          ['connector-hydration','snapping','connection-graph','persistence'],
          'validated native project restore',
        )
        publishBuildOwnership('native-project-restore')
      }
      return Object.freeze({
        ...result,
        compatibility:lastPersistenceReport,
        refreshed,
      })
    },
    setMigrationEvidence({ parity = null, regression = null } = {}) {
      if(parity)parityEvidence=Object.freeze({...parity})
      if(regression)regressionEvidence=Object.freeze({...regression})
      return api.migrationGate()
    },
    migrationGate() {
      const gate=evaluateMechanicsMigrationGate({
        runtimeStatus:api.status(),
        physicsStatus:physicsPreview?.status?.()??null,
        paritySummary:parityEvidence,
        regression:regressionEvidence,
        persistence:lastPersistenceReport,
        nativeProjectAuthoritative,
        nativeObservedConnections:nativeObservedRecords.size,
        occupancy:occupancy.snapshot(),
      })
      if(!globals.__bricklabPendingMechanicsNextProject)return gate
      const pending=Object.freeze({id:'native-project-restore-pending',pass:false,severity:'blocker'})
      return Object.freeze({...gate,pass:false,
        checks:Object.freeze([...gate.checks,pending]),
        blockers:Object.freeze([...gate.blockers,pending]),
        summary:Object.freeze({...gate.summary,total:gate.summary.total+1,failed:gate.summary.failed+1,blockers:gate.summary.blockers+1}),
      })
    },
    importLegacyConnections(records=[]) {
      if(nativeProjectAuthoritative)return Object.freeze({accepted:false,reason:'native-project-authoritative'})
      legacyImportRecords=Object.freeze((records??[]).map(record=>Object.freeze(structuredClone(record))))
      scheduleSceneSync()
      return Object.freeze({accepted:true,imported:legacyImportRecords.length})
    },
    clearLegacyConnections() {
      legacyImportRecords=Object.freeze([])
      scheduleSceneSync()
      return true
    },
    describePart(partId, options) {
      return intelligence?.describe(partId, options) ?? null
    },
    mechanicalInstance(instanceId) {
      return sceneObserver?.instance(instanceId) ?? null
    },
    endpointWorldFrame(instanceId, endpointId) {
      const record=mechanicalRecords().find(item=>
        String(item.instance?.body?.instanceId||'')===String(instanceId||''))
      const endpoint=record?.instance?.endpoints?.find(item=>String(item.id)===String(endpointId||''))
      if(!record||!endpoint)return null
      return worldConnectorFrame(record.pose,endpoint,{
        visualOffsetStud:record.visualOffsetStud||[0,0,0],
      })
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
    adoptNativeProjectOwnership() {
      const gate=api.migrationGate()
      if(!gate.pass)return Object.freeze({accepted:false,reason:'migration-gate-blocked',gate})
      if(nativeProjectAuthoritative){
        api.handoffDomains(
          ['connector-hydration','snapping','connection-graph','persistence'],
          'validated native BUILD project',
        )
        publishBuildOwnership('validated-native-project')
        return Object.freeze({
          accepted:true,
          alreadyOwned:true,
          gate,
          state:api.exportProjectState(),
        })
      }
      const state=api.exportProjectState()
      connectionInterpreter?.sync?.([])
      nativeRestoredRelations=Object.freeze([...(state.relations||[])])
      const restored=restoreMechanicsProjectState(state,{
        graph,
        sceneObserver,
        objectByInstanceId:instanceId=>subsystems?.editor?.objectById?.(instanceId)??null,
        visualOffsetForPart:(partId,instanceId)=>{
          const object=subsystems?.editor?.objectById?.(instanceId)
          const visual=object?.children?.find?.(child=>child?.userData?.ldrawVisual)
          return visual?.position
            ?[visual.position.x,visual.position.y,visual.position.z]
            :[0,0,0]
        },
        replace:false,
      })
      lastPersistenceReport=persistenceCompatibilityReport({
        exportedState:state,
        restoredResult:restored,
      })
      if(!lastPersistenceReport.pass){
        return Object.freeze({
          accepted:false,
          reason:'native-handoff-restore-failed',
          compatibility:lastPersistenceReport,
        })
      }
      nativeProjectAuthoritative=true
      adoptPersistedConnectionsAsObserved(state)
      api.handoffDomains(
        ['connector-hydration','snapping','connection-graph','persistence'],
        'validated BUILD migration handoff',
      )
      publishBuildOwnership('migration-handoff')
      const refreshed=syncScene()
      rebuildNativeOccupancy()
      return Object.freeze({
        accepted:true,
        alreadyOwned:false,
        compatibility:lastPersistenceReport,
        refreshed,
      })
    },
    async commitCandidate(candidate) {
      if(!nativeProjectAuthoritative)return Object.freeze({
        accepted:false,
        reason:'native-project-not-authoritative',
      })
      if(!candidate?.moving?.object)return Object.freeze({accepted:false,reason:'candidate-object-missing'})
      rebuildNativeOccupancy()
      const object=candidate.moving.object
      const adapter={
        async snapshot(){
          return Object.freeze({
            position:Object.freeze(object.position.toArray()),
            quaternion:Object.freeze(object.quaternion.toArray()),
          })
        },
        async setWorldPose(record,pose){
          object.position.fromArray(pose.position)
          object.quaternion.fromArray(pose.quaternion).normalize()
          object.updateMatrixWorld?.(true)
        },
        async restore(record,snapshot){
          object.position.fromArray(snapshot.position)
          object.quaternion.fromArray(snapshot.quaternion).normalize()
          object.updateMatrixWorld?.(true)
        },
      }
      let committedRecord=null
      const result=await commitPlacementTransaction(candidate,{
        adapter,
        occupancy,
        validate:()=>validateCommittedCandidate(candidate),
        commitConnection:async()=>{
          const record=recordFromCandidate(candidate)
          releasedObservedConnectionIds.reconnect(record.id)
          nativeObservedRecords.set(record.id,record)
          const refreshed=syncScene()
          const unresolved=connectionInterpreter?.unresolved?.().find(item=>item.recordId===record.id)
          if(unresolved){
            nativeObservedRecords.delete(record.id)
            syncScene()
            return Object.freeze({accepted:false,reason:unresolved.reason,unresolved})
          }
          committedRecord=record
          return Object.freeze({accepted:true,record,refreshed})
        },
      })
      if(!result.accepted&&committedRecord){
        nativeObservedRecords.delete(committedRecord.id)
        syncScene()
      }
      return Object.freeze({
        ...result,
        record:committedRecord,
      })
    },
    removePartConnections(instanceId) {
      const id=String(instanceId||'')
      if(!id)return 0
      const removedIds=new Set()

      for(const[recordId,record]of[...nativeObservedRecords]){
        if(record.a?.instanceId!==id&&record.b?.instanceId!==id)continue
        nativeObservedRecords.delete(recordId)
        occupancy.release(recordId)
        removedIds.add(recordId)
      }

      // First let the interpreter remove edges owned by deleted live records.
      if(removedIds.size)syncScene()

      // Project-restored native constraints are not interpreter-owned. Remove those
      // explicitly by their persisted instance metadata.
      for(const edge of [...graph.edges('constraint')]){
        const metadata=edge.metadata||{}
        if(metadata.instanceAId!==id&&metadata.instanceBId!==id)continue
        graph.removeEdge(edge.id)
        occupancy.release(metadata.occupancy?.connectionId??edge.id)
        removedIds.add(edge.id)
      }

      if(removedIds.size){
        rebuildNativeOccupancy()
        syncScene()
      }
      return removedIds.size
    },
    projectConnections() {
      return Object.freeze(api.exportProjectState().connections.map(record=>Object.freeze({
        id:record.id,
        kind:record.kind,
        a:Object.freeze({
          instanceId:record.a.instanceId,
          endpointId:record.a.endpointId,
          connectorId:record.a.observedEndpointId??record.a.endpointId,
          connectorType:record.a.semantic??'native-endpoint',
        }),
        b:Object.freeze({
          instanceId:record.b.instanceId,
          endpointId:record.b.endpointId,
          connectorId:record.b.observedEndpointId??record.b.endpointId,
          connectorType:record.b.semantic??'native-endpoint',
        }),
        metadata:Object.freeze({mechanicsNextNative:true}),
      })))
    },
    nativeProjectAuthoritative:()=>nativeProjectAuthoritative,
    findCandidate(instanceId, targetInstanceIds = null, options = {}) {
      const records = mechanicalRecords()
      const moving = records.find(record => record.instance.body.instanceId === String(instanceId))
      if (!moving) return null
      const wanted = Array.isArray(targetInstanceIds) ? new Set(targetInstanceIds.map(String)) : null
      const targets = records.filter(record =>
        record !== moving && (!wanted || wanted.has(String(record.instance.body.instanceId))))
      rebuildNativeOccupancy()
      return findBestMechanicalCandidate({
        moving,
        targets,
        occupancy,
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
        ownsProductionDomains:Object.values(ownership.snapshot().owners)
          .every(owner=>owner===MECHANICS_NEXT_OWNER_ID),
        productionOwnership:Object.freeze({
          build:globals.BrickLabMechanicsNextBuildOwner?.active===true &&
            globals.BrickLabMechanicsNextBuildOwner?.authoritative?.()===true,
          kinematics:globals.BrickLabMechanicsNextKinematics?.active?.()===true,
          physicsCreateOwner:globals.BrickLabMechanicsNextPhysicsOwner?.createOwner??null,
        }),
        graphRevision:graph.revision,
        graphBodies:graph.size,
        solverRevision:solver.revision,
        legacyImportConnections:legacyImportRecords.length,
        partIntelligence:intelligence?.stats?.() ?? null,
        nativeConnectivity:connectivity?.stats?.() ?? null,
        nativeParity:parityEvidence,
        scene:sceneObserver?.stats?.() ?? null,
        mechanicalRecordFailures:lastMechanicalRecordFailures,
        interpretedConnections:connectionInterpreter?.stats?.() ?? null,
        transmissionCompiler:transmissionCompiler.snapshot(),
        transmissionSolve:transmissionCompiler.solve(),
        compoundState:compoundState.snapshot(),
        compoundDecompositions:compoundDecompositions?.status?.() ?? null,
        compoundEndpointOwnership:lastSceneSync?.compoundEndpointOwnership??null,
        physicsPreview:physicsPreview?.status?.() ?? null,
        persistence:lastPersistenceReport,
        migrationEvidence:Object.freeze({
          parity:parityEvidence,
          regression:regressionEvidence,
        }),
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
  globals.addEventListener?.('bricklab:control-runtime-change', scheduleSceneSync)
  globals.addEventListener?.('bricklab:controls-runtime-reset', scheduleSceneSync)
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
