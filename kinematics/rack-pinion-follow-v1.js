export const KINEMATICS_RACK_PINION_FOLLOW_VERSION = 'kinematics-rack-pinion-follow-v1.0.0'

const DEG2RAD = Math.PI / 180
const DEFAULT_CONFLICT_TOLERANCE_STUD = 0.02

function shaftIdForPart(shaftIdByPart, instanceId) {
  if (!shaftIdByPart || !instanceId) return null
  if (shaftIdByPart instanceof Map) {
    const value = shaftIdByPart.get(instanceId)
    return typeof value === 'string' ? value : value?.id ?? null
  }
  const value = shaftIdByPart[instanceId]
  return typeof value === 'string' ? value : value?.id ?? null
}

export function rackTravelFromRotationV1(angleDeg, shaftRatio, pitchRadiusStud, travelSign = 1) {
  const angle = Number(angleDeg)
  const ratio = Number(shaftRatio)
  const radius = Number(pitchRadiusStud)
  const sign = Number(travelSign) || 1
  if (!Number.isFinite(angle) || !Number.isFinite(ratio) || !(radius > 0)) return null
  return angle * DEG2RAD * ratio * radius * sign
}

export function solveRackPinionFollowersV1({
  driverAngleDeg = 0,
  shaftRatios = {},
  meshes = [],
  shaftIdByPart = null,
  conflictToleranceStud = DEFAULT_CONFLICT_TOLERANCE_STUD,
} = {}) {
  const targets = new Map()
  const conflicts = []

  for (const mesh of meshes ?? []) {
    const pinionInstanceId = mesh?.pinionInstanceId
    const rackInstanceId = mesh?.rackInstanceId
    const shaftId = shaftIdForPart(shaftIdByPart, pinionInstanceId)
    if (!shaftId || !rackInstanceId) continue

    const ratio = Number(shaftRatios?.[shaftId])
    if (!Number.isFinite(ratio)) continue
    const travelStud = rackTravelFromRotationV1(driverAngleDeg, ratio, mesh.pitchRadius, mesh.travelSign)
    if (!Number.isFinite(travelStud)) continue

    const previous = targets.get(rackInstanceId)
    if (previous) {
      if (Math.abs(previous.travelStud - travelStud) > conflictToleranceStud) {
        conflicts.push(Object.freeze({
          type:'rack-pinion-conflict',
          rackInstanceId,
          firstMeshId:previous.meshId,
          secondMeshId:mesh.id ?? null,
          firstTravelStud:previous.travelStud,
          secondTravelStud:travelStud,
        }))
      }
      continue
    }

    targets.set(rackInstanceId, Object.freeze({
      rackInstanceId,
      pinionInstanceId,
      shaftId,
      meshId:mesh.id ?? null,
      travelStud,
      travelAxisWorld:mesh.travelAxisWorld ?? null,
    }))
  }

  return Object.freeze({
    version:KINEMATICS_RACK_PINION_FOLLOW_VERSION,
    targets:Object.freeze([...targets.values()]),
    conflicts:Object.freeze(conflicts),
  })
}
