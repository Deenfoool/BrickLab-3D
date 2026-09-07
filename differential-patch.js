import * as THREE from 'three'
import { PhysicsSession } from './physics.js'

const TWO_PI = Math.PI * 2

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function vec(value) {
  return { x: value.x, y: value.y, z: value.z }
}

function bodyRotation(body) {
  const rotation = body.rotation()
  return new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
}

function bodyAngularVelocity(body) {
  const value = body.angvel()
  return new THREE.Vector3(value.x, value.y, value.z)
}

function rpm(radians) {
  return radians * 60 / TWO_PI
}

function worldAxis(body, localAxis) {
  return localAxis.clone().applyQuaternion(bodyRotation(body)).normalize()
}

function shaftOmega(coupling, side) {
  const body = side === 'a' ? coupling.bodyA : coupling.bodyB
  const axis = side === 'a' ? coupling.localAxisA : coupling.localAxisB
  return bodyAngularVelocity(body).dot(worldAxis(body, axis))
}

function applyGenericCoupler(coupling) {
  const axisA = worldAxis(coupling.bodyA, coupling.localAxisA)
  const axisB = worldAxis(coupling.bodyB, coupling.localAxisB)
  const omegaA = bodyAngularVelocity(coupling.bodyA).dot(axisA)
  const omegaB = bodyAngularVelocity(coupling.bodyB).dot(axisB)
  const desiredB = omegaA * coupling.factor
  const error = desiredB - omegaB
  const maxTorqueB = Math.max(0.4, coupling.maxTorqueB)
  const torqueB = clamp(error * 1.6, -maxTorqueB, maxTorqueB)
  const torqueA = -torqueB * coupling.factor / Math.max(coupling.efficiency, 0.1)

  coupling.bodyB.addTorque(vec(axisB.multiplyScalar(torqueB)), true)
  coupling.bodyA.addTorque(vec(axisA.multiplyScalar(clamp(torqueA, -coupling.maxTorqueA, coupling.maxTorqueA))), true)
  coupling.errorRpm = rpm(error)
  coupling.transferTorque = Math.abs(torqueB)
}

function differentialKey(coupling) {
  const match = /^differential:([^:]+):/.exec(coupling.id || '')
  return match?.[1] ?? null
}

function applyOpenDifferential(group) {
  if (group.length < 2) {
    for (const coupling of group) {
      coupling.errorRpm = 0
      coupling.transferTorque = 0
    }
    return
  }

  const left = group[0]
  const right = group[1]
  const omegaInput = shaftOmega(left, 'a')
  const normalizedLeft = shaftOmega(left, 'b') / (Math.abs(left.factor) > 0.0001 ? left.factor : 1)
  const normalizedRight = shaftOmega(right, 'b') / (Math.abs(right.factor) > 0.0001 ? right.factor : 1)
  const carrierError = omegaInput - (normalizedLeft + normalizedRight) * 0.5

  const inputLimit = Math.max(0.4, Math.min(left.maxTorqueA, right.maxTorqueA))
  const carrierTorque = clamp(carrierError * 2.2, -inputLimit, inputLimit)
  const halfTorque = carrierTorque * 0.5

  const axisInput = worldAxis(left.bodyA, left.localAxisA)
  const axisLeft = worldAxis(left.bodyB, left.localAxisB)
  const axisRight = worldAxis(right.bodyB, right.localAxisB)
  const leftTorque = clamp(halfTorque * Math.sign(left.factor || 1), -left.maxTorqueB, left.maxTorqueB)
  const rightTorque = clamp(halfTorque * Math.sign(right.factor || 1), -right.maxTorqueB, right.maxTorqueB)

  left.bodyB.addTorque(vec(axisLeft.multiplyScalar(leftTorque)), true)
  right.bodyB.addTorque(vec(axisRight.multiplyScalar(rightTorque)), true)
  left.bodyA.addTorque(vec(axisInput.multiplyScalar(-carrierTorque / Math.max(left.efficiency, 0.1))), true)

  const errorRpm = rpm(carrierError)
  left.errorRpm = errorRpm
  right.errorRpm = errorRpm
  left.transferTorque = Math.abs(leftTorque)
  right.transferTorque = Math.abs(rightTorque)

  left.diffState = right.diffState = {
    inputRpm: rpm(omegaInput),
    leftRpm: rpm(shaftOmega(left, 'b')),
    rightRpm: rpm(shaftOmega(right, 'b')),
    deltaRpm: Math.abs(rpm(shaftOmega(left, 'b') - shaftOmega(right, 'b'))),
    transferTorque: Math.abs(carrierTorque),
  }
}

PhysicsSession.prototype.applyGearCouplingTorques = function applyPowertrainCouplingTorques() {
  const differentialGroups = new Map()

  for (const coupling of this.gearCouplers) {
    const key = differentialKey(coupling)
    if (!key) {
      applyGenericCoupler(coupling)
      continue
    }
    if (!differentialGroups.has(key)) differentialGroups.set(key, [])
    differentialGroups.get(key).push(coupling)
  }

  for (const group of differentialGroups.values()) applyOpenDifferential(group)
}

const previousMountTelemetry = PhysicsSession.prototype.mountTelemetry
PhysicsSession.prototype.mountTelemetry = function mountDifferentialTelemetry(...args) {
  const result = previousMountTelemetry.apply(this, args)
  const groups = new Map()
  for (const coupling of this.gearCouplers ?? []) {
    const key = differentialKey(coupling)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(coupling)
  }
  if (!groups.size) return result

  const panel = document.getElementById('drivetrainTelemetry')
  if (!panel || panel.querySelector('[data-differential-section]')) return result
  const section = document.createElement('div')
  section.className = 'telemetry-section differential-telemetry'
  section.dataset.differentialSection = 'true'
  section.innerHTML = `
    <label>OPEN DIFFERENTIAL · LEFT · RIGHT · ΔRPM</label>
    ${[...groups.entries()].map(([id], index) => `
      <div class="differential-row" data-differential-id="${id}">
        <span>Diff ${index + 1}</span>
        <b data-diff-left>0</b>
        <b data-diff-right>0</b>
        <small data-diff-delta>0</small>
      </div>
    `).join('')}
  `
  const wheelSection = [...panel.querySelectorAll('.telemetry-section')]
    .find(item => item.querySelector('label')?.textContent?.startsWith('WHEELS'))
  if (wheelSection) panel.insertBefore(section, wheelSection)
  else panel.append(section)
  return result
}

const previousUpdateTelemetry = PhysicsSession.prototype.updateTelemetryReadings
PhysicsSession.prototype.updateTelemetryReadings = function updateDifferentialTelemetry(...args) {
  const result = previousUpdateTelemetry.apply(this, args)
  const seen = new Set()
  for (const coupling of this.gearCouplers ?? []) {
    const id = differentialKey(coupling)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const state = coupling.diffState
    const row = document.querySelector(`[data-differential-id="${id}"]`)
    if (!row || !state) continue
    row.querySelector('[data-diff-left]').textContent = `${Math.round(state.leftRpm)}`
    row.querySelector('[data-diff-right]').textContent = `${Math.round(state.rightRpm)}`
    row.querySelector('[data-diff-delta]').textContent = `${Math.round(state.deltaRpm)}`
    row.classList.toggle('split-active', state.deltaRpm > 8)
  }
  return result
}
