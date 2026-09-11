import * as THREE from 'three'
import { findPart } from '../parts.js'
import { totalProfileLengthV4 } from '../connectors-v4/schema-v4.js'
import { SpatialHash3D } from './spatial-index-v1.js'
import { FrameBudgetScheduler } from './work-queue-v1.js'

export const PERFORMANCE_ENGINE_VERSION = 'performance-engine-v1.0.0'
const DEFAULT_CAPTURE_STUD=0.72
const OBJECT_CELL_STUD=4
const ENDPOINT_CELL_STUD=1.5

function objectId(object){return String(object?.userData?.instanceId || object?.uuid || '')}
function partId(object){return object?.userData?.partId || null}
function finite(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback}
function maxScale(object){
  const scale=object?.getWorldScale?.(new THREE.Vector3(1,1,1)) ?? object?.scale
  return Math.max(1e-6,Math.abs(finite(scale?.x,1)),Math.abs(finite(scale?.y,1)),Math.abs(finite(scale?.z,1)))
}
function v4Connectors(definition){
  return definition?.connectivityV4?.status==='ready' ? definition.connectivityV4.connectors ?? [] : []
}
function endpointReachStud(connector){
  try{return Math.max(0,totalProfileLengthV4(connector)/20)}catch{return 0}
}
function connectorPosition(connector,object){
  const local=connector?.frame?.positionStud
  if(!Array.isArray(local)||local.length!==3)return null
  return new THREE.Vector3(...local).applyMatrix4(object.matrixWorld)
}
function sortObjects(a,b){return objectId(a).localeCompare(objectId(b))}

export function createPerformanceEngine({
  getDefinition=findPart,
  scheduler=new FrameBudgetScheduler({budgetMs:4}),
}={}) {
  const sceneIndex=new SpatialHash3D({cellSize:OBJECT_CELL_STUD})
  const endpointIndex=new SpatialHash3D({cellSize:ENDPOINT_CELL_STUD})
  let states=new WeakMap()
  let objectsByPart=new Map()
  let expectedCount=0
  let ready=false
  let rebuildGeneration=0
  let rebuildInFlight=false
  let lastSnapshot=[]
  const diagnostics={
    rebuilds:0,restarts:0,fallbacks:0,queries:0,sceneExamined:0,endpointExamined:0,
    lastSceneCandidates:0,lastEndpointCandidates:0,lastReason:'startup',
  }

  function measure(object){
    object.updateWorldMatrix?.(true,true)
    const box=new THREE.Box3().setFromObject(object)
    if(box.isEmpty())return {localCenter:new THREE.Vector3(),localRadius:1}
    const sphere=box.getBoundingSphere(new THREE.Sphere())
    const inverse=object.matrixWorld.clone().invert()
    const localCenter=sphere.center.clone().applyMatrix4(inverse)
    return {localCenter,localRadius:Math.max(.05,sphere.radius/maxScale(object))}
  }

  function worldSphere(object,state){
    object.updateWorldMatrix?.(true,false)
    return {
      center:state.localCenter.clone().applyMatrix4(object.matrixWorld),
      radius:state.localRadius*maxScale(object),
    }
  }

  function removeEndpoints(state){
    for(const id of state.endpointIds ?? [])endpointIndex.remove(id)
    state.endpointIds=[]
    state.endpoints=[]
  }

  function indexEndpoints(object,state){
    removeEndpoints(state)
    const definition=getDefinition(partId(object))
    const connectors=v4Connectors(definition)
    state.connectorsRef=connectors
    if(!connectors.length)return
    object.updateWorldMatrix?.(true,false)
    for(const connector of connectors){
      if(!connector?.endpointId)continue
      const position=connectorPosition(connector,object)
      if(!position)continue
      const id=`${state.id}:${connector.endpointId}`
      const reach=endpointReachStud(connector)
      const value={object,connector,position,reach}
      endpointIndex.upsert(id,value,position,reach,{objectId:state.id,endpointId:connector.endpointId})
      state.endpointIds.push(id)
      state.endpoints.push(value)
    }
  }

  function registerPartObject(object){
    const id=partId(object)
    if(!id)return
    let set=objectsByPart.get(id)
    if(!set){set=new Set();objectsByPart.set(id,set)}
    set.add(object)
  }

  function indexObject(object,{remeasure=false}={}){
    if(!object)return null
    const id=objectId(object)
    if(!id)return null
    let state=states.get(object)
    if(!state){
      const shape=measure(object)
      state={id,...shape,endpointIds:[],endpoints:[],connectorsRef:null}
      states.set(object,state)
      registerPartObject(object)
    }else if(remeasure){
      const shape=measure(object)
      state.localCenter=shape.localCenter
      state.localRadius=shape.localRadius
    }
    const sphere=worldSphere(object,state)
    state.worldCenter=sphere.center
    state.worldRadius=sphere.radius
    sceneIndex.upsert(id,object,sphere.center,sphere.radius,{partId:partId(object)})
    indexEndpoints(object,state)
    return state
  }

  function touchObject(object){
    const state=states.get(object)
    if(!state)return null
    const sphere=worldSphere(object,state)
    state.worldCenter=sphere.center
    state.worldRadius=sphere.radius
    sceneIndex.upsert(state.id,object,sphere.center,sphere.radius,{partId:partId(object)})
    const current=v4Connectors(getDefinition(partId(object)))
    if(current!==state.connectorsRef){indexEndpoints(object,state);return state}
    object.updateWorldMatrix?.(true,false)
    for(let i=0;i<state.endpoints.length;i+=1){
      const value=state.endpoints[i]
      const position=connectorPosition(value.connector,object)
      if(!position)continue
      value.position=position
      endpointIndex.upsert(state.endpointIds[i],value,position,value.reach,{objectId:state.id,endpointId:value.connector.endpointId})
    }
    return state
  }

  function rebuild(objects=[],reason='manual'){
    const snapshot=[...(objects??[])].filter(Boolean)
    const generation=++rebuildGeneration
    ready=false
    rebuildInFlight=true
    expectedCount=snapshot.length
    lastSnapshot=snapshot
    sceneIndex.clear();endpointIndex.clear();states=new WeakMap();objectsByPart=new Map()
    diagnostics.rebuilds+=1
    diagnostics.lastReason=reason
    return scheduler.schedule(snapshot,object=>indexObject(object,{remeasure:true}),{key:'scene-index'}).then(result=>{
      if(generation===rebuildGeneration){
        rebuildInFlight=false
        if(!result.aborted)ready=true
      }
      return { ...result, ready, generation, objects:snapshot.length }
    })
  }

  function requestRebuild(objects,reason,{force=false}={}){
    if(rebuildInFlight&&!force)return
    if(rebuildInFlight)diagnostics.restarts+=1
    void rebuild(objects,reason).catch(error=>{rebuildInFlight=false;console.warn?.('[BrickLab Performance] Spatial rebuild failed.',error)})
  }

  function refreshPart(id){
    const set=objectsByPart.get(id)
    if(!set)return 0
    let count=0
    for(const object of set){if(states.has(object)){indexEndpoints(object,states.get(object));count+=1}}
    return count
  }

  function querySnapTargets(movingObjects,objects,{captureDistanceStud=DEFAULT_CAPTURE_STUD}={}){
    diagnostics.queries+=1
    const moving=[...(movingObjects??[])].filter(Boolean)
    const all=objects??lastSnapshot
    if(!moving.length)return null
    if(!ready||!all||expectedCount!==all.length){
      diagnostics.fallbacks+=1
      if(all&&expectedCount!==all.length)requestRebuild(all,'membership-count',{force:true})
      else if(all&&!rebuildInFlight)requestRebuild(all,'not-ready')
      return null
    }
    if(moving.some(object=>!states.has(object))){
      diagnostics.fallbacks+=1
      requestRebuild(all,'moving-object-not-indexed',{force:true})
      return null
    }

    const capture=Math.max(0,finite(captureDistanceStud,DEFAULT_CAPTURE_STUD))
    const internal=new Set(moving)
    const sceneObjects=new Set()
    const endpointObjects=new Set()
    let sceneExamined=0,endpointExamined=0

    for(const object of moving){
      const state=touchObject(object)
      if(!state)continue
      const result=sceneIndex.querySphere(state.worldCenter,state.worldRadius+capture)
      sceneExamined+=result.examined
      for(const target of result.values)if(target&&!internal.has(target))sceneObjects.add(target)

      for(const sourceEndpoint of state.endpoints){
        const endpoints=endpointIndex.querySphere(sourceEndpoint.position,capture+sourceEndpoint.reach)
        endpointExamined+=endpoints.examined
        for(const entry of endpoints.values){
          const target=entry?.object
          if(target&&!internal.has(target))endpointObjects.add(target)
        }
      }
    }

    diagnostics.sceneExamined+=sceneExamined
    diagnostics.endpointExamined+=endpointExamined
    diagnostics.lastSceneCandidates=sceneObjects.size
    diagnostics.lastEndpointCandidates=endpointObjects.size
    const local=[...sceneObjects].sort(sortObjects)
    const endpointLocal=[...endpointObjects].sort(sortObjects)
    return {
      version:PERFORMANCE_ENGINE_VERSION,
      objects:local,
      connectorObjects:endpointLocal.length||moving.some(object=>(states.get(object)?.endpoints.length??0)>0)?endpointLocal:local,
      sceneExamined,
      endpointExamined,
      totalObjects:expectedCount,
    }
  }

  function scheduleAnalysis(items,worker,options={}){
    return scheduler.schedule(items,worker,{key:options.key||'analysis'})
  }

  function stats(){
    return Object.freeze({
      version:PERFORMANCE_ENGINE_VERSION,
      ready,
      expectedCount,
      ...diagnostics,
      scene:sceneIndex.stats(),
      endpoints:endpointIndex.stats(),
      scheduler:scheduler.stats(),
    })
  }

  return Object.freeze({
    version:PERFORMANCE_ENGINE_VERSION,
    rebuild,
    refreshPart,
    markDirty:touchObject,
    querySnapTargets,
    scheduleAnalysis,
    abortAnalysis:key=>scheduler.abort(key||'analysis'),
    stats,
  })
}

const engine=createPerformanceEngine()
globalThis.BrickLabPerformance=engine

const editorObjects=()=>globalThis.BrickLabSubsystems?.editor?.objects?.() ?? globalThis.BrickLabConnectorV4?.objects?.() ?? []
const initial=editorObjects()
if(initial.length)void engine.rebuild(initial,'startup').catch(error=>console.warn?.('[BrickLab Performance] Startup index failed.',error))

if(typeof window!=='undefined'){
  window.addEventListener('bricklab:connectorv4',event=>{
    if(event.detail?.partId)engine.refreshPart(event.detail.partId)
  })
  window.addEventListener('bricklab:ldrawloaded',event=>{
    if(event.detail?.id)engine.refreshPart(event.detail.id)
  })
}
