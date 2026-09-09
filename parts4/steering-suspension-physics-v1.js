import * as THREE from 'three'
import { PhysicsSession } from '../physics.js'
import { findPart } from '../parts.js'
import { connectorWorldAxis } from '../snapping-v3.js'

export const STEERING_SUSPENSION_PHYSICS_VERSION = 'steering-suspension-physics-v1'
const STUD = globalThis.BrickLabPhysicsUnits?.studMeters ?? 0.008

function bodyRotation(body) {
  const q = body.rotation()
  return new THREE.Quaternion(q.x, q.y, q.z, q.w)
}

function objectById(session, instanceId) {
  return (session.objects ?? []).find(object => object.userData?.instanceId === instanceId) ?? null
}

function definitionForMember(member) {
  return findPart(member?.object?.userData?.partId)
}

function movingCoordinateSign(record, movingMember, connectorId) {
  if (!record?.axisA || !record?.memberA?.body || !movingMember?.object) return 1
  const definition = definitionForMember(movingMember)
  const connector = definition?.connectors?.find(item => item.id === connectorId)
  if (!connector) return movingMember === record.memberA ? -1 : 1

  const jointAxisWorld = record.axisA.clone().applyQuaternion(bodyRotation(record.memberA.body)).normalize()
  const movingAxisWorld = connectorWorldAxis(movingMember.object, connector).normalize()
  const alignment = Math.sign(jointAxisWorld.dot(movingAxisWorld)) || 1
  return (movingMember === record.memberA ? -1 : 1) * alignment
}

function otherEndpoint(connection, instanceId) {
  if (connection?.a?.instanceId === instanceId) return connection.b
  if (connection?.b?.instanceId === instanceId) return connection.a
  return null
}

function linkedRackKnuckles(session, rackId) {
  const tieRods = new Set()
  for (const connection of session.connections ?? []) {
    const other = otherEndpoint(connection, rackId)
    if (!other) continue
    const otherObject = objectById(session, other.instanceId)
    if (otherObject?.userData?.partId === 'steering-tie-rod-5') tieRods.add(other.instanceId)
  }

  const knuckles = new Set()
  for (const tieRodId of tieRods) {
    for (const connection of session.connections ?? []) {
      const other = otherEndpoint(connection, tieRodId)
      if (!other || other.instanceId === rackId) continue
      const otherObject = objectById(session, other.instanceId)
      if (otherObject?.userData?.partId !== 'steering-knuckle') continue
      if (other.connectorId !== 'steering-arm') continue
      knuckles.add(other.instanceId)
    }
  }
  return { tieRods, knuckles }
}

function rackRecord(session, record) {
  for (const member of [record.memberA, record.memberB]) {
    const definition = definitionForMember(member)
    const mechanics = definition?.mechanics?.steeringRack
    if (!mechanics) continue
    const linkage = linkedRackKnuckles(session, member.object.userData.instanceId)
    const coordinateSign = movingCoordinateSign(record, member, mechanics.sliderConnectorId ?? 'slider')
    return {
      id: member.object.userData.instanceId,
      object: member.object,
      member,
      joint: record.joint,
      record,
      mechanics,
      coordinateSign,
      tieRodIds: linkage.tieRods,
      linkedKnuckleIds: linkage.knuckles,
      targetTravelStud: 0,
    }
  }
  return null
}

function shockRecord(record) {
  let body = null
  let rod = null
  for (const member of [record.memberA, record.memberB]) {
    const definition = definitionForMember(member)
    if (definition?.mechanics?.shockBody) body = { member, mechanics: definition.mechanics.shockBody }
    if (definition?.mechanics?.shockRod) rod = { member, mechanics: definition.mechanics.shockRod }
  }
  if (!body || !rod) return null

  const coordinateSign = movingCoordinateSign(record, rod.member, rod.mechanics.sliderConnectorId ?? 'slider')
  return {
    id: `${body.member.object.userData.instanceId}:${rod.member.object.userData.instanceId}`,
    body: body.member.object,
    rod: rod.member.object,
    joint: record.joint,
    record,
    mechanics: body.mechanics,
    coordinateSign,
  }
}

PhysicsSession.prototype.initializeParts4LinearMechanisms = function initializeParts4LinearMechanisms() {
  this.steeringRacksV1 = []
  this.shockAbsorbersV1 = []

  for (const record of this.prismaticJoints ?? []) {
    const rack = rackRecord(this, record)
    if (rack) {
      const maxTravelStud = Math.max(0.05, Number(rack.mechanics.maxTravelStud) || 1)
      const limit = maxTravelStud * STUD
      record.joint.setLimits?.(-limit, limit)
      record.joint.configureMotorModel?.(this.RAPIER.MotorModel?.ForceBased ?? 1)
      record.joint.configureMotorPosition?.(
        0,
        rack.mechanics.stiffness ?? 4,
        rack.mechanics.damping ?? 0.42,
      )
      rack.maxTravelStud = maxTravelStud
      rack.fullyLinked = rack.linkedKnuckleIds.size >= Math.min(2, Math.max(1, this.vehicleControlV1?.frontWheelCount ?? 2))
      this.steeringRacksV1.push(rack)
      continue
    }

    const shock = shockRecord(record)
    if (shock) {
      const sign = shock.coordinateSign
      const rawMin = (Number(shock.mechanics.minTravelStud) || -1.25) * STUD * sign
      const rawMax = (Number(shock.mechanics.maxTravelStud) || 0.25) * STUD * sign
      record.joint.setLimits?.(Math.min(rawMin, rawMax), Math.max(rawMin, rawMax))
      record.joint.configureMotorModel?.(this.RAPIER.MotorModel?.ForceBased ?? 1)
      record.joint.configureMotorPosition?.(
        (Number(shock.mechanics.restTravelStud) || 0) * STUD * sign,
        shock.mechanics.springStiffness ?? 3.2,
        shock.mechanics.damping ?? 0.38,
      )
      this.shockAbsorbersV1.push(shock)
    }
  }

  const rack = this.steeringRacksV1[0] ?? null
  if (rack && this.vehicleControlV1) {
    this.vehicleControlV1.steeringMode = rack.fullyLinked ? 'rack' : 'rack-mixed'
  }

  globalThis.__bricklabParts4LinearMechanisms = {
    steeringRacks: this.steeringRacksV1.map(item => ({
      id: item.id,
      linkedKnuckles: item.linkedKnuckleIds.size,
      fullyLinked: item.fullyLinked,
      maxTravelStud: item.maxTravelStud,
    })),
    shocks: this.shockAbsorbersV1.map(item => ({ id: item.id })),
  }
  return { steeringRacks: this.steeringRacksV1, shocks: this.shockAbsorbersV1 }
}

const previousBuildChassisMonitor = PhysicsSession.prototype.buildChassisMonitor
PhysicsSession.prototype.buildChassisMonitor = function buildChassisWithParts4LinearMechanisms(...args) {
  const result = previousBuildChassisMonitor.apply(this, args)
  this.initializeParts4LinearMechanisms()
  return result
}
PhysicsSession.prototype.buildChassisMonitor.__bricklabOwner = STEERING_SUSPENSION_PHYSICS_VERSION

const previousUpdateVehicleControls = PhysicsSession.prototype.updateVehicleControlsV1
PhysicsSession.prototype.updateVehicleControlsV1 = function updateVehicleControlsWithRack(dt) {
  const result = previousUpdateVehicleControls.apply(this, [dt])
  const input = Number(this.vehicleControlV1?.steeringInput) || 0

  for (const rack of this.steeringRacksV1 ?? []) {
    const targetStud = input * rack.maxTravelStud
    rack.targetTravelStud = targetStud
    rack.joint.configureMotorPosition?.(
      targetStud * STUD * rack.coordinateSign,
      rack.mechanics.stiffness ?? 4,
      rack.mechanics.damping ?? 0.42,
    )

    // Linked knuckles are steered by rack geometry and tie rods. Disable only their
    // direct angle servos; incomplete linkages retain the existing physical fallback.
    for (const steering of this.steeringJointsV1 ?? []) {
      if (!rack.linkedKnuckleIds.has(steering.id)) continue
      steering.joint.configureMotorPosition?.(0, 0, 0)
    }
  }

  if (this.vehicleControlV1 && this.steeringRacksV1?.length) {
    const fullyLinked = this.steeringRacksV1.some(rack => rack.fullyLinked)
    this.vehicleControlV1.steeringMode = fullyLinked ? 'rack' : 'rack-mixed'
  }
  return result
}
PhysicsSession.prototype.updateVehicleControlsV1.__bricklabOwner = STEERING_SUSPENSION_PHYSICS_VERSION

globalThis.BrickLabParts4LinearMechanisms = Object.freeze({
  version: STEERING_SUSPENSION_PHYSICS_VERSION,
  getState() {
    const session = globalThis.__bricklabPhysicsSession
    return {
      steeringRacks: (session?.steeringRacksV1 ?? []).map(item => ({
        id: item.id,
        targetTravelStud: item.targetTravelStud,
        linkedKnuckles: item.linkedKnuckleIds.size,
        fullyLinked: item.fullyLinked,
      })),
      shocks: (session?.shockAbsorbersV1 ?? []).map(item => ({ id: item.id })),
    }
  },
})
