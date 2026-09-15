import * as THREE from 'three'
import { detectRackPinionMeshesV1 } from '../technic/rack-pinion-detect-v1.js?v=technic-rack-pinion-20260915-v2'
import { rackTravelFromRadiansV1 } from './rack-pinion-follow-v1.js?v=kinematics-rack-pinion-20260915-v2'

export const KINEMATICS_RACK_PINION_RUNTIME_VERSION = 'kinematics-rack-pinion-runtime-v1.1.0'

const CONFLICT_TOLERANCE_STUD = 0.02
const EPS = 1e-10
let frameHandle = 0
let activeState = null
let lastConflictKey = ''

function editorObjects() {
  return globalThis.BrickLabSubsystems?.editor?.objects?.() ?? []
}

function objectMap(objects) {
  return new Map((objects ?? [])
    .map(object => [object?.userData?.instanceId, object])
    .filter(([instanceId, object]) => instanceId && object))
}

function worldMatrix(object) {
  object?.updateWorldMatrix?.(true, false)
  return object?.matrixWorld?.clone?.() ?? new THREE.Matrix4()
}

function worldQuaternion(object) {
  return object?.getWorldQuaternion?.(new THREE.Quaternion()) ?? new THREE.Quaternion()
}

function signedQuaternionDelta(previous, current, axisWorld) {
  const delta = current.clone().multiply(previous.clone().invert()).normalize()
  // q and -q represent the same orientation. Keep the shortest continuous delta so
  // a harmless quaternion sign flip can never look like a full revolution.
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w)
  const vectorLength = Math.hypot(delta.x, delta.y, delta.z)
  if (vectorLength < EPS) return 0
  const angle = 2 * Math.atan2(vectorLength, Math.max(EPS, delta.w))
  const axis = new THREE.Vector3(delta.x, delta.y, delta.z).multiplyScalar(1 / vectorLength)
  const sign = Math.sign(axis.dot(axisWorld)) || 1
  return angle * sign
}

function maxRackTravelStud(mesh) {
  const definition = globalThis.BrickLabSubsystems?.parts?.get?.(mesh?.rackPartId)
  const value = Number(definition?.mechanics?.steeringRack?.maxTravelStud)
  return value > 0 ? value : null
}

function captureState() {
  const objects = editorObjects()
  const byId = objectMap(objects)
  const meshes = detectRackPinionMeshesV1(objects)
  const meshStates = []
  const rackBaselines = new Map()

  for (const mesh of meshes) {
    const pinion = byId.get(mesh.pinionInstanceId)
    const rack = byId.get(mesh.rackInstanceId)
    if (!pinion || !rack || !mesh.pinionAxisWorld?.clone || !mesh.travelAxisWorld?.clone) continue
    if (!rackBaselines.has(mesh.rackInstanceId)) {
      rackBaselines.set(mesh.rackInstanceId, {
        object:rack,
        worldMatrix:worldMatrix(rack),
        axisWorld:mesh.travelAxisWorld.clone().normalize(),
        maxTravelStud:maxRackTravelStud(mesh),
      })
    }
    meshStates.push({
      mesh,
      pinion,
      previousQuaternion:worldQuaternion(pinion),
      angleRad:0,
    })
  }

  return { meshStates, rackBaselines }
}

function applyWorldMatrix(object, targetWorld) {
  if (!object) return
  let local = targetWorld
  if (object.parent) {
    object.parent.updateWorldMatrix?.(true, false)
    local = object.parent.matrixWorld.clone().invert().multiply(targetWorld)
  }
  local.decompose(object.position, object.quaternion, object.scale)
  object.updateMatrixWorld?.(true)
}

function publishConflict(conflicts) {
  const key = conflicts.map(item => `${item.rackInstanceId}:${item.min.toFixed(4)}:${item.max.toFixed(4)}`).join('|')
  if (!key || key === lastConflictKey) return
  lastConflictKey = key
  globalThis.dispatchEvent?.(new CustomEvent('bricklab:kinematicsrackconflict', {
    detail:{ version:KINEMATICS_RACK_PINION_RUNTIME_VERSION, conflicts },
  }))
}

function updatePinionAngles(state) {
  for (const item of state.meshStates) {
    const current = worldQuaternion(item.pinion)
    item.angleRad += signedQuaternionDelta(item.previousQuaternion, current, item.mesh.pinionAxisWorld)
    item.previousQuaternion.copy(current)
  }
}

function rackTargets(state) {
  const values = new Map()
  for (const item of state.meshStates) {
    const mesh = item.mesh
    const travel = rackTravelFromRadiansV1(item.angleRad, 1, mesh.pitchRadius, mesh.travelSign)
    if (!Number.isFinite(travel)) continue
    const list = values.get(mesh.rackInstanceId) ?? []
    list.push(travel)
    values.set(mesh.rackInstanceId, list)
  }
  return values
}

function applyRackTargets(state) {
  const conflicts = []
  for (const [rackInstanceId, values] of rackTargets(state)) {
    if (!values.length) continue
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (max - min > CONFLICT_TOLERANCE_STUD) {
      conflicts.push({ rackInstanceId, min, max })
      continue
    }

    const baseline = state.rackBaselines.get(rackInstanceId)
    if (!baseline) continue
    let travelStud = values.reduce((sum, value) => sum + value, 0) / values.length
    if (baseline.maxTravelStud) {
      travelStud = Math.max(-baseline.maxTravelStud, Math.min(baseline.maxTravelStud, travelStud))
    }
    const axis = baseline.axisWorld
    const translation = new THREE.Matrix4().makeTranslation(
      axis.x * travelStud,
      axis.y * travelStud,
      axis.z * travelStud,
    )
    applyWorldMatrix(baseline.object, translation.multiply(baseline.worldMatrix.clone()))
  }
  if (conflicts.length) publishConflict(conflicts)
  else lastConflictKey = ''
}

function tick() {
  frameHandle = 0
  if (!activeState || globalThis.BrickLabKinematics?.active?.() !== true) return
  updatePinionAngles(activeState)
  applyRackTargets(activeState)
  frameHandle = requestAnimationFrame(tick)
}

function start() {
  stop()
  const state = captureState()
  if (!state.meshStates.length) return
  activeState = state
  frameHandle = requestAnimationFrame(tick)
  globalThis.dispatchEvent?.(new CustomEvent('bricklab:kinematicsrackready', {
    detail:{
      version:KINEMATICS_RACK_PINION_RUNTIME_VERSION,
      meshes:state.meshStates.length,
      racks:state.rackBaselines.size,
    },
  }))
}

function stop() {
  if (frameHandle) cancelAnimationFrame(frameHandle)
  frameHandle = 0
  activeState = null
  lastConflictKey = ''
}

globalThis.addEventListener?.('bricklab:kinematicsenter', start)
globalThis.addEventListener?.('bricklab:kinematicsexit', stop)

globalThis.BrickLabKinematicsRackPinion = Object.freeze({
  version:KINEMATICS_RACK_PINION_RUNTIME_VERSION,
  active:() => Boolean(activeState),
  state:() => Object.freeze({
    active:Boolean(activeState),
    meshes:activeState?.meshStates.length ?? 0,
    racks:activeState?.rackBaselines.size ?? 0,
  }),
  rescan:start,
  stop,
})
