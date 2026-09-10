import * as THREE from 'three'
import * as V3 from '../snapping-v3.js'
import { suppressNextConnectionForEndpoint } from '../connections.js'

export * from '../snapping-v3.js'

export const SNAPPING_BRIDGE_VERSION_V4 = 'connector-snapping-bridge-v4.3.0'

let preferredCandidateKey = null
let preferredInstanceId = null

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

export function v4OwnsLegacyCandidate(selected, legacy) {
  if (!legacy || legacy.kind === 'gear-mesh') return false
  const target=legacy.targetObject
  // The current V4 runtime hydrates Shadow connectivity for LDraw definitions only.
  // Therefore strict fail-closed ownership is correct for LDraw↔LDraw structural
  // pairs, where both sides can be certified by the same system. A mixed
  // LDraw↔native pair must retain V3 compatibility until native definitions also
  // receive V4 connectivity; otherwise V4 would suppress a candidate it can never
  // replace.
  return isLDrawPart(selected) && isLDrawPart(target)
}

export function findSnapCandidate(selected, objects, options = {}) {
  const legacy = V3.findSnapCandidate(selected, objects, options)
  // Gear meshing is a separate mechanical-contact solver and remains authoritative.
  if (legacy?.kind === 'gear-mesh') return legacy

  const v4 = runtime()
  const selectedIsLDraw = isLDrawPart(selected)
  const instanceId=selected?.userData?.instanceId || null
  if (instanceId !== preferredInstanceId) {
    preferredInstanceId=instanceId
    preferredCandidateKey=null
  }

  if (v4 && selectedIsLDraw) {
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

  // LDraw↔LDraw structural pairs are fully V4-owned: while Shadow metadata is
  // loading/quarantined or no certified V4 candidate exists, do not create a coarse
  // V3 substitute. Mixed LDraw↔native pairs remain on V3 for compatibility.
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
  // Always suppress the legacy connection attempt for a V4 candidate. If V4 commit
  // fails, fail closed: do not let app.js create a generic V3 link from V4 metadata.
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
