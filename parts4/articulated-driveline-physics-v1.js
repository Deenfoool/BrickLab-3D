import * as THREE from 'three'
import { PhysicsSession } from '../physics.js'
import { findPart } from '../parts.js'

export const ARTICULATED_DRIVELINE_PHYSICS_VERSION = 'articulated-driveline-physics-v1'
const EPS = 1e-9

function bodyRotation(body) {
  const q = body.rotation()
  return new THREE.Quaternion(q.x, q.y, q.z, q.w)
}

function worldAxis(body, localAxis) {
  return localAxis.clone().applyQuaternion(bodyRotation(body)).normalize()
}

function angularAlong(body, axis) {
  const value = body.angvel()
  return new THREE.Vector3(value.x, value.y, value.z).dot(axis)
}

export function cardanVelocityRatio(betaRadians, inputPhaseRadians) {
  const beta = Math.max(0, Math.min(Math.PI / 2 - 1e-4, Math.abs(Number(betaRadians) || 0)))
  const phase = Number(inputPhaseRadians) || 0
  const cosBeta = Math.cos(beta)
  const sinBeta = Math.sin(beta)
  const denominator = 1 - sinBeta * sinBeta * Math.sin(phase) * Math.sin(phase)
  return denominator > EPS ? cosBeta / denominator : 1
}

function installBearingPorts(partId, kind, connectorIds) {
  const part = findPart(partId)
  const mechanics = part?.mechanics?.[kind]
  if (!mechanics) return false
  mechanics.bearingConnectorIds = [...connectorIds]
  return true
}

// Semantic drivetrain housings need physical bearings as well as mathematical
// torque coupling. These ports are consumed by joint-stability-v5 at build time,
// so the shafts stay located inside their housings instead of being free bodies.
installBearingPorts('worm-drive-8', 'transmission', ['input', 'output'])
installBearingPorts('gearbox-fnr', 'transmission', ['input', 'output'])
installBearingPorts('open-differential', 'differential', ['input', 'left', 'right'])

// PARTS-4 v1 models the reduction ratio and efficiency of the worm stage. It does
// not yet model direction-dependent backdrivability, so do not advertise a
// self-locking/holding behavior the solver does not actually implement.
const worm = findPart('worm-drive-8')
if (worm) {
  worm.description = 'Compact 90° worm reduction with an 8:1 speed reduction'
  if (worm.mechanics?.wormDrive) delete worm.mechanics.wormDrive.backdriveEfficiency
}

const originalBuildGearCouplers = PhysicsSession.prototype.buildGearCouplers
PhysicsSession.prototype.buildGearCouplers = function buildGearCouplersWithArticulationMetadata(...args) {
  const result = originalBuildGearCouplers.apply(this, args)
  const meshById = new Map((this.drivetrain?.gearMeshes ?? []).map(mesh => [mesh.id, mesh]))

  for (const coupling of this.gearCouplers ?? []) {
    const mesh = meshById.get(coupling.id)
    if (!mesh) continue
    coupling.kind = mesh.kind ?? 'gear'
    coupling.housingId = mesh.housingId ?? null
    coupling.partId = mesh.partId ?? null
    coupling.baseFactor = Number(mesh.ratioAB) || coupling.factor
    coupling.factor = coupling.baseFactor
    coupling.articulationDeg = 0
    coupling.kinematicFactor = coupling.baseFactor
    coupling.inputPhase = 0
  }
  return result
}
PhysicsSession.prototype.buildGearCouplers.__bricklabOwner = ARTICULATED_DRIVELINE_PHYSICS_VERSION

const originalApplyGearCouplingTorques = PhysicsSession.prototype.applyGearCouplingTorques
PhysicsSession.prototype.applyGearCouplingTorques = function applyArticulatedDrivelineTorques(dt = 1 / (this.quality?.hz ?? 120)) {
  for (const coupling of this.gearCouplers ?? []) {
    if (coupling.kind !== 'articulated' || !coupling.partId) continue
    const definition = findPart(coupling.partId)
    const articulated = definition?.mechanics?.articulatedCoupler
    if (!articulated) continue

    const baseFactor = Number(coupling.baseFactor) || Number(coupling.factor) || 1
    const axisA = worldAxis(coupling.bodyA, coupling.localAxisA)
    const axisB = worldAxis(coupling.bodyB, coupling.localAxisB)
    const dot = THREE.MathUtils.clamp(Math.abs(axisA.dot(axisB)), -1, 1)
    const actualBeta = Math.acos(dot)
    const maxBeta = THREE.MathUtils.degToRad(articulated.maxAngleDeg ?? 45)
    const modeledBeta = Math.min(actualBeta, maxBeta)
    const omegaA = angularAlong(coupling.bodyA, axisA)

    coupling.inputPhase = (Number(coupling.inputPhase) || 0) + omegaA * Math.max(0, Number(dt) || 0)
    if (Math.abs(coupling.inputPhase) > Math.PI * 8) coupling.inputPhase %= Math.PI * 2

    const velocityFactor = articulated.constantVelocity
      ? 1
      : cardanVelocityRatio(modeledBeta, coupling.inputPhase)

    coupling.factor = Math.sign(baseFactor || 1) * Math.abs(baseFactor) * velocityFactor
    coupling.kinematicFactor = coupling.factor
    coupling.articulationDeg = THREE.MathUtils.radToDeg(actualBeta)
    coupling.overArticulationLimit = actualBeta > maxBeta + 1e-5
  }

  return originalApplyGearCouplingTorques.call(this, dt)
}
PhysicsSession.prototype.applyGearCouplingTorques.__bricklabOwner = ARTICULATED_DRIVELINE_PHYSICS_VERSION

globalThis.BrickLabArticulatedDriveline = Object.freeze({
  version: ARTICULATED_DRIVELINE_PHYSICS_VERSION,
  cardanVelocityRatio,
  semanticBearings: ['worm-drive-8', 'gearbox-fnr', 'open-differential'],
})
