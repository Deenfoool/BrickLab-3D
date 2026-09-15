import * as THREE from 'three'
import {
  analyzeDrivetrain as analyzeLegacyDrivetrain,
  currentTransmissionMode,
  isRigidAxleConnection,
  motorConnectionInfo,
} from '../drivetrain.js'
import { findPart } from '../parts.js'
import { connectorWorldAxis, connectorWorldPosition } from '../snapping.js'
import { connectorWorldFrameV4 } from '../connectors-v4/placement-solver-v4.js'
import { evaluateBevelMesh, evaluateSpurMesh } from '../parts5/gear-mesh-math-v1.js'
import { gearPitchRadius } from '../parts5/part-geometry-metrics-v1.js'
import { classifyTechnicEndpointV1 } from './interface-semantics-v1.js'
import { technicPartProfileV1 } from './part-profile-v1.js'

export const TECHNIC_DRIVETRAIN_VERSION = 'technic-drivetrain-v1.0.0'

const DEFAULT_STALL_TORQUE = 5.5
const DEFAULT_GEAR_EFFICIENCY = 0.92

function definitionFor(object) { return findPart(object?.userData?.partId) ?? null }
function legacyPort(definition, preferFemale = false) {
  const connectors = definition?.connectors ?? []
  if (preferFemale) return connectors.find(item => item.type === 'axle-hole') ?? connectors.find(item => item.type === 'axle') ?? null
  return connectors.find(item => item.type === 'axle') ?? connectors.find(item => item.type === 'axle-hole') ?? null
}
function v4Ports(definition) {
  if (definition?.connectivityV4?.status !== 'ready') return []
  return (definition.connectivityV4.connectors ?? []).map(connector => ({ connector, semantic:classifyTechnicEndpointV1(connector) }))
    .filter(item => item.semantic.kind === 'technic-axle' || item.semantic.kind === 'technic-axle-hole')
}
function v4Port(definition, preferFemale = false) {
  const ports = v4Ports(definition)
  if (preferFemale) return ports.find(item => item.semantic.kind === 'technic-axle-hole')?.connector ?? ports[0]?.connector ?? null
  return ports.find(item => item.semantic.kind === 'technic-axle')?.connector ?? ports[0]?.connector ?? null
}
function rotaryPort(definition, preferFemale = false) {
  return legacyPort(definition, preferFemale) ?? v4Port(definition, preferFemale)
}
function portFrame(object, connector) {
  if (!connector) return null
  if (connector?.frame?.positionStud && connector?.frame?.orientationBrickLab) {
    try { return connectorWorldFrameV4(object, connector) } catch { return null }
  }
  try {
    return {
      position:connectorWorldPosition(object, connector),
      axis:connectorWorldAxis(object, connector).normalize(),
    }
  } catch { return null }
}
function profileFor(object) { return technicPartProfileV1(definitionFor(object) || { id:object?.userData?.partId }) }
function v4TechnicRotary(object) {
  const definition = definitionFor(object)
  return profileFor(object).rotary && v4Ports(definition).length > 0
}
function needsEnhancedAnalysis(objects) { return (objects ?? []).some(v4TechnicRotary) }

function shaftEligible(object) {
  const definition = definitionFor(object)
  if (!definition || definition.mechanics?.motor || definition.mechanics?.transmission || definition.mechanics?.differential) return false
  if (legacyPort(definition)) return true
  return v4TechnicRotary(object)
}

function representativeAxis(object) {
  const frame = portFrame(object, rotaryPort(definitionFor(object)))
  return frame?.axis?.clone?.().normalize?.() ?? new THREE.Vector3(1, 0, 0)
}

function unionFind(ids) {
  const parent = new Map(ids.map(id => [id, id]))
  const find = id => {
    if (!parent.has(id)) return null
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)
    let cursor = id
    while (cursor !== root) {
      const next = parent.get(cursor)
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }
  const union = (a, b) => {
    const aa = find(a), bb = find(b)
    if (aa && bb && aa !== bb) parent.set(bb, aa)
  }
  return { parent, find, union }
}

function buildUnifiedShaftGraph(objects, connections) {
  const byId = new Map((objects ?? []).map(object => [object.userData?.instanceId, object]).filter(([id]) => id))
  const eligible = (objects ?? []).filter(shaftEligible)
  const uf = unionFind(eligible.map(object => object.userData.instanceId))
  for (const connection of connections ?? []) {
    if (!isRigidAxleConnection(connection, byId)) continue
    if (!uf.parent.has(connection.a?.instanceId) || !uf.parent.has(connection.b?.instanceId)) continue
    uf.union(connection.a.instanceId, connection.b.instanceId)
  }
  const grouped = new Map()
  for (const object of eligible) {
    const root = uf.find(object.userData.instanceId)
    const list = grouped.get(root) ?? []
    list.push(object)
    grouped.set(root, list)
  }
  const shafts = []
  const shaftByPart = new Map()
  let index = 1
  for (const members of grouped.values()) {
    const shaft = {
      id:`shaft-${index++}`,
      members,
      memberIds:members.map(object => object.userData.instanceId),
      axisWorld:representativeAxis(members[0]),
    }
    shafts.push(shaft)
    for (const object of members) shaftByPart.set(object.userData.instanceId, shaft)
  }
  return { shafts, shaftByPart, byId }
}

function gearInfo(object, shaftByPart) {
  const definition = definitionFor(object)
  if (!definition) return null
  const legacy = definition.mechanics?.gear ?? null
  const profile = profileFor(object)
  const profiled = ['spur-gear','bevel-gear'].includes(profile.role) && Number(profile.toothCount) > 0
  if (!legacy && !profiled) return null
  const teeth = Number(legacy?.teeth ?? profile.toothCount)
  if (!(teeth > 0)) return null
  const frame = portFrame(object, rotaryPort(definition, true))
  if (!frame) return null
  const kind = legacy?.kind ?? (profile.role === 'bevel-gear' ? 'bevel' : 'spur')
  return {
    object,
    instanceId:object.userData.instanceId,
    partId:object.userData.partId,
    kind,
    teeth,
    pitchRadius:legacy?.pitchRadius ?? profile.pitchRadiusStuds ?? gearPitchRadius(teeth),
    efficiency:legacy?.efficiency ?? DEFAULT_GEAR_EFFICIENCY,
    center:frame.position.clone(),
    axis:frame.axis.clone().normalize(),
    shaft:shaftByPart.get(object.userData.instanceId) ?? null,
    technicProfile:profile,
  }
}

function spurMesh(a, b, options = {}) {
  const geometry = evaluateSpurMesh(a, b, {
    minAlignment:options.axisTolerance ?? 0.985,
    axialTolerance:options.axialTolerance ?? 0.16,
    distanceTolerance:options.distanceTolerance ?? 0.08,
  })
  if (!geometry.valid) return null
  const directionSign = a.shaft.axisWorld.dot(b.shaft.axisWorld) >= 0 ? -1 : 1
  return {
    id:`gear:${a.instanceId}:${b.instanceId}`, kind:'gear', a, b,
    shaftA:a.shaft.id, shaftB:b.shaft.id,
    ratioAB:directionSign * (a.teeth / b.teeth),
    ratioBA:directionSign * (b.teeth / a.teeth),
    efficiency:Math.min(a.efficiency, b.efficiency), torqueShare:1,
    centerDistance:geometry.centerDistance, targetDistance:geometry.targetDistance,
    axialOffset:geometry.axialOffset, error:geometry.distanceError,
  }
}

function bevelMesh(a, b, options = {}) {
  const geometry = evaluateBevelMesh(a, b, {
    maxAxisDot:options.bevelAxisDotTolerance ?? 0.12,
    apexTolerance:options.bevelApexTolerance ?? 0.08,
  })
  if (!geometry.valid) return null
  const directionSign = -(geometry.signA * geometry.signB)
  return {
    id:`bevel:${a.instanceId}:${b.instanceId}`, kind:'bevel', a, b,
    shaftA:a.shaft.id, shaftB:b.shaft.id,
    ratioAB:directionSign * (a.teeth / b.teeth),
    ratioBA:directionSign * (b.teeth / a.teeth),
    efficiency:Math.min(a.efficiency, b.efficiency), torqueShare:1,
    centerDistance:geometry.centerDistance, targetDistance:geometry.targetDistance,
    apexError:geometry.apexError, error:geometry.apexError,
  }
}

function detectUnifiedGearMeshes(objects, shaftByPart, options = {}) {
  const gears = (objects ?? []).map(object => gearInfo(object, shaftByPart)).filter(Boolean)
  const meshes = []
  for (let i = 0; i < gears.length; i += 1) {
    for (let j = i + 1; j < gears.length; j += 1) {
      const a = gears[i], b = gears[j]
      if (!a.shaft || !b.shaft || a.shaft.id === b.shaft.id || a.kind !== b.kind) continue
      const mesh = a.kind === 'bevel' ? bevelMesh(a, b, options) : spurMesh(a, b, options)
      if (mesh) meshes.push(mesh)
    }
  }
  return meshes
}

function remapBaseShaftId(base, unifiedShaftByPart, shaftId) {
  if (!shaftId) return null
  const source = base.shafts?.find(shaft => shaft.id === shaftId)
  for (const instanceId of source?.memberIds ?? []) {
    const unified = unifiedShaftByPart.get(instanceId)
    if (unified) return unified.id
  }
  return null
}

function remapSemanticMeshes(base, unifiedShaftByPart) {
  const result = []
  for (const mesh of base.gearMeshes ?? []) {
    if (mesh.kind === 'gear' || mesh.kind === 'bevel') continue
    const aId = mesh.a?.instanceId
    const bId = mesh.b?.instanceId
    const shaftA = unifiedShaftByPart.get(aId)
    const shaftB = unifiedShaftByPart.get(bId)
    if (!shaftA || !shaftB || shaftA.id === shaftB.id) continue
    result.push({
      ...mesh,
      shaftA:shaftA.id,
      shaftB:shaftB.id,
      a:{ ...mesh.a, shaft:shaftA },
      b:{ ...mesh.b, shaft:shaftB },
    })
  }
  return result
}

function unifiedMotorSeeds(objects, connections, shaftByPart) {
  const byId = new Map((objects ?? []).map(object => [object.userData?.instanceId, object]).filter(([id]) => id))
  const motors = []
  for (const connection of connections ?? []) {
    const info = motorConnectionInfo(connection, byId)
    if (!info) continue
    const definition = definitionFor(info.motorObject)
    const motor = definition?.mechanics?.motor
    const connector = definition?.connectors?.find(item => item.id === motor?.connectorId)
    const drivenShaft = shaftByPart.get(info.drivenObject.userData.instanceId)
    if (!motor || !connector || !drivenShaft) continue
    const axisSign = connectorWorldAxis(info.motorObject, connector).normalize().dot(drivenShaft.axisWorld) >= 0 ? 1 : -1
    const nominalRpm = motor.rpm ?? 120
    motors.push({
      id:info.motorObject.userData.instanceId,
      partId:info.motorObject.userData.partId,
      object:info.motorObject,
      connectionId:connection.id,
      shaftId:drivenShaft.id,
      rpm:nominalRpm * (motor.direction ?? 1) * axisSign,
      nominalRpm,
      stallTorque:motor.stallTorque ?? DEFAULT_STALL_TORQUE,
      freeCurrent:motor.freeCurrent ?? 0.15,
      stallCurrent:motor.stallCurrent ?? 2.2,
    })
  }
  return motors
}

function propagate(shafts, gearMeshes, motors) {
  const state = new Map(shafts.map(shaft => [shaft.id, {
    shaft, rpm:null, sourceMotorId:null, sourceType:null, ratioFromMotor:null,
    torqueCapacity:null, efficiency:null, stages:0,
  }]))
  const conflicts = []
  const adjacency = new Map(shafts.map(shaft => [shaft.id, []]))
  for (const mesh of gearMeshes) {
    adjacency.get(mesh.shaftA)?.push({ to:mesh.shaftB, factor:mesh.ratioAB, efficiency:mesh.efficiency ?? 1, torqueShare:mesh.torqueShare ?? 1, mesh })
    adjacency.get(mesh.shaftB)?.push({ to:mesh.shaftA, factor:mesh.ratioBA, efficiency:mesh.efficiency ?? 1, torqueShare:mesh.torqueShare ?? 1, mesh })
  }
  const queue = []
  for (const motor of motors) {
    const target = state.get(motor.shaftId)
    if (!target) continue
    if (target.rpm == null) {
      target.rpm = motor.rpm
      target.sourceMotorId = motor.id
      target.sourceType = 'motor'
      target.ratioFromMotor = motor.nominalRpm ? motor.rpm / motor.nominalRpm : 1
      target.torqueCapacity = motor.stallTorque
      target.efficiency = 1
      queue.push(target.shaft.id)
    } else if (Math.abs(target.rpm - motor.rpm) > Math.max(1, Math.abs(motor.rpm) * 0.02)) {
      conflicts.push({ type:'motor-conflict', shaftId:target.shaft.id, expectedRpm:target.rpm, incomingRpm:motor.rpm })
    }
  }
  const visited = new Set()
  while (queue.length) {
    const shaftId = queue.shift()
    const source = state.get(shaftId)
    if (!source || source.rpm == null) continue
    for (const edge of adjacency.get(shaftId) ?? []) {
      const key = `${shaftId}->${edge.to}:${edge.mesh.id}`
      if (visited.has(key)) continue
      visited.add(key)
      const target = state.get(edge.to)
      if (!target) continue
      const expectedRpm = source.rpm * edge.factor
      const expectedTorque = source.torqueCapacity == null ? null : source.torqueCapacity / Math.max(Math.abs(edge.factor), 0.001) * edge.efficiency * edge.torqueShare
      const expectedEfficiency = (source.efficiency ?? 1) * edge.efficiency
      if (target.rpm == null) {
        target.rpm = expectedRpm
        target.sourceMotorId = source.sourceMotorId
        target.sourceType = edge.mesh.kind ?? 'gear'
        const motor = motors.find(item => item.id === source.sourceMotorId)
        target.ratioFromMotor = motor?.nominalRpm ? expectedRpm / motor.nominalRpm : null
        target.torqueCapacity = expectedTorque
        target.efficiency = expectedEfficiency
        target.stages = source.stages + 1
        queue.push(target.shaft.id)
      } else if (Math.abs(target.rpm - expectedRpm) > Math.max(1, Math.abs(expectedRpm) * 0.03)) {
        conflicts.push({
          type:`${edge.mesh.kind ?? 'gear'}-loop-conflict`, shaftId:target.shaft.id,
          expectedRpm:target.rpm, incomingRpm:expectedRpm, meshId:edge.mesh.id,
        })
      }
    }
  }
  return { state, conflicts }
}

export function analyzeTechnicAwareDrivetrain(objects, connections) {
  const base = analyzeLegacyDrivetrain(objects, connections)
  if (!needsEnhancedAnalysis(objects)) return base

  for (const object of objects ?? []) object.updateWorldMatrix?.(true, false)
  const { shafts, shaftByPart } = buildUnifiedShaftGraph(objects, connections)
  const physicalGearMeshes = detectUnifiedGearMeshes(objects, shaftByPart)
  const semanticMeshes = remapSemanticMeshes(base, shaftByPart)
  const gearMeshes = [...physicalGearMeshes, ...semanticMeshes]
  const motors = unifiedMotorSeeds(objects, connections, shaftByPart)
  const propagated = propagate(shafts, gearMeshes, motors)
  const shaftResults = shafts.map(shaft => {
    const state = propagated.state.get(shaft.id)
    return {
      id:shaft.id, memberIds:shaft.memberIds, axisWorld:shaft.axisWorld.clone(),
      rpm:state?.rpm ?? null, sourceMotorId:state?.sourceMotorId ?? null,
      sourceType:state?.sourceType ?? null, ratioFromMotor:state?.ratioFromMotor ?? null,
      torqueCapacity:state?.torqueCapacity ?? null, efficiency:state?.efficiency ?? null,
      stages:state?.stages ?? 0,
    }
  })
  const partRpm = new Map(), partTorque = new Map()
  for (const shaft of shaftResults) for (const memberId of shaft.memberIds) {
    partRpm.set(memberId, shaft.rpm)
    partTorque.set(memberId, shaft.torqueCapacity)
  }
  const transmissions = (base.transmissions ?? []).map(item => ({
    ...item,
    inputShaftId:remapBaseShaftId(base, shaftByPart, item.inputShaftId),
    outputShaftId:remapBaseShaftId(base, shaftByPart, item.outputShaftId),
  }))
  const differentials = (base.differentials ?? []).map(item => ({
    ...item,
    inputShaftId:remapBaseShaftId(base, shaftByPart, item.inputShaftId),
    leftShaftId:remapBaseShaftId(base, shaftByPart, item.leftShaftId),
    rightShaftId:remapBaseShaftId(base, shaftByPart, item.rightShaftId),
  }))
  return {
    ...base,
    technicAware:true,
    technicDrivetrainVersion:TECHNIC_DRIVETRAIN_VERSION,
    shafts:shaftResults,
    shaftByPart,
    gearMeshes,
    physicalGearMeshes,
    transmissions,
    differentials,
    motors,
    conflicts:propagated.conflicts,
    partRpm,
    partTorque,
    transmissionMode:currentTransmissionMode(),
    stats:{
      ...base.stats,
      shafts:shaftResults.length,
      drivenShafts:shaftResults.filter(shaft => shaft.rpm != null).length,
      motors:motors.length,
      gearMeshes:physicalGearMeshes.length,
      transmissions:transmissions.length,
      differentials:differentials.length,
      conflicts:propagated.conflicts.length,
      maxTorque:Math.max(0, ...shaftResults.map(shaft => shaft.torqueCapacity ?? 0)),
      technicAware:true,
    },
  }
}
