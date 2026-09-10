import * as THREE from 'three'
import * as V3 from '../snapping-v3.js'
import { suppressNextConnectionForEndpoint } from '../connections.js'

export * from '../snapping-v3.js'

export const SNAPPING_BRIDGE_VERSION_V4 = 'connector-snapping-bridge-v4.4.0'

let preferredCandidateKey = null
let preferredInstanceId = null
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

function warmNearbyConnectivity(v4,selected,objects) {
  if (!v4?.hydrateObjects || !selected) return
  const now=typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (connectivityWarmPromise || now-lastConnectivityWarmAt<180) return
  lastConnectivityWarmAt=now
  const origin=selected.getWorldPosition(new THREE.Vector3())
  const nearby=(objects??[])
    .filter(object=>object && object!==selected && isLDrawPart(object))
    .map(object=>({object,distance:origin.distanceTo(object.getWorldPosition(new THREE.Vector3()))}))
    .sort((a,b)=>a.distance-b.distance)
    .slice(0,23)
    .map(entry=>entry.object)
  const batch=[selected,...nearby]
  connectivityWarmPromise=Promise.resolve(v4.hydrateObjects(batch))
    .catch(error=>console.debug?.('[BrickLab Connector V4] Nearby connectivity warmup failed.',error))
    .finally(()=>{connectivityWarmPromise=null})
}

export function v4OwnsLegacyCandidate(selected, legacy) {
  if (!legacy || legacy.kind === 'gear-mesh') return false
  const target=legacy.targetObject
  return isLDrawPart(selected) && isLDrawPart(target)
}

export function findSnapCandidate(selected, objects, options = {}) {
  const legacy = V3.findSnapCandidate(selected, objects, options)
  if (legacy?.kind === 'gear-mesh') return legacy

  const v4 = runtime()
  const selectedIsLDraw = isLDrawPart(selected)
  const instanceId=selected?.userData?.instanceId || null
  if (instanceId !== preferredInstanceId) {
    preferredInstanceId=instanceId
    preferredCandidateKey=null
  }

  if (v4 && selectedIsLDraw) {
    warmNearbyConnectivity(v4,selected,objects)
    try {
      const candidate = v4.findActiveCandidate(selected, objects, {
        maxResults:48,
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
  return V3.orientForSnap(selected, candidate)
}

export function applySnap(selected, candidate) {
  if (candidate?.kind !== 'connector-v4-active') return V3.applySnap(selected, candidate)

  const v4 = runtime()
  const instanceId = selected?.userData?.instanceId
  const endpointId = candidate?.source?.id
  if (instanceId && endpointId) suppressNextConnectionForEndpoint(instanceId, endpointId)

  if (!v4) {
    candidate.v4Commit = { accepted:false, reason:'runtime-unavailable' }
    return
  }

  const rawCandidate = {
    ...candidate,
    source:candidate.v4RawSource ?? candidate.source,
    target:candidate.v4RawTarget ?? candidate.target,
  }
  try {
    const result = v4.commitActiveCandidate(rawCandidate)
    candidate.v4Commit = result
    globalThis.__bricklabLastConnectorV4Commit = result
    if (result?.accepted) preferredCandidateKey=null
    if (!result?.accepted) console.warn('[BrickLab Connector V4] Snap candidate failed final commit validation.', result)
  } catch (error) {
    candidate.v4Commit = { accepted:false, reason:'bridge-exception', error:String(error?.message || error) }
    globalThis.__bricklabLastConnectorV4Commit = candidate.v4Commit
    console.warn('[BrickLab Connector V4] Snap bridge failed closed.', error)
  }
}
