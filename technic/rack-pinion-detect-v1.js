import { findRackPinionSnapCandidateV1 } from './rack-pinion-v1.js'

export const TECHNIC_RACK_PINION_DETECT_VERSION = 'technic-rack-pinion-detect-v1.1.0'

export function detectRackPinionMeshesV1(objects = [], options = {}) {
  const tolerance = Number(options.toleranceStud ?? 0.08)
  const result = []
  const seen = new Set()

  for (const object of objects ?? []) {
    const candidate = findRackPinionSnapCandidateV1(object, objects, {
      captureDistance:tolerance,
      widthTolerance:options.widthTolerance ?? 0.10,
      minAxisAlignment:options.minAxisAlignment ?? 0.985,
    })
    if (!candidate || candidate.movingKind !== 'pinion') continue
    const pinionId = candidate.pinion?.object?.userData?.instanceId
    const rackId = candidate.rack?.object?.userData?.instanceId
    if (!pinionId || !rackId) continue
    const key = `${pinionId}|${rackId}`
    if (seen.has(key)) continue
    seen.add(key)

    const radial = candidate.geometry.pitchPoint.clone().sub(candidate.geometry.desiredCenter)
    if (radial.lengthSq() < 1e-10) continue
    radial.normalize()
    const tangent = candidate.pinion.axis.clone().cross(radial)
    if (tangent.lengthSq() < 1e-10) continue
    tangent.normalize()
    const travelSign = Math.sign(tangent.dot(candidate.rack.travelAxis)) || 1

    result.push(Object.freeze({
      id:`rack-pinion:${pinionId}:${rackId}`,
      kind:'rack-pinion',
      pinionInstanceId:pinionId,
      rackInstanceId:rackId,
      pinionPartId:candidate.pinion.object.userData?.partId ?? null,
      rackPartId:candidate.rack.object.userData?.partId ?? null,
      teeth:candidate.pinion.teeth,
      pitchRadius:candidate.pinion.pitchRadius,
      pinionCenterWorld:candidate.pinion.center.clone(),
      rackPitchOriginWorld:candidate.rack.pitchOrigin.clone(),
      pitchPointWorld:candidate.geometry.pitchPoint.clone(),
      radialWorld:radial.clone(),
      travelAxisWorld:candidate.rack.travelAxis.clone(),
      rackNormalWorld:candidate.rack.normal.clone(),
      rackWidthAxisWorld:candidate.rack.widthAxis.clone(),
      pinionAxisWorld:candidate.pinion.axis.clone(),
      travelSign,
      centerError:candidate.geometry.centerError,
      widthOffset:candidate.geometry.widthOffset,
      moduleStud:candidate.pinion.moduleStud,
    }))
  }

  return Object.freeze(result)
}
