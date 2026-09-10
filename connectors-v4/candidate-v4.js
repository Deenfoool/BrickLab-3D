import * as THREE from 'three'
import { totalProfileLengthV4 } from './schema-v4.js'
import { solvePlacementV4 } from './placement-solver-v4.js?v=connector-v4-20260910-v3'

export const CANDIDATE_SEARCH_VERSION_V4 = 'candidate-search-v4.0.0'
export const DEFAULT_CAPTURE_DISTANCE_STUD_V4 = 0.55
export const DEFAULT_MIN_AXIS_ALIGNMENT_V4 = 0.90

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

function candidateScore(solution,captureDistance,minAxisAlignment,orientationFree) {
  const translation=solution.diagnostics?.translationStud ?? Infinity
  const distanceScore=translation/Math.max(captureDistance,1e-6)
  if (orientationFree) return distanceScore
  const alignment=Math.abs(solution.diagnostics?.initialAxisDot ?? 0)
  const alignmentRange=Math.max(1e-5,1-minAxisAlignment)
  const alignmentPenalty=Math.max(0,(1-alignment)/alignmentRange)*0.10
  const rotation=Math.min(Math.PI,Math.abs(solution.diagnostics?.rotationRad ?? 0))
  const rotationPenalty=(rotation/Math.PI)*0.06
  return distanceScore+alignmentPenalty+rotationPenalty
}

export function findPlacementCandidatesV4(movingObject,targets,{
  getDefinition,
  captureDistanceStud=DEFAULT_CAPTURE_DISTANCE_STUD_V4,
  minAxisAlignment=DEFAULT_MIN_AXIS_ALIGNMENT_V4,
  isAvailable=()=>true,
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
      for (const target of definitionConnectors(targetDef)) {
        if (!target?.endpointId || !isAvailable(targetObject,target)) continue
        let solution
        try {
          solution=solvePlacementV4(movingObject,source,targetObject,target)
        } catch (error) {
          continue
        }
        if (!solution.valid) continue
        const translation=solution.diagnostics?.translationStud ?? Infinity
        if (!(translation <= captureDistanceStud)) continue
        const orientationFree=isOrientationFree(source,solution.match)
        const alignment=Math.abs(solution.diagnostics?.initialAxisDot ?? 0)
        if (!orientationFree && alignment < minAxisAlignment) continue
        results.push({
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
          key:candidateKey(movingObject,source,targetObject,target),
          match:solution.match,
          solution,
          distanceStud:translation,
          alignment,
          score:candidateScore(solution,captureDistanceStud,minAxisAlignment,orientationFree),
        })
      }
    }
  }
  results.sort((a,b)=>a.score-b.score || a.distanceStud-b.distanceStud || a.key.localeCompare(b.key))
  return results.slice(0,Math.max(1,Math.floor(maxResults)))
}

export function findBestPlacementCandidateV4(movingObject,targets,options={}) {
  return findPlacementCandidatesV4(movingObject,targets,{...options,maxResults:1})[0] ?? null
}
