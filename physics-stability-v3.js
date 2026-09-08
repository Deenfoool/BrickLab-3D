import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'
import { SURFACES } from './physical-parts.js'

export const PHYSICS_STABILITY_VERSION = 'physics-stability-v4'
const COUPLING_OWNER = 'inertia-aware-coupling-v3'
const TIRE_OWNER = 'passive-settling-tire-v4'
const SLEEP_OWNER = 'passive-sleep-v1'
const TAU = Math.PI * 2
const G = 9.81
const EPS = 1e-10
const ROLLING_RESISTANCE_TRANSITION = 0.0025

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0))
const vec = value => ({ x: value.x, y: value.y, z: value.z })
const rpm = omega => omega * 60 / TAU

function bodyRotation(body) {
  const q = body.rotation()
  return new THREE.Quaternion(q.x, q.y, q.z, q.w)
}

function bodyAngular(body) {
  const value = body.angvel()
  return new THREE.Vector3(value.x, value.y, value.z)
}

function bodyPosition(body) {
  const value = body.translation()
  return new THREE.Vector3(value.x, value.y, value.z)
}

function bodyAxis(body, localAxis) {
  return localAxis.clone().applyQuaternion(bodyRotation(body)).normalize()
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

function inverseInertiaAlong(body, axis) {
  const normalized = axis.clone()
  if (normalized.lengthSq() < EPS) return 0
  normalized.normalize()
  return inverseInertiaQuadratic(body, normalized)
}

function effectiveInverseMassAtPoint(body, point, direction) {
  if (!body?.isDynamic?.()) return 0
  const invMass = Number(body.invMass?.()) || 0
  const comValue = body.worldCom?.() ?? body.translation()
  const com = new THREE.Vector3(comValue.x, comValue.y, comValue.z)
  const lever = point.clone().sub(com)
  const angularJacobian = lever.cross(direction.clone())
  return Math.max(0, invMass + inverseInertiaQuadratic(body, angularJacobian))
}

function idleCoupling(coupling) {
  coupling.errorRpm = 0
  coupling.requestedTorque = 0
  coupling.transferTorque = 0
  coupling.lossTorque = 0
}

function couplingLimit(coupling, factor, efficiency) {
  const limitA = Math.max(0, Number(coupling.maxTorqueA) || 0)
  const limitB = Math.max(0, Number(coupling.maxTorqueB) || 0)
  if (Math.abs(factor) < EPS) return 0
  // bodyA receives -factor * torqueB / efficiency, so both shaft limits must hold.
  const fromA = limitA * efficiency / Math.abs(factor)
  return Math.max(0, Math.min(limitA > 0 ? fromA : 0, limitB))
}

function solveGenericCoupling(coupling, dt) {
  if (coupling.failed) return idleCoupling(coupling)
  const factor = Number(coupling.factor)
  if (!Number.isFinite(factor) || Math.abs(factor) < EPS || !(dt > 0)) return idleCoupling(coupling)

  const axisA = bodyAxis(coupling.bodyA, coupling.localAxisA)
  const axisB = bodyAxis(coupling.bodyB, coupling.localAxisB)
  const omegaA = bodyAngular(coupling.bodyA).dot(axisA)
  const omegaB = bodyAngular(coupling.bodyB).dot(axisB)
  const error = omegaA * factor - omegaB
  const efficiency = clamp(coupling.efficiency ?? 1, 0.05, 1)

  // Constraint C = factor*wA - wB. A torque lambda on B and
  // -factor*lambda/eff on A changes C by:
  // dt * lambda * (I_B^-1 + factor^2 * I_A^-1 / eff).
  // Solving from inertia prevents tiny shafts/gears from receiving enough
  // angular impulse to overshoot the requested ratio by thousands of RPM.
  const invA = inverseInertiaAlong(coupling.bodyA, axisA)
  const invB = inverseInertiaAlong(coupling.bodyB, axisB)
  const constraintInv = invB + factor * factor * invA / efficiency
  const requested = constraintInv > EPS ? error / (constraintInv * dt) : 0
  const maxTransfer = couplingLimit(coupling, factor, efficiency)
  const torqueB = clamp(requested, -maxTransfer, maxTransfer)
  const torqueA = -torqueB * factor / efficiency

  if (Number.isFinite(torqueB) && Math.abs(torqueB) > EPS) {
    coupling.bodyB.addTorque(vec(axisB.clone().multiplyScalar(torqueB)), true)
    coupling.bodyA.addTorque(vec(axisA.clone().multiplyScalar(torqueA)), true)
  }

  coupling.errorRpm = rpm(error)
  coupling.requestedTorque = Math.abs(requested)
  coupling.transferTorque = Math.abs(torqueB)
  coupling.lossTorque = Math.abs(torqueB) * (1 - efficiency)
  coupling.inertiaLimited = Math.abs(requested) > maxTransfer + 1e-12
}

const diffKey = coupling => /^differential:([^:]+):/.exec(coupling.id || '')?.[1] ?? null

function solveOpenDifferential(group, dt) {
  const active = group.filter(coupling => !coupling.failed)
  for (const coupling of group) if (coupling.failed) idleCoupling(coupling)
  if (active.length < 2) {
    for (const coupling of active) solveGenericCoupling(coupling, dt)
    return
  }

  const left = active[0]
  const right = active[1]
  const factorL = Number(left.factor) || 1
  const factorR = Number(right.factor) || 1
  if (Math.abs(factorL) < EPS || Math.abs(factorR) < EPS || !(dt > 0)) {
    active.forEach(idleCoupling)
    return
  }

  const inputAxis = bodyAxis(left.bodyA, left.localAxisA)
  const leftAxis = bodyAxis(left.bodyB, left.localAxisB)
  const rightAxis = bodyAxis(right.bodyB, right.localAxisB)
  const wi = bodyAngular(left.bodyA).dot(inputAxis)
  const wLeft = bodyAngular(left.bodyB).dot(leftAxis)
  const wRight = bodyAngular(right.bodyB).dot(rightAxis)
  const effectiveLeft = wLeft / factorL
  const effectiveRight = wRight / factorR
  const error = wi - (effectiveLeft + effectiveRight) * 0.5
  const efficiency = clamp(Math.min(left.efficiency ?? 1, right.efficiency ?? 1), 0.05, 1)

  // Differential constraint C = wi - .5*(wL/fL + wR/fR).
  // Apply -carrier/eff to the input and carrier/(2*f) to each output.
  const invIn = inverseInertiaAlong(left.bodyA, inputAxis)
  const invLeft = inverseInertiaAlong(left.bodyB, leftAxis)
  const invRight = inverseInertiaAlong(right.bodyB, rightAxis)
  const constraintInv = invIn / efficiency
    + invLeft / (4 * factorL * factorL)
    + invRight / (4 * factorR * factorR)
  const requestedCarrier = constraintInv > EPS ? error / (constraintInv * dt) : 0

  const inputLimit = Math.max(0, Math.min(Number(left.maxTorqueA) || 0, Number(right.maxTorqueA) || 0)) * efficiency
  const leftCarrierLimit = 2 * Math.abs(factorL) * Math.max(0, Number(left.maxTorqueB) || 0)
  const rightCarrierLimit = 2 * Math.abs(factorR) * Math.max(0, Number(right.maxTorqueB) || 0)
  const maxCarrier = Math.max(0, Math.min(inputLimit, leftCarrierLimit, rightCarrierLimit))
  const carrier = clamp(requestedCarrier, -maxCarrier, maxCarrier)
  const inputTorque = -carrier / efficiency
  const leftTorque = carrier / (2 * factorL)
  const rightTorque = carrier / (2 * factorR)

  if (Math.abs(carrier) > EPS) {
    left.bodyA.addTorque(vec(inputAxis.clone().multiplyScalar(inputTorque)), true)
    left.bodyB.addTorque(vec(leftAxis.clone().multiplyScalar(leftTorque)), true)
    right.bodyB.addTorque(vec(rightAxis.clone().multiplyScalar(rightTorque)), true)
  }

  const state = {
    inputRpm: rpm(wi),
    leftRpm: rpm(wLeft),
    rightRpm: rpm(wRight),
    deltaRpm: Math.abs(rpm(wLeft - wRight)),
    transferTorque: Math.abs(carrier),
  }

  for (const coupling of active) {
    const outputRequest = coupling === left
      ? requestedCarrier / (2 * factorL)
      : requestedCarrier / (2 * factorR)
    const outputTransfer = coupling === left ? leftTorque : rightTorque
    coupling.errorRpm = rpm(error)
    coupling.requestedTorque = Math.abs(outputRequest)
    coupling.transferTorque = Math.abs(outputTransfer)
    coupling.lossTorque = Math.abs(outputTransfer) * (1 - efficiency)
    coupling.inertiaLimited = Math.abs(requestedCarrier) > maxCarrier + 1e-12
    coupling.diffState = state
  }
}

PhysicsSession.prototype.applyGearCouplingTorques = function applyInertiaAwareCouplingV3(dt = 1 / (this.quality?.hz ?? 120)) {
  const groups = new Map()
  for (const coupling of this.gearCouplers ?? []) {
    const key = diffKey(coupling)
    if (!key) solveGenericCoupling(coupling, dt)
    else {
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(coupling)
    }
  }
  for (const group of groups.values()) solveOpenDifferential(group, dt)
}
PhysicsSession.prototype.applyGearCouplingTorques.__bricklabOwner = COUPLING_OWNER

// Clearing accumulated torque is bookkeeping, not an external interaction.
// Passing wakeUp=true here kept every passive chassis awake forever.
PhysicsSession.prototype.resetCustomTorques = function resetCustomTorquesPreservingSleep() {
  for (const component of this.components ?? []) component.body.resetTorques?.(false)
}
PhysicsSession.prototype.resetCustomTorques.__bricklabOwner = SLEEP_OWNER

function wheelCenter(wheel) {
  if (!wheel.member) return null
  return new THREE.Vector3(0, 1.15, 0)
    .applyMatrix4(wheel.member.relativeMatrix)
    .multiplyScalar(0.008)
    .applyQuaternion(bodyRotation(wheel.body))
    .add(bodyPosition(wheel.body))
}

function wheelLoad(session, wheel, normal) {
  const count = Math.max(1, session.wheelMonitors.length)
  const mass = session.vehicleMassKg || 0.05
  let load = mass * G / count
  const chassis = session.chassisMonitor
  if (!chassis || !wheel.object) return load

  const position = wheel.member
    ? new THREE.Vector3().setFromMatrixPosition(wheel.member.relativeMatrix).multiplyScalar(0.008)
      .applyQuaternion(bodyRotation(wheel.body)).add(bodyPosition(wheel.body)).multiplyScalar(1 / 0.008)
    : wheel.object.getWorldPosition(new THREE.Vector3())
  const front = position.z >= chassis.comStud.z
  const right = position.x >= chassis.comStud.x
  const transfer = clamp((chassis.acceleration || 0) * chassis.comHeightM / Math.max(chassis.wheelbaseM, 0.008) / G, -0.35, 0.35)
  load *= front ? 1 - transfer : 1 + transfer
  const linear = wheel.body.linvel()
  const lateralTransfer = clamp(linear.x * 0.035 * chassis.comHeightM / Math.max(chassis.trackM, 0.008), -0.22, 0.22)
  load *= right ? 1 - lateralTransfer : 1 + lateralTransfer
  return Math.max(0.01, load * Math.max(0.35, normal.dot(new THREE.Vector3(0, 1, 0))))
}

function impulseLimitedForce(rawForce, relativeSpeed, invEffectiveMass, dt) {
  if (!(dt > 0) || !(invEffectiveMass > EPS)) return 0
  const correctiveForce = Math.abs(relativeSpeed) / (invEffectiveMass * dt)
  return clamp(rawForce, -correctiveForce, correctiveForce)
}

PhysicsSession.prototype.applyTireForcesV2 = function applyPassiveSettlingTireForcesV4(dt = 1 / (this.quality?.hz ?? 120)) {
  const surface = SURFACES[this.scenarioData?.surface ?? 'concrete'] ?? SURFACES.concrete
  this.debugContacts = []

  for (const wheel of this.wheelMonitors ?? []) {
    const center = wheelCenter(wheel)
    if (!center) continue
    const hit = this.world.castRayAndGetNormal(
      new this.RAPIER.Ray(vec(center), { x: 0, y: -1, z: 0 }),
      wheel.radius * 1.35,
      true,
      undefined,
      undefined,
      undefined,
      wheel.body,
    )
    wheel.contact = Boolean(hit)
    if (!hit) {
      wheel.normalLoadN = 0
      wheel.longitudinalForceN = 0
      wheel.lateralForceN = 0
      wheel.rollingResistanceN = 0
      continue
    }

    const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).normalize()
    const point = center.clone().addScaledVector(new THREE.Vector3(0, -1, 0), hit.timeOfImpact)
    const axis = bodyAxis(wheel.body, wheel.localAxis)
    let rolling = axis.clone().cross(normal)
    if (rolling.lengthSq() < 1e-8) rolling.set(0, 0, 1)
    rolling.normalize()
    const lateral = normal.clone().cross(rolling).normalize()

    // Center velocity and omega*r are distinct terms. Contact-point velocity is
    // used only for the actual no-slip error, so pure rolling produces zero drive.
    const centerVelocityRaw = wheel.body.velocityAtPoint?.(vec(center)) ?? wheel.body.linvel()
    const centerVelocity = new THREE.Vector3(centerVelocityRaw.x, centerVelocityRaw.y, centerVelocityRaw.z)
    const contactVelocityRaw = wheel.body.velocityAtPoint?.(vec(point)) ?? wheel.body.linvel()
    const contactVelocity = new THREE.Vector3(contactVelocityRaw.x, contactVelocityRaw.y, contactVelocityRaw.z)
    const longitudinalSpeed = centerVelocity.dot(rolling)
    const lateralSpeed = centerVelocity.dot(lateral)
    const omega = bodyAngular(wheel.body).dot(axis)
    const rimSpeed = omega * wheel.radius
    const slipSpeed = -contactVelocity.dot(rolling)
    const lateralSlipSpeed = contactVelocity.dot(lateral)
    const slipRatio = slipSpeed / Math.max(Math.abs(rimSpeed), Math.abs(longitudinalSpeed), 0.08)
    const slipAngle = Math.atan2(lateralSpeed, Math.max(Math.abs(longitudinalSpeed), 0.08))

    const load = wheelLoad(this, wheel, normal)
    const tire = findPart(wheel.object?.userData.partId)?.mechanics?.wheel?.tire ?? {}
    const baseLoad = Math.max(this.vehicleMassKg, 0.01) * G / Math.max(1, this.wheelMonitors.length)
    const loadScale = Math.pow(Math.max(load / baseLoad, 0.2), (tire.loadSensitivity ?? 0.86) - 1)
    const maxLong = Math.max(0, surface.muLong * load * loadScale)
    const maxLat = Math.max(0, surface.muLat * load * loadScale)

    let longForce = Math.tanh(slipRatio * (tire.longitudinalStiffness ?? 7.2)) * maxLong
    let lateralForce = -Math.tanh(slipAngle * (tire.lateralStiffness ?? 5)) * maxLat

    // A tire force is bounded by the impulse needed to remove the current contact
    // slip in this microstep, so traction cannot overshoot through zero slip.
    const invLong = effectiveInverseMassAtPoint(wheel.body, point, rolling)
    const invLat = effectiveInverseMassAtPoint(wheel.body, point, lateral)
    longForce = impulseLimitedForce(longForce, slipSpeed, invLong, dt)
    lateralForce = impulseLimitedForce(lateralForce, lateralSlipSpeed, invLat, dt)

    const ellipse = Math.hypot(
      maxLong > EPS ? longForce / maxLong : 0,
      maxLat > EPS ? lateralForce / maxLat : 0,
    )
    if (ellipse > 1) {
      longForce /= ellipse
      lateralForce /= ellipse
    }

    // The old 0.01 m/s cutoff created a permanent coasting band: any numerical
    // settling velocity below 1 cm/s had zero rolling resistance, wheel friction
    // was intentionally tiny, and sleeping was disabled. Use smooth resistance
    // all the way to rest, apply it at the wheel center so it always removes
    // translational energy, and impulse-limit it so it cannot reverse velocity.
    const rawRollingResistance = -Math.tanh(longitudinalSpeed / ROLLING_RESISTANCE_TRANSITION)
      * surface.rollingResistance * load * (tire.rollingResistanceScale ?? 1)
    const invRolling = effectiveInverseMassAtPoint(wheel.body, center, rolling)
    const rollingResistance = impulseLimitedForce(rawRollingResistance, longitudinalSpeed, invRolling, dt)

    const contactForce = rolling.clone().multiplyScalar(longForce)
      .add(lateral.clone().multiplyScalar(lateralForce))
    const rollingDrag = rolling.clone().multiplyScalar(rollingResistance)

    // Tire forces are consequences of an already-active contact. They must not
    // wake a chassis that Rapier has legitimately put to sleep on a flat floor.
    if (contactForce.lengthSq() > EPS * EPS) wheel.body.addForceAtPoint?.(vec(contactForce), vec(point), false)
    if (rollingDrag.lengthSq() > EPS * EPS) wheel.body.addForceAtPoint?.(vec(rollingDrag), vec(center), false)

    const totalForce = contactForce.clone().add(rollingDrag)
    Object.assign(wheel, {
      normalLoadN: load,
      slipRatio,
      slipAngleDeg: THREE.MathUtils.radToDeg(slipAngle),
      longitudinalForceN: longForce,
      lateralForceN: lateralForce,
      rollingResistanceN: rollingResistance,
      groundSpeed: longitudinalSpeed,
      rimSpeed,
      contactSlipSpeed: slipSpeed,
      slipPercent: Math.min(999, Math.abs(slipRatio) * 100),
      tireImpulseLimitN: invLong > EPS && dt > 0 ? Math.abs(slipSpeed) / (invLong * dt) : 0,
    })
    this.debugContacts.push({ point, normal, force: totalForce, wheel })
  }
}
PhysicsSession.prototype.applyTireForcesV2.__bricklabOwner = TIRE_OWNER

PhysicsSession.prototype.validatePhysicsState = function validatePhysicsStateV3() {
  let peakLinearSpeed = 0
  let peakAngularRpm = 0
  for (const component of this.components ?? []) {
    const position = component.body.translation()
    const linear = component.body.linvel()
    const angular = component.body.angvel()
    const values = [position.x, position.y, position.z, linear.x, linear.y, linear.z, angular.x, angular.y, angular.z]
    if (!values.every(Number.isFinite)) {
      const error = new Error(`Physics numerical fault in component ${component.id}`)
      error.bricklabStage = 'integration'
      window.__bricklabPhysicsNumericalFault = { component: component.id, values, simulationTime: this.simulationTime }
      throw error
    }
    peakLinearSpeed = Math.max(peakLinearSpeed, Math.hypot(linear.x, linear.y, linear.z))
    peakAngularRpm = Math.max(peakAngularRpm, Math.hypot(angular.x, angular.y, angular.z) * 60 / TAU)
  }
  this.physicsStabilityMetrics ??= { peakLinearSpeed: 0, peakAngularRpm: 0 }
  this.physicsStabilityMetrics.peakLinearSpeed = Math.max(this.physicsStabilityMetrics.peakLinearSpeed, peakLinearSpeed)
  this.physicsStabilityMetrics.peakAngularRpm = Math.max(this.physicsStabilityMetrics.peakAngularRpm, peakAngularRpm)
}

window.BrickLabPhysicsStability = {
  version: PHYSICS_STABILITY_VERSION,
  couplingOwner: COUPLING_OWNER,
  tireOwner: TIRE_OWNER,
  sleepOwner: SLEEP_OWNER,
  diagnostics: () => ({
    version: PHYSICS_STABILITY_VERSION,
    session: window.__bricklabPhysicsSession?.physicsStabilityMetrics ?? null,
    numericalFault: window.__bricklabPhysicsNumericalFault ?? null,
  }),
}
