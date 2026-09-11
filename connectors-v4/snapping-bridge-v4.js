import * as THREE from 'three'
import * as V3 from '../snapping-v3.js'
import { suppressNextConnectionForEndpoint } from '../connections.js'
import { interactionGroupMembers } from '../editor-groups-v1.js'

export * from '../snapping-v3.js'

export const SNAPPING_BRIDGE_VERSION_V4 = 'connector-snapping-bridge-v4.6.0'

let preferredCandidateKey = null
let preferredInteractionId = null
let connectivityWarmPromise = null
let lastConnectivityWarmAt = 0

function runtime() {
  const value = globalThis.BrickLabConnectorV4
  return value?.mode === 'hybrid-pilot' && value?.selfTest?.pass ? value : null
}

function bridgeConnector(connector, role) {
  return {
    ...connector,
    id:connector.endpointId,
    type:`v4-${role || connector.family || 'connector'}`,
  }
}

function markerPosition(candidate) {
  const desired = candidate.solution?.desiredConnectorPositionWorld
  if (Array.isArray(desired) && desired.length === 3) return new THREE.Vector3(...desired)
  const target = new THREE.Vector3(...(candidate.solution?.targetPositionWorld ?? [0,0,0]))
  const axis = new THREE.Vector3(...(candidate.solution?.targetAxisWorld ?? [0,1,0])).normalize()
  const axial = Number(candidate.solution?.axial?.offsetStud) || 0
  return target.addScaledVector(axis, axial)
}

function bridgeCandidate(candidate) {
  if (!candidate) return null
  const sourceRole = candidate.certification?.activation?.sourceRole
  const targetRole = candidate.certification?.activation?.targetRole
  return {
    ...candidate,
    kind:'connector-v4-active',
    bridgeVersion:SNAPPING_BRIDGE_VERSION_V4,
    placementOnly:true,
    source:bridgeConnector(candidate.source, sourceRole),
    target:bridgeConnector(candidate.target, targetRole),
    targetWorld:markerPosition(candidate),
    distance:candidate.distanceStud,
    v4RawSource:candidate.source,
    v4RawTarget:candidate.target,
  }
}

function isLDrawPart(object) {
  return String(object?.userData?.partId || '').startsWith('ldraw-')
}

function interactionId(object) {
  return object?.userData?.groupId
    ? `group:${object.userData.groupId}`
    : `part:${object?.userData?.instanceId || ''}`
}

function groupMembers(object) {
  const members = interactionGroupMembers(object)
  return members.length ? members : (object ? [object] : [])
}

function externalTargets(selected, objects) {
  const internal = new Set(groupMembers(selected))
  return (objects ?? []).filter(object => object && !internal.has(object))
}

function performanceTargets(selected, objects, options) {
  const engine=globalThis.BrickLabPerformance
  if(!engine?.querySnapTargets)return null
  const captureDistanceStud=typeof options === 'number' ? options : options?.maxDistance
  try {
    return engine.querySnapTargets(groupMembers(selected),objects,{captureDistanceStud})
  } catch (error) {
    console.debug?.('[BrickLab Performance] Spatial SNAP query fell back to the legacy target list.',error)
    return null
  }
}

function warmNearbyConnectivity(v4,selected,objects) {
  if (!v4?.hydrateObjects || !selected) return
  const now=typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (connectivityWarmPromise || now-lastConnectivityWarmAt<180) return
  lastConnectivityWarmAt=now
  const members=groupMembers(selected)
  const origin=members.reduce((sum,object)=>sum.add(object.getWorldPosition(new THREE.Vector3())),new THREE.Vector3())
    .multiplyScalar(1/Math.max(1,members.length))
  const nearby=(objects??[])
    .filter(object=>object && isLDrawPart(object))
    .map(object=>({object,distance:origin.distanceTo(object.getWorldPosition(new THREE.Vector3()))}))
    .sort((a,b)=>a.distance-b.distance)
    .slice(0,31)
    .map(entry=>entry.object)
  const batch=[...members.filter(isLDrawPart),...nearby]
  connectivityWarmPromise=Promise.resolve(v4.hydrateObjects(batch))
    .catch(error=>console.debug?.('[BrickLab Connector V4] Nearby connectivity warmup failed.',error))
    .finally(()=>{connectivityWarmPromise=null})
}

export function v4OwnsLegacyCandidate(selected, legacy) {
  if (!legacy || legacy.kind === 'gear-mesh') return false
  const target=legacy.targetObject
  return isLDrawPart(selected) && isLDrawPart(target)
}

function candidateOrderValue(candidate) {
  if (!candidate) return Number.POSITIVE_INFINITY
  if (Number.isFinite(candidate.score)) return candidate.score
  if (Number.isFinite(candidate.distanceStud)) return candidate.distanceStud
  if (Number.isFinite(candidate.distance)) return candidate.distance
  return Number.POSITIVE_INFINITY
}

function bestGroupV4Candidate(v4,selected,targets,options) {
  const members=groupMembers(selected).filter(isLDrawPart)
  let best=null
  for(const member of members){
    const candidate=v4.findActiveCandidate(member,targets,options)
    if(!candidate)continue
    candidate.groupSourceObject=member
    candidate.groupInteractionId=interactionId(selected)
    if(!best || candidateOrderValue(candidate)<candidateOrderValue(best)) best=candidate
  }
  return best
}

function captureGroupWorldState(selected) {
  const members=groupMembers(selected)
  const matrices=new Map()
  for(const object of members){
    object.updateWorldMatrix(true,false)
    matrices.set(object,object.matrixWorld.clone())
  }
  return {members,matrices}
}

function applyWorldMatrix(object,worldMatrix) {
  if(!object?.parent)return
  object.parent.updateWorldMatrix(true,false)
  const local=object.parent.matrixWorld.clone().invert().multiply(worldMatrix)
  local.decompose(object.position,object.quaternion,object.scale)
  object.updateMatrixWorld(true)
}

function propagateAnchorDelta(anchor,state) {
  if(!anchor || !state?.matrices?.has(anchor) || state.members.length<2)return
  anchor.updateWorldMatrix(true,false)
  const before=state.matrices.get(anchor)
  const delta=anchor.matrixWorld.clone().multiply(before.clone().invert())
  for(const object of state.members){
    if(object===anchor)continue
    const start=state.matrices.get(object)
    if(start)applyWorldMatrix(object,delta.clone().multiply(start))
  }
}

export function findSnapCandidate(selected, objects, options = {}) {
  const spatial=performanceTargets(selected,objects,options)
  const targets=spatial?.objects ?? externalTargets(selected,objects)
  const connectorTargets=spatial?.connectorObjects ?? targets
  const legacy = V3.findSnapCandidate(selected, targets, options)
  if (legacy?.kind === 'gear-mesh') return legacy

  const v4 = runtime()
  const id=interactionId(selected)
  if (id !== preferredInteractionId) {
    preferredInteractionId=id
    preferredCandidateKey=null
  }

  if (v4 && groupMembers(selected).some(isLDrawPart)) {
    warmNearbyConnectivity(v4,selected,targets)
    try {
      const candidate = bestGroupV4Candidate(v4,selected,connectorTargets,{
        maxResults:Number.POSITIVE_INFINITY,
        preferredKey:preferredCandidateKey,
        captureDistanceStud:typeof options === 'number' ? options : options?.maxDistance,
        minAxisAlignment:typeof options === 'object' ? options?.minAlignment : undefined,
      })
      if (candidate) {
        preferredCandidateKey=candidate.key
        return bridgeCandidate(candidate)
      }
      preferredCandidateKey=null
    } catch (error) {
      preferredCandidateKey=null
      console.warn('[BrickLab Connector V4] Active candidate search failed closed for V4-owned families.', error)
    }
  }

  if (v4OwnsLegacyCandidate(selected, legacy)) return null
  return legacy
}

export function orientForSnap(selected, candidate) {
  if (candidate?.kind === 'connector-v4-active') return
  const state=captureGroupWorldState(selected)
  V3.orientForSnap(selected,candidate)
  propagateAnchorDelta(selected,state)
}

export function applySnap(selected, candidate) {
  const state=captureGroupWorldState(selected)
  if (candidate?.kind !== 'connector-v4-active') {
    const result=V3.applySnap(selected,candidate)
    propagateAnchorDelta(selected,state)
    return result
  }

  const v4 = runtime()
  const sourceObject=candidate.groupSourceObject ?? candidate.sourceObject ?? selected
  const suppressInstanceId=selected?.userData?.instanceId
  const endpointId=candidate?.source?.id
  if (suppressInstanceId && endpointId) suppressNextConnectionForEndpoint(suppressInstanceId, endpointId)

  if (!v4) {
    candidate.v4Commit = { accepted:false, reason:'runtime-unavailable' }
    return
  }
  const rawCandidate = {
    ...candidate,
    sourceObject,
    source:candidate.v4RawSource ?? candidate.source,
    target:candidate.v4RawTarget ?? candidate.target,
  }
  try {
    const result = v4.commitActiveCandidate(rawCandidate)
    candidate.v4Commit = result
    globalThis.__bricklabLastConnectorV4Commit = result
    if (result?.accepted) {
      propagateAnchorDelta(sourceObject,state)
      preferredCandidateKey=null
    }
    if (!result?.accepted) console.warn('[BrickLab Connector V4] Snap candidate failed final commit validation.', result)
  } catch (error) {
    candidate.v4Commit = { accepted:false, reason:'bridge-exception', error:String(error?.message || error) }
    globalThis.__bricklabLastConnectorV4Commit = candidate.v4Commit
    console.warn('[BrickLab Connector V4] Snap bridge failed closed.', error)
  }
}
