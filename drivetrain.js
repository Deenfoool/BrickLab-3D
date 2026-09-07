import * as THREE from 'three'
import { findPart } from './parts.js'
import { connectorWorldAxis, connectorWorldPosition } from './snapping.js'

function endpointObject(connection, side, byId) {
  return byId.get(connection?.[side]?.instanceId) ?? null
}

export function isMotorEndpoint(object, connectorId) {
  const motor = findPart(object?.userData.partId)?.mechanics?.motor
  return Boolean(motor && motor.connectorId === connectorId)
}

export function motorConnectionInfo(connection, objectsOrMap) {
  if (connection?.kind !== 'axle') return null
  const byId = objectsOrMap instanceof Map
    ? objectsOrMap
    : new Map((objectsOrMap ?? []).map(object => [object.userData.instanceId, object]))

  const objectA = endpointObject(connection, 'a', byId)
  const objectB = endpointObject(connection, 'b', byId)
  if (!objectA || !objectB) return null

  if (isMotorEndpoint(objectA, connection.a.connectorId)) {
    return { motorObject: objectA, motorEndpoint: connection.a, drivenObject: objectB, drivenEndpoint: connection.b }
  }
  if (isMotorEndpoint(objectB, connection.b.connectorId)) {
    return { motorObject: objectB, motorEndpoint: connection.b, drivenObject: objectA, drivenEndpoint: connection.a }
  }
  return null
}

export function isRigidAxleConnection(connection, objectsOrMap) {
  return connection?.kind === 'axle' && !motorConnectionInfo(connection, objectsOrMap)
}

function shaftEligible(object) {
  const definition = findPart(object?.userData.partId)
  if (!definition || definition.mechanics?.motor) return false
  return definition.connectors?.some(connector => connector.type === 'axle' || connector.type === 'axle-hole') ?? false
}

function representativeAxis(object) {
  const definition = findPart(object?.userData.partId)
  const connector = definition?.connectors?.find(item => item.type === 'axle' || item.type === 'axle-hole')
  if (!connector) return new THREE.Vector3(1, 0, 0)
  return connectorWorldAxis(object, connector).normalize()
}

function unionFind(ids) {
  const parent = new Map(ids.map(id => [id, id]))

  const find = id => {
    let root = parent.get(id)
    if (!root) return null
    while (root !== parent.get(root)) root = parent.get(root)
    let cursor = id
    while (cursor !== root) {
      const next = parent.get(cursor)
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }

  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (!rootA || !rootB || rootA === rootB) return
    parent.set(rootB, rootA)
  }

  return { parent, find, union }
}

export function buildShaftGraph(objects, connections) {
  const byId = new Map(objects.map(object => [object.userData.instanceId, object]))
  const eligible = objects.filter(shaftEligible)
  const ids = eligible.map(object => object.userData.instanceId)
  const uf = unionFind(ids)

  for (const connection of connections) {
    if (!isRigidAxleConnection(connection, byId)) continue
    if (!uf.parent.has(connection.a.instanceId) || !uf.parent.has(connection.b.instanceId)) continue
    uf.union(connection.a.instanceId, connection.b.instanceId)
  }

  const groups = new Map()
  for (const object of eligible) {
    const root = uf.find(object.userData.instanceId)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(object)
  }

  const shafts = []
  const shaftByPart = new Map()
  let index = 1
  for (const members of groups.values()) {
    const id = `shaft-${index++}`
    const axisWorld = representativeAxis(members[0])
    const shaft = {
      id,
      members,
      memberIds: members.map(object => object.userData.instanceId),
      axisWorld,
    }
    shafts.push(shaft)
    for (const object of members) shaftByPart.set(object.userData.instanceId, shaft)
  }

  return { shafts, shaftByPart, byId }
}

function gearInfo(object, shaftByPart) {
  const definition = findPart(object?.userData.partId)
  const gear = definition?.mechanics?.gear
  if (!gear) return null
  const connector = definition.connectors?.find(item => item.type === 'axle-hole')
  if (!connector) return null

  return {
    object,
    instanceId: object.userData.instanceId,
    partId: object.userData.partId,
    teeth: gear.teeth,
    pitchRadius: gear.pitchRadius ?? Math.max(0.45, gear.teeth * 0.055),
    center: connectorWorldPosition(object, connector),
    axis: connectorWorldAxis(object, connector).normalize(),
    shaft: shaftByPart.get(object.userData.instanceId) ?? null,
  }
}

export function detectGearMeshes(objects, shaftByPart, options = {}) {
  const axisTolerance = options.axisTolerance ?? 0.985
  const axialTolerance = options.axialTolerance ?? 0.42
  const gears = objects.map(object => gearInfo(object, shaftByPart)).filter(Boolean)
  const meshes = []

  for (let i = 0; i < gears.length; i += 1) {
    for (let j = i + 1; j < gears.length; j += 1) {
      const a = gears[i]
      const b = gears[j]
      if (!a.shaft || !b.shaft || a.shaft.id === b.shaft.id) continue

      const axisDot = a.axis.dot(b.axis)
      if (Math.abs(axisDot) < axisTolerance) continue

      const delta = b.center.clone().sub(a.center)
      const axialOffset = Math.abs(delta.dot(a.axis))
      if (axialOffset > axialTolerance) continue

      const radial = delta.clone().sub(a.axis.clone().multiplyScalar(delta.dot(a.axis))).length()
      const targetDistance = a.pitchRadius + b.pitchRadius
      const tolerance = options.distanceTolerance ?? Math.max(0.14, Math.min(a.pitchRadius, b.pitchRadius) * 0.22)
      const error = Math.abs(radial - targetDistance)
      if (error > tolerance) continue

      const shaftAxisDot = a.shaft.axisWorld.dot(b.shaft.axisWorld)
      const directionSign = shaftAxisDot >= 0 ? -1 : 1
      meshes.push({
        id: `gear:${a.instanceId}:${b.instanceId}`,
        a,
        b,
        shaftA: a.shaft.id,
        shaftB: b.shaft.id,
        ratioAB: directionSign * (a.teeth / b.teeth),
        ratioBA: directionSign * (b.teeth / a.teeth),
        centerDistance: radial,
        targetDistance,
        error,
      })
    }
  }

  return meshes
}

function motorSeeds(objects, connections, shaftByPart) {
  const byId = new Map(objects.map(object => [object.userData.instanceId, object]))
  const motors = []

  for (const connection of connections) {
    const info = motorConnectionInfo(connection, byId)
    if (!info) continue

    const motorDefinition = findPart(info.motorObject.userData.partId)
    const motor = motorDefinition?.mechanics?.motor
    const motorConnector = motorDefinition?.connectors?.find(item => item.id === motor?.connectorId)
    const drivenShaft = shaftByPart.get(info.drivenObject.userData.instanceId)
    if (!motor || !motorConnector || !drivenShaft) continue

    const motorAxis = connectorWorldAxis(info.motorObject, motorConnector).normalize()
    const axisSign = motorAxis.dot(drivenShaft.axisWorld) >= 0 ? 1 : -1
    const rpm = (motor.rpm ?? 120) * (motor.direction ?? 1) * axisSign

    motors.push({
      id: info.motorObject.userData.instanceId,
      partId: info.motorObject.userData.partId,
      object: info.motorObject,
      connectionId: connection.id,
      shaftId: drivenShaft.id,
      rpm,
      nominalRpm: motor.rpm ?? 120,
    })
  }

  return motors
}

export function analyzeDrivetrain(objects, connections) {
  for (const object of objects) object.updateWorldMatrix(true, false)

  const { shafts, shaftByPart } = buildShaftGraph(objects, connections)
  const gearMeshes = detectGearMeshes(objects, shaftByPart)
  const motors = motorSeeds(objects, connections, shaftByPart)
  const shaftState = new Map(shafts.map(shaft => [shaft.id, {
    shaft,
    rpm: null,
    sourceMotorId: null,
    sourceType: null,
    ratioFromMotor: null,
  }]))
  const conflicts = []

  const adjacency = new Map(shafts.map(shaft => [shaft.id, []]))
  for (const mesh of gearMeshes) {
    adjacency.get(mesh.shaftA)?.push({ to: mesh.shaftB, factor: mesh.ratioAB, mesh })
    adjacency.get(mesh.shaftB)?.push({ to: mesh.shaftA, factor: mesh.ratioBA, mesh })
  }

  const queue = []
  for (const motor of motors) {
    const state = shaftState.get(motor.shaftId)
    if (!state) continue

    if (state.rpm == null) {
      state.rpm = motor.rpm
      state.sourceMotorId = motor.id
      state.sourceType = 'motor'
      state.ratioFromMotor = motor.nominalRpm ? motor.rpm / motor.nominalRpm : 1
      queue.push(state.shaft.id)
    } else if (Math.abs(state.rpm - motor.rpm) > Math.max(1, Math.abs(motor.rpm) * 0.02)) {
      conflicts.push({
        type: 'motor-conflict',
        shaftId: state.shaft.id,
        expectedRpm: state.rpm,
        incomingRpm: motor.rpm,
      })
    }
  }

  const visitedEdges = new Set()
  while (queue.length) {
    const shaftId = queue.shift()
    const source = shaftState.get(shaftId)
    if (!source || source.rpm == null) continue

    for (const edge of adjacency.get(shaftId) ?? []) {
      const edgeKey = `${shaftId}->${edge.to}:${edge.mesh.id}`
      if (visitedEdges.has(edgeKey)) continue
      visitedEdges.add(edgeKey)

      const target = shaftState.get(edge.to)
      if (!target) continue
      const expectedRpm = source.rpm * edge.factor

      if (target.rpm == null) {
        target.rpm = expectedRpm
        target.sourceMotorId = source.sourceMotorId
        target.sourceType = 'gear'
        const motor = motors.find(item => item.id === source.sourceMotorId)
        target.ratioFromMotor = motor?.nominalRpm ? expectedRpm / motor.nominalRpm : null
        queue.push(target.shaft.id)
      } else if (Math.abs(target.rpm - expectedRpm) > Math.max(1, Math.abs(expectedRpm) * 0.03)) {
        conflicts.push({
          type: 'gear-loop-conflict',
          shaftId: target.shaft.id,
          expectedRpm: target.rpm,
          incomingRpm: expectedRpm,
          meshId: edge.mesh.id,
        })
      }
    }
  }

  const shaftResults = shafts.map(shaft => {
    const state = shaftState.get(shaft.id)
    return {
      id: shaft.id,
      memberIds: shaft.memberIds,
      axisWorld: shaft.axisWorld.clone(),
      rpm: state?.rpm ?? null,
      sourceMotorId: state?.sourceMotorId ?? null,
      sourceType: state?.sourceType ?? null,
      ratioFromMotor: state?.ratioFromMotor ?? null,
    }
  })

  const partRpm = new Map()
  for (const shaft of shaftResults) {
    for (const memberId of shaft.memberIds) partRpm.set(memberId, shaft.rpm)
  }

  return {
    shafts: shaftResults,
    shaftByPart,
    gearMeshes,
    motors,
    conflicts,
    partRpm,
    stats: {
      shafts: shaftResults.length,
      drivenShafts: shaftResults.filter(shaft => shaft.rpm != null).length,
      motors: motors.length,
      gearMeshes: gearMeshes.length,
      conflicts: conflicts.length,
    },
  }
}
