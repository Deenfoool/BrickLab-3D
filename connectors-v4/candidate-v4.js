import * as THREE from 'three'
import { totalProfileLengthV4 } from './schema-v4.js'
import { matchConnectorV4 } from './matcher-v4.js'
import { activationForMatchV4, classifyConnectorV4 } from './activation-v4.js'
import { connectorWorldFrameV4, objectWorldPoseV4, solvePlacementV4 } from './placement-solver-v4.js'

export const CANDIDATE_SEARCH_VERSION_V4 = 'candidate-search-v4.6.0'
export const DEFAULT_CAPTURE_DISTANCE_STUD_V4 = 0.72
export const DEFAULT_MIN_AXIS_ALIGNMENT_V4 = 0.72
export const CLOSE_RANGE_MIN_AXIS_ALIGNMENT_V4 = 0.55
const SUPPORT_POSITION_EPS_STUD = 0.045
const SUPPORT_AXIS_DOT = 0.997
const SUPPORT_ANALYSIS_LIMIT = 24
const SUPPORT_CELL_STUD = SUPPORT_POSITION_EPS_STUD * 2
const MULTI_TWIST_BASIS_LIMIT = 6
const MULTI_TWIST_TRIAL_LIMIT = 10
const MULTI_TWIST_MIN_BASE_STUD = 0.45
const MULTI_TWIST_LENGTH_TOL_STUD = 0.12
const MULTI_TWIST_MAX_RAD = Math.PI / 2 + 0.05
const pairCompatibilityCache = new WeakMap()

function definitionConnectors(definition) {
  return definition?.connectivityV4?.status === 'ready'
    ? definition.connectivityV4.connectors ?? []
    : []
}

function candidateKey(movingObject,source,targetObject,target) {
  return `v4:${movingObject?.userData?.instanceId || 'moving'}:${source.endpointId}>${targetObject?.userData?.instanceId || 'target'}:${target.endpointId}`
}

function isOrientationFree(source,match) {
  const placement=String(source?.snap?.placement || '').toLowerCase()
  return placement === 'free' || placement === 'retain' || match?.kinematicHint === 'spherical'
}

function captureError(solution) {
  return solution.diagnostics?.captureCorrectionStud ?? solution.diagnostics?.translationStud ?? Infinity
}

function adaptiveAlignmentThreshold(distance,captureDistance,minAxisAlignment) {
  const proximity=THREE.MathUtils.clamp(1-distance/Math.max(captureDistance,1e-6),0,1)
  const relaxed=minAxisAlignment-(minAxisAlignment-CLOSE_RANGE_MIN_AXIS_ALIGNMENT_V4)*proximity
  return THREE.MathUtils.clamp(relaxed,CLOSE_RANGE_MIN_AXIS_ALIGNMENT_V4,1)
}

function cachedPair(source,target) {
  let targets=pairCompatibilityCache.get(source)
  if (!targets) {
    targets=new WeakMap()
    pairCompatibilityCache.set(source,targets)
  }
  let pair=targets.get(target)
  if (!pair) {
    const match=matchConnectorV4(source,target)
    pair=Object.freeze({match,activationPreview:match?.compatible?activationForMatchV4(source,target,match):null})
    targets.set(target,pair)
  }
  return pair
}

function connectorPoseAtWorldPose(connector,worldPosition,worldQuaternion) {
  const position=new THREE.Vector3(...connector.frame.positionStud).applyQuaternion(worldQuaternion).add(worldPosition)
  const localAxis=Array.isArray(connector.frame.axis) ? connector.frame.axis : [0,-1,0]
  const axis=new THREE.Vector3(...localAxis).applyQuaternion(worldQuaternion).normalize()
  return {position,axis}
}

function supportCell(position) {
  return [
    Math.floor(position.x/SUPPORT_CELL_STUD),
    Math.floor(position.y/SUPPORT_CELL_STUD),
    Math.floor(position.z/SUPPORT_CELL_STUD),
  ]
}
function supportCellKey(x,y,z){return `${x}:${y}:${z}`}
function nearbySupportEntries(index,position) {
  const [cx,cy,cz]=supportCell(position)
  const found=[]
  for(let x=cx-1;x<=cx+1;x+=1)for(let y=cy-1;y<=cy+1;y+=1)for(let z=cz-1;z<=cz+1;z+=1){
    const bucket=index.get(supportCellKey(x,y,z))
    if(bucket)found.push(...bucket)
  }
  return found
}

function buildSupportIndex(targetObject,targetConnectors,role,isAvailable,targetFrameCache) {
  const index=new Map()
  for(const target of targetConnectors) {
    if(classifyConnectorV4(target)!==role || !target?.endpointId || !isAvailable(targetObject,target))continue
    let frame=targetFrameCache.get(target.endpointId)
    if(!frame){
      try{frame=connectorWorldFrameV4(targetObject,target)}catch{continue}
      targetFrameCache.set(target.endpointId,frame)
    }
    const [x,y,z]=supportCell(frame.position)
    const key=supportCellKey(x,y,z)
    const bucket=index.get(key)??[]
    bucket.push({target,frame})
    index.set(key,bucket)
  }
  return index
}

function supportPoseKey(candidate) {
  const p=candidate.solution.worldPosition
  const q=candidate.solution.worldQuaternion
  const rounded=value=>Math.round(value*10000)
  return `${candidate.targetObject?.userData?.instanceId||''}:${p.map(rounded).join(',')}:${q.map(rounded).join(',')}:${candidate.activationPreview?.sourceRole||''}`
}

function studRoles(candidate) {
  if(candidate.activationPreview?.family!=='stud-anti-stud')return null
  const sourceRole=candidate.activationPreview.sourceRole
  const targetRole=candidate.activationPreview.targetRole
  if(!['stud','anti-stud'].includes(sourceRole)||!['stud','anti-stud'].includes(targetRole)||sourceRole===targetRole)return null
  return {sourceRole,targetRole}
}

function countStudSupport(candidate,movingConnectors,targetConnectors,isAvailable,targetFrameCache,supportIndexCache) {
  const roles=studRoles(candidate)
  if(!roles)return 1
  const sources=movingConnectors.filter(connector=>classifyConnectorV4(connector)===roles.sourceRole)
  const cacheKey=`${candidate.targetObject?.userData?.instanceId||''}:${roles.targetRole}`
  let index=supportIndexCache.get(cacheKey)
  if(!index){
    index=buildSupportIndex(candidate.targetObject,targetConnectors,roles.targetRole,isAvailable,targetFrameCache)
    supportIndexCache.set(cacheKey,index)
  }
  const worldPosition=new THREE.Vector3(...candidate.solution.worldPosition)
  const worldQuaternion=new THREE.Quaternion(...candidate.solution.worldQuaternion).normalize()
  const usedTargets=new Set()
  let support=0

  for (const source of sources) {
    if (!source?.endpointId || !isAvailable(candidate.sourceObject,source)) continue
    const sourcePose=connectorPoseAtWorldPose(source,worldPosition,worldQuaternion)
    let best=null
    for (const entry of nearbySupportEntries(index,sourcePose.position)) {
      const target=entry.target
      if(usedTargets.has(target.endpointId))continue
      const distance=sourcePose.position.distanceTo(entry.frame.position)
      const alignment=sourcePose.axis.dot(entry.frame.axis)
      if(distance>SUPPORT_POSITION_EPS_STUD||alignment<SUPPORT_AXIS_DOT)continue
      if(!best||distance<best.distance)best={target,distance}
    }
    if (best) {
      usedTargets.add(best.target.endpointId)
      support+=1
    }
  }
  return Math.max(1,support)
}

function signedAngleAround(from,to,axis) {
  const a=from.clone().projectOnPlane(axis)
  const b=to.clone().projectOnPlane(axis)
  if(a.lengthSq()<1e-10||b.lengthSq()<1e-10)return null
  a.normalize();b.normalize()
  return Math.atan2(axis.dot(a.clone().cross(b)),THREE.MathUtils.clamp(a.dot(b),-1,1))
}

function multiStudTwistSuggestions(candidate,movingConnectors,targetConnectors,isAvailable,movingFrameCache,targetFrameCache) {
  const roles=studRoles(candidate)
  if(!roles)return []
  const sourceSeed=movingFrameCache.get(candidate.source.endpointId)
  const targetSeed=targetFrameCache.get(candidate.target.endpointId)
  if(!sourceSeed||!targetSeed)return []

  const axisAlign=new THREE.Quaternion().setFromUnitVectors(sourceSeed.axis,targetSeed.axis)
  const sourceBases=[]
  for(const source of movingConnectors){
    if(source===candidate.source||classifyConnectorV4(source)!==roles.sourceRole||!isAvailable(candidate.sourceObject,source))continue
    let frame=movingFrameCache.get(source.endpointId)
    if(!frame){
      try{frame=connectorWorldFrameV4(candidate.sourceObject,source)}catch{continue}
      movingFrameCache.set(source.endpointId,frame)
    }
    const vector=frame.position.clone().sub(sourceSeed.position).applyQuaternion(axisAlign).projectOnPlane(targetSeed.axis)
    const length=vector.length()
    if(length>=MULTI_TWIST_MIN_BASE_STUD)sourceBases.push({vector,length})
  }
  sourceBases.sort((a,b)=>a.length-b.length)
  if(!sourceBases.length)return []

  const targetBases=[]
  for(const target of targetConnectors){
    if(target===candidate.target||classifyConnectorV4(target)!==roles.targetRole||!isAvailable(candidate.targetObject,target))continue
    let frame=targetFrameCache.get(target.endpointId)
    if(!frame){
      try{frame=connectorWorldFrameV4(candidate.targetObject,target)}catch{continue}
      targetFrameCache.set(target.endpointId,frame)
    }
    const vector=frame.position.clone().sub(targetSeed.position).projectOnPlane(targetSeed.axis)
    const length=vector.length()
    if(length>=MULTI_TWIST_MIN_BASE_STUD)targetBases.push({vector,length})
  }
  if(!targetBases.length)return []

  const unique=new Map()
  for(const source of sourceBases.slice(0,MULTI_TWIST_BASIS_LIMIT)){
    for(const target of targetBases){
      const tolerance=Math.max(MULTI_TWIST_LENGTH_TOL_STUD,source.length*0.035)
      if(Math.abs(source.length-target.length)>tolerance)continue
      const angle=signedAngleAround(source.vector,target.vector,targetSeed.axis)
      if(!Number.isFinite(angle)||Math.abs(angle)>MULTI_TWIST_MAX_RAD)continue
      const key=Math.round(angle*10000)
      if(!unique.has(key))unique.set(key,angle)
    }
  }
  return [...unique.values()].sort((a,b)=>Math.abs(a)-Math.abs(b)).slice(0,MULTI_TWIST_TRIAL_LIMIT)
}

function genericBoundingMismatch(source,target) {
  if(source?.family!=='generic'||target?.family!=='generic')return 0
  const a=source.geometry?.bounding,b=target.geometry?.bounding
  if(!a&&!b)return 0
  if(!a||!b||a.kind!==b.kind)return 1
  const ratio=(x,y)=>{
    const nx=Number(x),ny=Number(y)
    if(!Number.isFinite(nx)||!Number.isFinite(ny))return 1
    return Math.abs(nx-ny)/Math.max(1,Math.abs(nx),Math.abs(ny))
  }
  if(a.kind==='sphere')return ratio(a.radiusLdu,b.radiusLdu)
  if(a.kind==='cube')return ratio(a.halfSizeLdu,b.halfSizeLdu)
  if(a.kind==='cylinder')return (ratio(a.radiusLdu,b.radiusLdu)+ratio(a.lengthLdu,b.lengthLdu))/2
  if(a.kind==='box'&&Array.isArray(a.halfExtentsLdu)&&Array.isArray(b.halfExtentsLdu))return a.halfExtentsLdu.reduce((sum,value,index)=>sum+ratio(value,b.halfExtentsLdu[index]),0)/3
  return 0
}

function candidateScore(solution,captureDistance,minAxisAlignment,orientationFree,{preferred=false,active=true,supportCount=1,boundingMismatch=0}={}) {
  const distance=captureError(solution)
  const distanceScore=distance/Math.max(captureDistance,1e-6)
  const rotation=Math.min(Math.PI,Math.abs(solution.diagnostics?.rotationRad ?? 0))
  const originMotion=Math.max(0,solution.diagnostics?.translationStud ?? distance)
  const lateral=Math.max(0,solution.diagnostics?.initialLateralDistanceStud ?? distance)
  const clearance=Math.abs(solution.match?.fit?.clearanceLdu ?? 0)
  const engagement=Math.max(0,solution.diagnostics?.engagementLdu ?? 0)

  let score=distanceScore
  if (!orientationFree) {
    const alignment=THREE.MathUtils.clamp(solution.diagnostics?.initialAxisDot ?? -1,-1,1)
    const required=adaptiveAlignmentThreshold(distance,captureDistance,minAxisAlignment)
    const range=Math.max(1e-5,1-required)
    score+=Math.max(0,(1-alignment)/range)*0.13
    score+=(rotation/Math.PI)*0.11
  }
  score+=Math.min(1.5,lateral/Math.max(captureDistance,1e-6))*0.06
  score+=Math.min(2,originMotion/Math.max(captureDistance,1e-6))*0.025
  score+=Math.min(1,clearance/0.35)*0.035
  score+=Math.min(1,Math.max(0,boundingMismatch))*0.08
  score-=Math.min(1,engagement/20)*0.025
  if (!active) score+=4
  score-=Math.min(0.34,Math.max(0,supportCount-1)*0.048)
  if (preferred) score-=0.075
  return score
}

function rescore(candidate,captureDistance,minAxisAlignment,preferredKey) {
  candidate.score=candidateScore(candidate.solution,captureDistance,minAxisAlignment,candidate.orientationFree,{
    preferred:candidate.key===preferredKey,
    active:candidate.activationPreview.active===true,
    supportCount:candidate.supportCount,
    boundingMismatch:candidate.boundingMismatch,
  })
  return candidate
}

function compareCandidates(a,b) {
  return a.score-b.score || b.supportCount-a.supportCount || a.distanceStud-b.distanceStud || b.alignment-a.alignment || a.key.localeCompare(b.key)
}

function updateCandidateFromSolution(candidate,solution) {
  candidate.solution=solution
  candidate.distanceStud=captureError(solution)
  candidate.originTranslationStud=solution.diagnostics?.translationStud ?? candidate.distanceStud
  candidate.lateralDistanceStud=solution.diagnostics?.initialLateralDistanceStud ?? candidate.distanceStud
}

function refineMultiStudTwist(candidate,movingConnectors,targetConnectors,isAvailable,movingFrameCache,targetFrameCache,movingPose,supportIndexCache) {
  if(candidate.supportCount>1)return candidate
  const suggestions=multiStudTwistSuggestions(candidate,movingConnectors,targetConnectors,isAvailable,movingFrameCache,targetFrameCache)
  if(!suggestions.length)return candidate
  const movingFrame=movingFrameCache.get(candidate.source.endpointId)
  const targetFrame=targetFrameCache.get(candidate.target.endpointId)
  let bestSolution=candidate.solution
  let bestSupport=candidate.supportCount
  let bestAbsTwist=Infinity

  for(const twistCorrectionRad of suggestions){
    let solution
    try{
      solution=solvePlacementV4(candidate.sourceObject,candidate.source,candidate.targetObject,candidate.target,{
        match:candidate.match,movingFrame,targetFrame,movingPose,twistCorrectionRad,
      })
    }catch{continue}
    if(!solution.valid)continue
    const trial={...candidate,solution}
    const support=countStudSupport(trial,movingConnectors,targetConnectors,isAvailable,targetFrameCache,supportIndexCache)
    const absTwist=Math.abs(twistCorrectionRad)
    if(support>bestSupport||(support===bestSupport&&support>1&&absTwist<bestAbsTwist)){
      bestSupport=support
      bestAbsTwist=absTwist
      bestSolution=solution
    }
  }

  if(bestSolution!==candidate.solution&&bestSupport>candidate.supportCount){
    updateCandidateFromSolution(candidate,bestSolution)
    candidate.supportCount=bestSupport
    candidate.multiContactTwistRefined=true
  }
  return candidate
}

export function findPlacementCandidatesV4(movingObject,targets,{
  getDefinition,
  captureDistanceStud=DEFAULT_CAPTURE_DISTANCE_STUD_V4,
  minAxisAlignment=DEFAULT_MIN_AXIS_ALIGNMENT_V4,
  isAvailable=()=>true,
  preferredKey=null,
  maxResults=12,
}={}) {
  if (!movingObject || typeof getDefinition !== 'function') return []
  const movingDef=getDefinition(movingObject.userData?.partId)
  const sources=definitionConnectors(movingDef)
  if (!sources.length) return []

  const bounds=new WeakMap()
  const extent=def=>{
    if (!bounds.has(def)) bounds.set(def,Math.max(0,...definitionConnectors(def).map(c=>new THREE.Vector3(...c.frame.positionStud).length()+totalProfileLengthV4(c)/20+1)))
    return bounds.get(def)
  }
  const center=movingObject.getWorldPosition(new THREE.Vector3())
  const nearby=(targets??[]).filter(o=>{
    if (!o || o===movingObject) return false
    const def=getDefinition(o.userData?.partId)
    return def && definitionConnectors(def).length && center.distanceTo(o.getWorldPosition(new THREE.Vector3())) <= extent(movingDef)+extent(def)+captureDistanceStud
  })
  const movingPose=objectWorldPoseV4(movingObject)
  const movingFrameCache=new Map()
  const targetFrameCaches=new WeakMap()
  const results=[]

  for (const source of sources) {
    if (!source?.endpointId || !isAvailable(movingObject,source)) continue
    let movingFrame=movingFrameCache.get(source.endpointId)
    if (!movingFrame) {
      try { movingFrame=connectorWorldFrameV4(movingObject,source) } catch { continue }
      movingFrameCache.set(source.endpointId,movingFrame)
    }
    for (const targetObject of nearby) {
      if (!targetObject || targetObject === movingObject) continue
      const targetDef=getDefinition(targetObject.userData?.partId)
      const targetConnectors=definitionConnectors(targetDef)
      let targetFrameCache=targetFrameCaches.get(targetObject)
      if (!targetFrameCache) { targetFrameCache=new Map(); targetFrameCaches.set(targetObject,targetFrameCache) }
      for (const target of targetConnectors) {
        if (!target?.endpointId || !isAvailable(targetObject,target)) continue
        const {match,activationPreview}=cachedPair(source,target)
        if (!match?.compatible) continue
        let targetFrame=targetFrameCache.get(target.endpointId)
        if (!targetFrame) {
          try { targetFrame=connectorWorldFrameV4(targetObject,target) } catch { continue }
          targetFrameCache.set(target.endpointId,targetFrame)
        }
        let solution
        try {
          solution=solvePlacementV4(movingObject,source,targetObject,target,{match,movingFrame,targetFrame,movingPose})
        } catch {
          continue
        }
        if (!solution.valid) continue
        const distance=captureError(solution)
        if (!(distance <= captureDistanceStud)) continue
        const orientationFree=isOrientationFree(source,solution.match)
        const alignment=THREE.MathUtils.clamp(solution.diagnostics?.initialAxisDot ?? -1,-1,1)
        const requiredAlignment=adaptiveAlignmentThreshold(distance,captureDistanceStud,minAxisAlignment)
        if (!orientationFree && alignment < requiredAlignment) continue
        const key=candidateKey(movingObject,source,targetObject,target)
        const candidate={
          schemaVersion:4,
          searchVersion:CANDIDATE_SEARCH_VERSION_V4,
          kind:'connector-v4-placement',
          placementOnly:true,
          physicsReady:false,
          collisionUnchecked:true,
          source,
          target,
          sourceObject:movingObject,
          targetObject,
          sourcePartId:movingDef?.id || movingObject.userData?.partId || null,
          targetPartId:targetDef?.id || targetObject.userData?.partId || null,
          key,
          match:solution.match,
          activationPreview,
          solution,
          distanceStud:distance,
          originTranslationStud:solution.diagnostics?.translationStud ?? distance,
          lateralDistanceStud:solution.diagnostics?.initialLateralDistanceStud ?? distance,
          alignment,
          requiredAlignment,
          orientationFree,
          supportCount:1,
          boundingMismatch:genericBoundingMismatch(source,target),
        }
        rescore(candidate,captureDistanceStud,minAxisAlignment,preferredKey)
        results.push(candidate)
      }
    }
  }

  results.sort(compareCandidates)
  let analyzed=0
  const supportIndexCache=new Map()
  const supportPoseCache=new Map()
  for (const candidate of results) {
    if (analyzed>=SUPPORT_ANALYSIS_LIMIT) break
    if (candidate.activationPreview.family!=='stud-anti-stud') continue
    const targetDef=getDefinition(candidate.targetPartId)
    const targetConnectors=definitionConnectors(targetDef)
    const targetFrameCache=targetFrameCaches.get(candidate.targetObject) ?? new Map()
    const poseKey=supportPoseKey(candidate)
    let support=supportPoseCache.get(poseKey)
    if(support==null){
      support=countStudSupport(candidate,sources,targetConnectors,isAvailable,targetFrameCache,supportIndexCache)
      supportPoseCache.set(poseKey,support)
    }
    candidate.supportCount=support
    refineMultiStudTwist(candidate,sources,targetConnectors,isAvailable,movingFrameCache,targetFrameCache,movingPose,supportIndexCache)
    rescore(candidate,captureDistanceStud,minAxisAlignment,preferredKey)
    analyzed+=1
  }

  results.sort(compareCandidates)
  const limit=Number.isFinite(maxResults)?Math.max(1,Math.floor(maxResults)):results.length
  return limit>=results.length?results:results.slice(0,limit)
}

export function findBestPlacementCandidateV4(movingObject,targets,options={}) {
  return findPlacementCandidatesV4(movingObject,targets,{...options,maxResults:1})[0] ?? null
}
