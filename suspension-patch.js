import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'

function objectById(session, instanceId) {
  return session.objects.find(object => object.userData.instanceId === instanceId) ?? null
}

function suspensionInfo(session, connection) {
  if (connection?.kind !== 'hinge') return null
  for (const side of ['a', 'b']) {
    const endpoint = connection[side]
    const object = objectById(session, endpoint.instanceId)
    const suspension = findPart(object?.userData.partId)?.mechanics?.suspensionArm
    if (!suspension || endpoint.connectorId !== suspension.pivotConnectorId) continue
    return { side, object, suspension }
  }
  return null
}

PhysicsSession.prototype.initializeSuspensionJointsV1 = function initializeSuspensionJointsV1() {
  if (this.__bricklabSuspensionRegistryReady) return this.suspensionJoints ?? []
  this.__bricklabSuspensionRegistryReady = true
  this.suspensionJoints = []

  for (const record of this.revoluteJoints ?? []) {
    const info = suspensionInfo(this, record.connection)
    if (!info?.object || !record.joint) continue

    const stiffness = info.suspension.stiffness ?? 7.5
    const damping = info.suspension.damping ?? 1.25
    const restAngle = info.suspension.restAngle ?? 0
    const maxAngle = info.suspension.maxAngle ?? THREE.MathUtils.degToRad(55)

    record.joint.configureMotorModel?.(this.RAPIER.MotorModel?.ForceBased ?? 1)
    record.joint.configureMotorPosition?.(restAngle, stiffness, damping)
    record.joint.setLimits?.(-maxAngle, maxAngle)

    this.suspensionJoints.push({
      id: info.object.userData.instanceId,
      object: info.object,
      joint: record.joint,
      connection: record.connection,
      stiffness,
      damping,
      restAngle,
      maxAngle,
      initialQuaternion: info.object.getWorldQuaternion(new THREE.Quaternion()),
      travelDegrees: 0,
    })
  }

  return this.suspensionJoints
}

const originalMountTelemetry = PhysicsSession.prototype.mountTelemetry
PhysicsSession.prototype.mountTelemetry = function mountTelemetryWithSuspension(...args) {
  // Joint-stability-v4 is the only revolute creator. Suspension decorates its
  // already-created joint here instead of bypassing the stable shared-anchor path.
  this.initializeSuspensionJointsV1?.()
  const result = originalMountTelemetry.apply(this, args)
  if (!this.suspensionJoints?.length) return result

  const panel = document.getElementById('drivetrainTelemetry')
  if (!panel || panel.querySelector('[data-suspension-section]')) return result
  const section = document.createElement('div')
  section.className = 'telemetry-section suspension-telemetry'
  section.dataset.suspensionSection = 'true'
  section.innerHTML = `
    <label>SUSPENSION · TRAVEL · SPRING</label>
    ${this.suspensionJoints.slice(0, 6).map((spring, index) => `
      <div class="suspension-row" data-suspension-id="${spring.id}">
        <span>Arm ${index + 1}</span>
        <b data-suspension-travel>0°</b>
        <small>${spring.stiffness.toFixed(1)} K</small>
      </div>
    `).join('')}
  `
  const wheelsSection = [...panel.querySelectorAll('.telemetry-section')]
    .find(item => item.querySelector('label')?.textContent?.startsWith('WHEELS'))
  if (wheelsSection) panel.insertBefore(section, wheelsSection)
  else panel.append(section)
  return result
}

const originalUpdateTelemetry = PhysicsSession.prototype.updateTelemetryReadings
PhysicsSession.prototype.updateTelemetryReadings = function updateTelemetryWithSuspension(...args) {
  const result = originalUpdateTelemetry.apply(this, args)
  for (const spring of this.suspensionJoints ?? []) {
    const current = spring.object.getWorldQuaternion(new THREE.Quaternion())
    const delta = spring.initialQuaternion.clone().invert().multiply(current).normalize()
    const angle = 2 * Math.acos(Math.min(1, Math.abs(delta.w)))
    spring.travelDegrees = THREE.MathUtils.radToDeg(angle)
    const row = document.querySelector(`[data-suspension-id="${spring.id}"]`)
    const travel = row?.querySelector('[data-suspension-travel]')
    if (!travel) continue
    travel.textContent = `${Math.round(spring.travelDegrees)}°`
    travel.classList.toggle('near-limit', spring.travelDegrees > THREE.MathUtils.radToDeg(spring.maxAngle) * 0.82)
  }
  return result
}

const originalDispose = PhysicsSession.prototype.dispose
PhysicsSession.prototype.dispose = function disposeWithSuspension(...args) {
  const result = originalDispose.apply(this, args)
  this.suspensionJoints = []
  this.__bricklabSuspensionRegistryReady = false
  return result
}
