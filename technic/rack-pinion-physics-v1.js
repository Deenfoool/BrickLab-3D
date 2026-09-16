import * as THREE from 'three'
import { PHYSICS_UNITS } from '../physical-parts.js'
import { findPart } from '../parts.js'
import { detectRackPinionMeshesV1 } from './rack-pinion-detect-v1.js?v=technic-rack-pinion-physics-20260916-v1'
import {
  rackPinionSurfaceSpeedV1,
  solveRackPinionContactForceV1,
  TECHNIC_RACK_PINION_PHYSICS_MATH_VERSION,
} from './rack-pinion-physics-math-v1.js?v=technic-rack-pinion-physics-20260916-v1'

export const TECHNIC_RACK_PINION_PHYSICS_VERSION = 'technic-rack-pinion-physics-v1.3.0'

const STUD = PHYSICS_UNITS.studMeters
const DEFAULT_MAX_CONTACT_TORQUE_NM = 0.060
const MAX_CONTACT_FORCE_N = 18
const MAX_CENTER_ERROR_STUD = 0.16
const MAX_WIDTH_OFFSET_STUD = 0.14
const MIN_AXIS_ALIGNMENT = 0.96
const MIN_TANGENT_ALIGNMENT = 0.92
const MIN_GUIDE_ALIGNMENT = 0.96
const CORRECTION_FRACTION = 0.92
const EPS = 1e-10
const INSTANCE_HOOK = Symbol.for('bricklab.technic.rackPinionPhysics.instanceHook.v1')

const vec = value => ({ x:value.x, y:value.y, z:value.z })

function bodyRotation(body) {
  const q = body.rotation()
  return new THREE.Quaternion(q.x, q.y, q.z, q.w)
}

function bodyPosition(body) {
  const p = body.translation()
  return new THREE.Vector3(p.x, p.y, p.z)
}

function worldPoint(body, localPointMeters) {
  return localPointMeters.clone().applyQuaternion(bodyRotation(body)).add(bodyPosition(body))
}

function worldDirection(body, localDirection) {
  return localDirection.clone().applyQuaternion(bodyRotation(body)).normalize()
}

function bodyLocalPointFromWorldStud(member, worldPointStud) {
  return worldPointStud.clone()
    .applyMatrix4(member.component.bodyWorldInverse)
    .multiplyScalar(STUD)
}

function bodyLocalDirectionFromWorld(member, worldDirectionStud) {
  return worldDirectionStud.clone()
    .applyQuaternion(member.component.bodyWorldRotation.clone().invert())
    .normalize()
}

function bodyVelocityAtPoint(body, point) {
  const direct = body.velocityAtPoint?.(vec(point))
  if (direct) return new THREE.Vector3(direct.x, direct.y, direct.z)

  const linearRaw = body.linvel()
  const angularRaw = body.angvel()
  const comRaw = body.worldCom?.() ?? body.translation()
  const linear = new THREE.Vector3(linearRaw.x, linearRaw.y, linearRaw.z)
  const angular = new THREE.Vector3(angularRaw.x, angularRaw.y, angularRaw.z)
  const lever = point.clone().sub(new THREE.Vector3(comRaw.x, comRaw.y, comRaw.z))
  return linear.add(angular.cross(lever))
}

function inverseInertiaQuadratic(body, worldVector) {
  if (!body?.isDynamic?.() || worldVector.lengthSq() < EPS) return 0
  const principalFrame = body.principalInertiaLocalFrame?.()
  const inverse = body.invPrincipalInertia?.()
  if (!principalFrame || !inverse) return 0

  const frame = bodyRotation(body).multiply(new THREE.Quaternion(
    principalFrame.x,
    principalFrame.y,
    principalFrame.z,
    principalFrame.w,
  ))
  const local = worldVector.clone().applyQuaternion(frame.invert())
  return local.x * local.x * inverse.x + local.y * local.y * inverse.y + local.z * local.z * inverse.z
}

function effectiveInverseMassAtPoint(body, point, direction) {
  if (!body?.isDynamic?.()) return 0
  const inverseMass = Math.max(0, Number(body.invMass?.()) || 0)
  const comRaw = body.worldCom?.() ?? body.translation()
  const com = new THREE.Vector3(comRaw.x, comRaw.y, comRaw.z)
  const lever = point.clone().sub(com)
  const angularJacobian = lever.cross(direction.clone())
  return Math.max(0, inverseMass + inverseInertiaQuadratic(body, angularJacobian))
}

function memberSide(record, instanceId) {
  if (record?.memberA?.object?.userData?.instanceId === instanceId) return 'a'
  if (record?.memberB?.object?.userData?.instanceId === instanceId) return 'b'
  return null
}

function guideFromLegacyPrismatic(session, rackInstanceId) {
  for (const record of session.prismaticJoints ?? []) {
    const side = memberSide(record, rackInstanceId)
    if (!side) continue
    const rackMember = side === 'a' ? record.memberA : record.memberB
    const guideMember = side === 'a' ? record.memberB : record.memberA
    if (!rackMember || !guideMember || rackMember.body === guideMember.body) continue
    return { source:'legacy-prismatic', record, joint:record.joint, rackMember, guideMember, monitor:null }
  }
  return null
}

function guideFromConnectorV4(session, rackInstanceId) {
  for (const monitor of session.connectorV4Physics?.monitors ?? []) {
    if (monitor?.released || monitor?.internal || monitor?.item?.rule?.kind !== 'prismatic') continue
    const side = memberSide(monitor, rackInstanceId)
    if (!side) continue
    const rackMember = side === 'a' ? monitor.memberA : monitor.memberB
    const guideMember = side === 'a' ? monitor.memberB : monitor.memberA
    if (!rackMember || !guideMember || rackMember.body === guideMember.body) continue
    return { source:'connector-v4-prismatic', record:null, joint:monitor.joint, rackMember, guideMember, monitor }
  }
  return null
}

function rackGuide(session, rackInstanceId) {
  return guideFromLegacyPrismatic(session, rackInstanceId)
    ?? guideFromConnectorV4(session, rackInstanceId)
}

function guideAxisWorld(guide) {
  const localAxis = guide?.source === 'legacy-prismatic'
    ? guide.record?.axisA
    : guide?.monitor?.localAxisA
  const memberA = guide?.source === 'legacy-prismatic'
    ? guide.record?.memberA
    : guide?.monitor?.memberA
  if (!localAxis?.clone || !memberA?.body) return null
  return worldDirection(memberA.body, localAxis)
}

function maxRackTravelStud(mesh) {
  const definition = findPart(mesh?.rackPartId)
  const rack = Number(definition?.mechanics?.rackGear?.maxTravelStud)
  if (rack > 0) return rack
  const steering = Number(definition?.mechanics?.steeringRack?.maxTravelStud)
  return steering > 0 ? steering : null
}

function configureLegacyTravelLimit(guide, mesh) {
  if (guide?.source !== 'legacy-prismatic') return
  const maxTravel = maxRackTravelStud(mesh)
  if (!(maxTravel > 0) || typeof guide.joint?.setLimits !== 'function') return
  const limit = maxTravel * STUD
  guide.joint.setLimits(-limit, limit)
}

function buildCoupling(session, mesh) {
  const pinionMember = session.members.get(mesh.pinionInstanceId)
  const rackMember = session.members.get(mesh.rackInstanceId)
  if (!pinionMember || !rackMember) return { skipped:'physics-member-missing' }
  if (pinionMember.body === rackMember.body) return { skipped:'same-rigid-body' }
  if (typeof pinionMember.body.addForceAtPoint !== 'function' || typeof rackMember.body.addForceAtPoint !== 'function') {
    return { skipped:'rapier-force-at-point-unavailable' }
  }

  const guide = rackGuide(session, mesh.rackInstanceId)
  if (!guide) return { skipped:'rack-not-prismatic-guided' }
  const guideAxis = guideAxisWorld(guide)
  const meshTravel = mesh.travelAxisWorld?.clone?.().normalize?.() ?? null
  const guideAlignment = guideAxis && meshTravel ? Math.abs(guideAxis.dot(meshTravel)) : 0
  if (guideAlignment < MIN_GUIDE_ALIGNMENT) return { skipped:'rack-guide-axis-mismatch' }

  if (!mesh.pinionCenterWorld?.clone || !mesh.rackPitchOriginWorld?.clone) return { skipped:'mesh-frame-incomplete' }
  if (!mesh.travelAxisWorld?.clone || !mesh.rackNormalWorld?.clone || !mesh.rackWidthAxisWorld?.clone || !mesh.pinionAxisWorld?.clone) {
    return { skipped:'mesh-axes-incomplete' }
  }

  configureLegacyTravelLimit(guide, mesh)
  const pitchRadiusM = Number(mesh.pitchRadius) * STUD
  if (!(pitchRadiusM > EPS)) return { skipped:'invalid-pitch-radius' }
  const maxForceN = Math.min(MAX_CONTACT_FORCE_N, DEFAULT_MAX_CONTACT_TORQUE_NM / pitchRadiusM)
  const contactMinM = Number.isFinite(mesh.rackContactMinStud) ? mesh.rackContactMinStud * STUD : null
  const contactMaxM = Number.isFinite(mesh.rackContactMaxStud) ? mesh.rackContactMaxStud * STUD : null

  return {
    coupling:Object.seal({
      id:mesh.id,
      mesh,
      pinionMember,
      rackMember,
      guide,
      guideAlignment,
      localPinionCenter:bodyLocalPointFromWorldStud(pinionMember, mesh.pinionCenterWorld),
      localPinionAxis:bodyLocalDirectionFromWorld(pinionMember, mesh.pinionAxisWorld),
      localRackPitchOrigin:bodyLocalPointFromWorldStud(rackMember, mesh.rackPitchOriginWorld),
      localRackTravel:bodyLocalDirectionFromWorld(rackMember, mesh.travelAxisWorld),
      localRackNormal:bodyLocalDirectionFromWorld(rackMember, mesh.rackNormalWorld),
      localRackWidth:bodyLocalDirectionFromWorld(rackMember, mesh.rackWidthAxisWorld),
      pitchRadiusM,
      contactMinM,
      contactMaxM,
      maxForceN,
      maxTravelStud:maxRackTravelStud(mesh),
      engaged:true,
      lastReason:'ready',
      centerErrorStud:0,
      widthOffsetStud:0,
      alongStud:0,
      axisAlignment:1,
      tangentAlignment:1,
      relativeSpeedMps:0,
      surfaceSpeedMps:0,
      transferForceN:0,
      requestedForceN:0,
      predictedSlipMps:0,
      limited:false,
    }),
  }
}

function geometry(coupling) {
  const pinionBody = coupling.pinionMember.body
  const rackBody = coupling.rackMember.body
  const pinionCenter = worldPoint(pinionBody, coupling.localPinionCenter)
  const pinionAxis = worldDirection(pinionBody, coupling.localPinionAxis)
  const rackOrigin = worldPoint(rackBody, coupling.localRackPitchOrigin)
  const travel = worldDirection(rackBody, coupling.localRackTravel)
  const normal = worldDirection(rackBody, coupling.localRackNormal)
  const width = worldDirection(rackBody, coupling.localRackWidth)

  const delta = pinionCenter.clone().sub(rackOrigin)
  const along = delta.dot(travel)
  const pitchPoint = rackOrigin.clone().addScaledVector(travel, along)
  const side = Math.sign(delta.dot(normal)) || 1
  const desiredCenter = pitchPoint.clone().addScaledVector(normal, side * coupling.pitchRadiusM)
  const centerErrorStud = pinionCenter.distanceTo(desiredCenter) / STUD
  const widthOffsetStud = Math.abs(delta.dot(width)) / STUD
  const axisAlignment = Math.abs(pinionAxis.dot(width))
  const withinRack = (coupling.contactMinM == null || along >= coupling.contactMinM - EPS)
    && (coupling.contactMaxM == null || along <= coupling.contactMaxM + EPS)

  const radial = pitchPoint.clone().sub(pinionCenter)
  let tangentAlignment = 0
  let surfaceTangent = null
  if (radial.lengthSq() > EPS) {
    radial.normalize()
    surfaceTangent = pinionAxis.clone().cross(radial)
    if (surfaceTangent.lengthSq() > EPS) {
      surfaceTangent.normalize()
      tangentAlignment = Math.abs(surfaceTangent.dot(travel))
    }
  }

  const contactGeometryValid = centerErrorStud <= MAX_CENTER_ERROR_STUD
    && widthOffsetStud <= MAX_WIDTH_OFFSET_STUD
    && axisAlignment >= MIN_AXIS_ALIGNMENT
    && tangentAlignment >= MIN_TANGENT_ALIGNMENT
  const valid = contactGeometryValid && withinRack
  const reason = !withinRack ? 'outside-rack-teeth' : (contactGeometryValid ? 'engaged' : 'mesh-disengaged')

  return {
    valid,
    reason,
    pinionCenter,
    pinionAxis,
    pitchPoint,
    travel,
    surfaceTangent,
    centerErrorStud,
    widthOffsetStud,
    alongStud:along / STUD,
    axisAlignment,
    tangentAlignment,
  }
}

function guideAvailable(coupling) {
  if (coupling.guide.monitor?.released) return false
  if (coupling.guide.joint?.isValid?.() === false) return false
  return true
}

function applyCoupling(coupling, dt) {
  coupling.transferForceN = 0
  coupling.requestedForceN = 0
  coupling.limited = false

  const guideReady = guideAvailable(coupling)
  if (!(dt > 0) || !guideReady) {
    coupling.engaged = false
    coupling.lastReason = guideReady ? 'invalid-dt' : 'guide-released'
    return
  }

  const state = geometry(coupling)
  coupling.centerErrorStud = state.centerErrorStud
  coupling.widthOffsetStud = state.widthOffsetStud
  coupling.alongStud = state.alongStud
  coupling.axisAlignment = state.axisAlignment
  coupling.tangentAlignment = state.tangentAlignment
  if (!state.valid) {
    coupling.engaged = false
    coupling.lastReason = state.reason
    return
  }

  const pinionBody = coupling.pinionMember.body
  const rackBody = coupling.rackMember.body
  const pinionVelocity = bodyVelocityAtPoint(pinionBody, state.pitchPoint)
  const rackVelocity = bodyVelocityAtPoint(rackBody, state.pitchPoint)
  const relativeSpeed = rackVelocity.sub(pinionVelocity).dot(state.travel)
  const invPinion = effectiveInverseMassAtPoint(pinionBody, state.pitchPoint, state.travel)
  const invRack = effectiveInverseMassAtPoint(rackBody, state.pitchPoint, state.travel)
  const solved = solveRackPinionContactForceV1({
    relativeSpeedMps:relativeSpeed,
    inverseEffectiveMassPinion:invPinion,
    inverseEffectiveMassRack:invRack,
    dt,
    maxForceN:coupling.maxForceN,
    correctionFraction:CORRECTION_FRACTION,
  })

  const angularRaw = pinionBody.angvel()
  const omega = new THREE.Vector3(angularRaw.x, angularRaw.y, angularRaw.z).dot(state.pinionAxis)
  const travelSign = state.surfaceTangent ? (Math.sign(state.surfaceTangent.dot(state.travel)) || 1) : 1
  coupling.relativeSpeedMps = relativeSpeed
  coupling.surfaceSpeedMps = rackPinionSurfaceSpeedV1(
    omega,
    coupling.mesh.pitchRadius,
    STUD,
    travelSign,
  ) ?? 0
  coupling.requestedForceN = Math.abs(solved.requestedForceN)
  coupling.predictedSlipMps = solved.predictedRelativeSpeedMps
  coupling.limited = solved.limited
  coupling.engaged = true
  coupling.lastReason = 'engaged'

  if (Math.abs(solved.forceN) <= EPS) return
  const rackForce = state.travel.clone().multiplyScalar(solved.forceN)
  rackBody.addForceAtPoint(vec(rackForce), vec(state.pitchPoint), true)
  pinionBody.addForceAtPoint(vec(rackForce.clone().multiplyScalar(-1)), vec(state.pitchPoint), true)
  coupling.transferForceN = Math.abs(solved.forceN)
}

function installInstanceHooks(session) {
  if (session[INSTANCE_HOOK]) return

  const previousCoupling = typeof session.applyGearCouplingTorques === 'function'
    ? session.applyGearCouplingTorques.bind(session)
    : null
  session.applyGearCouplingTorques = function applyRackPinionAfterAuthoritativeDrivetrain(dt = 1 / (this.quality?.hz ?? 120)) {
    const result = previousCoupling?.(dt)
    for (const coupling of this.rackPinionPhysicsV1?.couplings ?? []) applyCoupling(coupling, dt)
    return result
  }

  const previousVehicleControls = typeof session.updateVehicleControlsV1 === 'function'
    ? session.updateVehicleControlsV1.bind(session)
    : null
  session.updateVehicleControlsV1 = function updateRackPinionServoIsolation(dt) {
    const result = previousVehicleControls?.(dt)
    const driven = this.rackPinionPhysicsV1?.drivenRackIds
    if (!driven?.size) return result
    for (const rack of this.steeringRacksV1 ?? []) {
      if (!driven.has(rack.id)) continue
      rack.rackPinionDriven = true
      rack.driveMode = 'rack-pinion'
      rack.joint?.configureMotorPosition?.(0, 0, 0)
    }
    return result
  }

  Object.defineProperty(session, INSTANCE_HOOK, {
    value:true,
    enumerable:false,
    configurable:false,
    writable:false,
  })
}

function stateSnapshot(state) {
  return Object.freeze({
    version:TECHNIC_RACK_PINION_PHYSICS_VERSION,
    mathVersion:TECHNIC_RACK_PINION_PHYSICS_MATH_VERSION,
    installed:Boolean(state),
    active:state?.couplings?.length ?? 0,
    skipped:Object.freeze([...(state?.skipped ?? [])]),
    couplings:Object.freeze((state?.couplings ?? []).map(item => Object.freeze({
      id:item.id,
      pinionInstanceId:item.mesh.pinionInstanceId,
      rackInstanceId:item.mesh.rackInstanceId,
      guideSource:item.guide.source,
      guideAlignment:item.guideAlignment,
      engaged:item.engaged,
      reason:item.lastReason,
      centerErrorStud:item.centerErrorStud,
      widthOffsetStud:item.widthOffsetStud,
      alongStud:item.alongStud,
      relativeSpeedMps:item.relativeSpeedMps,
      transferForceN:item.transferForceN,
      limited:item.limited,
    }))),
  })
}

export function installRackPinionPhysicsV1(session, { force = false } = {}) {
  if (!session?.world || !session?.members) return null
  if (session.rackPinionPhysicsV1 && !force) return session.rackPinionPhysicsV1

  installInstanceHooks(session)

  const couplings = []
  const skipped = []
  let meshes = []
  try {
    meshes = detectRackPinionMeshesV1(session.objects ?? [], {
      toleranceStud:0.08,
      widthTolerance:0.10,
      minAxisAlignment:0.985,
    })
  } catch (error) {
    skipped.push(Object.freeze({ id:null, reason:`detection-error:${error?.message || error}` }))
  }

  for (const mesh of meshes) {
    try {
      const built = buildCoupling(session, mesh)
      if (built.coupling) couplings.push(built.coupling)
      else skipped.push(Object.freeze({ id:mesh.id, reason:built.skipped ?? 'unknown' }))
    } catch (error) {
      skipped.push(Object.freeze({ id:mesh?.id ?? null, reason:`coupling-error:${error?.message || error}` }))
    }
  }

  const drivenRackIds = new Set(couplings.map(item => item.mesh.rackInstanceId))
  for (const rack of session.steeringRacksV1 ?? []) {
    rack.rackPinionDriven = drivenRackIds.has(rack.id)
    rack.driveMode = rack.rackPinionDriven ? 'rack-pinion' : 'steering-servo'
  }

  session.rackPinionPhysicsV1 = {
    version:TECHNIC_RACK_PINION_PHYSICS_VERSION,
    mathVersion:TECHNIC_RACK_PINION_PHYSICS_MATH_VERSION,
    couplings,
    skipped,
    drivenRackIds,
  }

  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent('bricklab:rackpinionphysicsready', {
      detail:{
        version:TECHNIC_RACK_PINION_PHYSICS_VERSION,
        active:couplings.length,
        skipped:skipped.length,
      },
    }))
  }
  return session.rackPinionPhysicsV1
}

globalThis.BrickLabRackPinionPhysicsV1 = Object.freeze({
  version:TECHNIC_RACK_PINION_PHYSICS_VERSION,
  mathVersion:TECHNIC_RACK_PINION_PHYSICS_MATH_VERSION,
  install:installRackPinionPhysicsV1,
  state() {
    return stateSnapshot(globalThis.__bricklabPhysicsSession?.rackPinionPhysicsV1 ?? null)
  },
})
