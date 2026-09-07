import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'

function vec(value) {
  return { x: value.x, y: value.y, z: value.z }
}

function objectById(session, instanceId) {
  return session.objects.find(object => object.userData.instanceId === instanceId) ?? null
}

function connectorFor(object, connectorId) {
  return findPart(object?.userData.partId)?.connectors?.find(connector => connector.id === connectorId) ?? null
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

const originalCreateJoint = PhysicsSession.prototype.createJoint
PhysicsSession.prototype.createJoint = function createJointWithSuspension(connection) {
  const info = suspensionInfo(this, connection)
  if (!info) return originalCreateJoint.call(this, connection)

  const memberA = this.members.get(connection.a.instanceId)
  const memberB = this.members.get(connection.b.instanceId)
  if (!memberA || !memberB) return
  if (memberA.body === memberB.body) {
    this.internalJointCount += 1
    return
  }

  const connectorA = connectorFor(memberA.object, connection.a.connectorId)
  const connectorB = connectorFor(memberB.object, connection.b.connectorId)
  if (!connectorA || !connectorB) return

  try {
    const anchorA = this.bodyLocalPoint(memberA, connectorA)
    const anchorB = this.bodyLocalPoint(memberB, connectorB)
    const axisA = this.bodyLocalAxis(memberA, connectorA)
    const params = this.RAPIER.JointData.revolute(vec(anchorA), vec(anchorB), vec(axisA))
    const joint = this.world.createImpulseJoint(params, memberA.body, memberB.body, true)
    joint.setContactsEnabled?.(false)

    const stiffness = info.suspension.stiffness ?? 7.5
    const damping = info.suspension.damping ?? 1.25
    const restAngle = info.suspension.restAngle ?? 0
    const maxAngle = info.suspension.maxAngle ?? THREE.MathUtils.degToRad(55)
    joint.configureMotorModel?.(this.RAPIER.MotorModel?.ForceBased ?? 1)
    joint.configureMotorPosition?.(restAngle, stiffness, damping)
    joint.setLimits?.(-maxAngle, maxAngle)

    this.suspensionJoints ??= []
    this.suspensionJoints.push({
      id: info.object.userData.instanceId,
      object: info.object,
      joint,
      stiffness,
      damping,
      restAngle,
      maxAngle,
      initialQuaternion: info.object.getWorldQuaternion(new THREE.Quaternion()),
      travelDegrees: 0,
    })
    this.jointCount += 1
  } catch (error) {
    this.failedJointCount += 1
    console.warn('BrickLab could not create suspension pivot', connection, error)
  }
}

const originalMountTelemetry = PhysicsSession.prototype.mountTelemetry
PhysicsSession.prototype.mountTelemetry = function mountTelemetryWithSuspension(...args) {
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
  return result
}
