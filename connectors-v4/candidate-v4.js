import * as THREE from 'three'
import { totalProfileLengthV4 } from './schema-v4.js'
import { matchConnectorV4 } from './matcher-v4.js'
import { activationForMatchV4, classifyConnectorV4 } from './activation-v4.js'
import { connectorWorldFrameV4, solvePlacementV4 } from './placement-solver-v4.js'

export const CANDIDATE_SEARCH_VERSION_V4 = 'candidate-search-v4.3.1'
export const DEFAULT_CAPTURE_DISTANCE_STUD_V4 = 0.72
export const DEFAULT_MIN_AXIS_ALIGNMENT_V4 = 0.72
export const CLOSE_RANGE_MIN_AXIS_ALIGNMENT_V4 = 0.55
const SUPPORT_POSITION_EPS_STUD = 0.045
const SUPPORT_AXIS_DOT = 0.997
const SUPPORT_ANALYSIS_LIMIT = 24

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

function connectorPoseAtWorldPose(connector,worldPosition,worldQuaternion) {
  const position=new THREE.Vector3(...connector.frame.positionStud).applyQuaternion(worldQuaternion).add(worldPosition)
  const localAxis=Array.isArray(connector.frame.axis) ? connector.frame.axis : [0,-1,0]
  const axis=new THREE.Vector3(...localAxis).applyQuaternion(worldQuaternion).normalize()
  return {position,axis}
}

function countStudSupport(candidate,movingConnectors,targetConnectors,isAvailable) {
  if (candidate.activationPreview?.family !== 'stud-anti-stud') return 1
  const movingRole=candidate.activationPreview.sourceRole
  const targetRole=candidate.activationPreview.targetRole
  const sourceRole=movingRole==='stud'?'stud':movingRole==='anti-stud'?'anti-stud':null
  const expectedTargetRole=sourceRole==='stud'?'anti-stud':sourceRole==='anti-stud'?'stud':null
  if (!sourceRole || !expectedTargetRole || targetRole!==expectedTargetRole) return 1

  const sources=movingConnectors.filter(connector=>classifyConnectorV4(connector)===sourceRole)
  const targets=targetConnectors.filter(connector=>classifyConnectorV4(connector)===expectedTargetRole)
  const worldPosition=new THREE.Vector3(...candidate.solution.worldPosition)
  const worldQuaternion=new THREE.Quaternion(...candidate.solution.worldQuaternion).normalize()
  const targetFrames=new Map()
  const usedTargets=new Set()
  let support=0

  for (const source of sources) {
    if (!source?.endpointId || !isAvailable(candidate.sourceObject,source)) continue
    const sourcePose=connectorPoseAtWorldPose(source,worldPosition,worldQuaternion)
    let best=null
    for (const target of targets) {
      if (!target?.endpointId || usedTargets.has(target.endpointId) || !isAvailable(candidate.targetObject,target)) continue
      let targetFrame=targetFrames.get(target.endpointId)
      if (!targetFrame) {
        try { targetFrame=connectorWorldFrameV4(candidate.targetObject,target) } catch { continue }
        targetFrames.set(target.endpointId,targetFrame)
      }
      const distance=sourcePose.position.distanceTo(targetFrame.position)
      const alignment=sourcePose.axis.dot(targetFrame.axis)
      if (distance>SUPPORT_POSITION_EPS_STUD || alignment<SUPPORT_AXIS_DOT) continue
      if (!best || distance<best.distance) best={target,distance}
    }
    if (best) {
      usedTargets.add(best.target.endpointId)
      support+=1
    }
  }
  return Math.max(1,support)
}

function candidateScore(solution,captureDistance,minAxisAlignment,orientationFree,{preferred=false,active=true,supportCount=1}={}) {
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
  })
  return candidate
}

function compareCandidates(a,b) {
  return a.score-b.score || b.supportCount-a.supportCount || a.distanceStud-b.distanceStud || b.alignment-a.alignment || a.key.localeCompare(b.key)
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
  const results=[]
  for (const source of sources) {
    if (!source?.endpointId || !isAvailable(movingObject,source)) continue
    for (const targetObject of nearby) {
      if (!targetObject || targetObject === movingObject) continue
      const targetDef=getDefinition(targetObject.userData?.partId)
      const targetConnectors=definitionConnectors(targetDef)
      for (const target of targetConnectors) {
        if (!target?.endpointId || !isAvailable(targetObject,target)) continue
        const match=matchConnectorV4(source,target)
        if (!match?.compatible) continue
        const activationPreview=activationForMatchV4(source,target,match)
        let solution
        try {
          solution=solvePlacementV4(movingObject,source,targetObject,target,{match})
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
        }
        rescore(candidate,captureDistanceStud,minAxisAlignment,preferredKey)
        results.push(candidate)
      }
    }
  }

  // Multi-contact analysis is intentionally bounded. Corresponding stud pairs for a
  // good rigid placement have the same or nearly the same base score, so examining
  // the leading shortlist finds the rigid pattern without O(candidates × studs²)
  // work on very large plates during every TransformControls event.
  results.sort(compareCandidates)
  let analyzed=0
  for (const candidate of results) {
    if (analyzed>=SUPPORT_ANALYSIS_LIMIT) break
    if (candidate.activationPreview.family!=='stud-anti-stud') continue
    const targetDef=getDefinition(candidate.targetPartId)
    candidate.supportCount=countStudSupport(candidate,sources,definitionConnectors(targetDef),isAvailable)
    rescore(candidate,captureDistanceStud,minAxisAlignment,preferredKey)
    analyzed+=1
  }

  results.sort(compareCandidates)
  return results.slice(0,Math.max(1,Math.floor(maxResults)))
}

export function findBestPlacementCandidateV4(movingObject,targets,options={}) {
  return findPlacementCandidatesV4(movingObject,targets,{...options,maxResults:1})[0] ?? null
}
