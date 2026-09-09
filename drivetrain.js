import * as THREE from 'three'
import { findPart } from './parts.js'
import { connectorWorldAxis, connectorWorldPosition } from './snapping.js'

const DEFAULT_STALL_TORQUE = 5.5
const DEFAULT_GEAR_EFFICIENCY = 0.92
const TRANSMISSION_MODES = new Set(['forward', 'neutral', 'reverse'])

function endpointObject(connection, side, byId) {
  return byId.get(connection?.[side]?.instanceId) ?? null
}

function mechanicsFor(object) {
  return findPart(object?.userData.partId)?.mechanics ?? null
}

function semanticHousing(object) {
  const mechanics = mechanicsFor(object)
  return Boolean(mechanics?.transmission || mechanics?.differential)
}

function rigidSemanticPort(object, endpoint) {
  const transmission = mechanicsFor(object)?.transmission
  return Boolean(
    transmission?.rigidConnectorId &&
    endpoint?.connectorId === transmission.rigidConnectorId,
  )
}

export function currentTransmissionMode() {
  const mode = globalThis.__bricklabTransmissionMode
  return TRANSMISSION_MODES.has(mode) ? mode : 'forward'
}

export function isMotorEndpoint(object, connectorId) {
  const motor = mechanicsFor(object)?.motor
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
  if (connection?.kind !== 'axle') return false
  const byId = objectsOrMap instanceof Map
    ? objectsOrMap
    : new Map((objectsOrMap ?? []).map(object => [object.userData.instanceId, object]))
  const objectA = endpointObject(connection, 'a', byId)
  const objectB = endpointObject(connection, 'b', byId)
  if (!objectA || !objectB) return false

  const housingA = semanticHousing(objectA)
  const housingB = semanticHousing(objectB)
  if (housingA || housingB) {
    // Most semantic gearboxes are housings and must not weld their input/output
    // shafts together. Articulated couplers are different: their input yoke is
    // physically part of the input shaft while the output remains a separate body.
    if (housingA && !rigidSemanticPort(objectA, connection.a)) return false
    if (housingB && !rigidSemanticPort(objectB, connection.b)) return false
  }

  return !motorConnectionInfo(connection, byId)
}

function shaftEligible(object) {
  const definition = findPart(object?.userData.partId)
  if (!definition || definition.mechanics?.motor || definition.mechanics?.transmission || definition.mechanics?.differential) return false
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
    kind: gear.kind ?? 'spur',
    teeth: gear.teeth,
    pitchRadius: gear.pitchRadius ?? gear.teeth / 16,
    efficiency: gear.efficiency ?? DEFAULT_GEAR_EFFICIENCY,
    center: connectorWorldPosition(object, connector),
    axis: connectorWorldAxis(object, connector).normalize(),
    shaft: shaftByPart.get(object.userData.instanceId) ?? null,
  }
}

function spurGearMesh(a, b, options) {
  const axisTolerance = options.axisTolerance ?? 0.985
  const axialTolerance = options.axialTolerance ?? 0.42
  const axisDot = a.axis.dot(b.axis)
  if (Math.abs(axisDot) < axisTolerance) return null

  const delta = b.center.clone().sub(a.center)
  const axialOffset = Math.abs(delta.dot(a.axis))
  if (axialOffset > axialTolerance) return null

  const radial = delta.clone().sub(a.axis.clone().multiplyScalar(delta.dot(a.axis))).length()
  const targetDistance = a.pitchRadius + b.pitchRadius
  const tolerance = options.distanceTolerance ?? Math.max(0.14, Math.min(a.pitchRadius, b.pitchRadius) * 0.22)
  const error = Math.abs(radial - targetDistance)
  if (error > tolerance) return null

  const shaftAxisDot = a.shaft.axisWorld.dot(b.shaft.axisWorld)
  const directionSign = shaftAxisDot >= 0 ? -1 : 1
  return {
    id: `gear:${a.instanceId}:${b.instanceId}`,
    kind: 'gear',
    a,
    b,
    shaftA: a.shaft.id,
    shaftB: b.shaft.id,
    ratioAB: directionSign * (a.teeth / b.teeth),
    ratioBA: directionSign * (b.teeth / a.teeth),
    efficiency: Math.min(a.efficiency, b.efficiency),
    torqueShare: 1,
    centerDistance: radial,
    targetDistance,
    error,
  }
}

function bevelGearMesh(a, b, options) {
  const axisDotLimit = options.bevelAxisDotTolerance ?? 0.12
  if (Math.abs(a.axis.dot(b.axis)) > axisDotLimit) return null

  // For a 90° bevel pair the pitch-cone apex lies one mate pitch radius away
  // along each shaft axis. Trying both axis signs keeps the calculation invariant
  // to how the user oriented the keyed axle connectors.
  let best = null
  for (const signA of [-1, 1]) {
    const apexA = a.center.clone().addScaledVector(a.axis, signA * b.pitchRadius)
    for (const signB of [-1, 1]) {
      const apexB = b.center.clone().addScaledVector(b.axis, signB * a.pitchRadius)
      const error = apexA.distanceTo(apexB)
      if (!best || error < best.error) best = { signA, signB, error, apexA, apexB }
    }
  }

  const tolerance = options.bevelApexTolerance ?? Math.max(0.16, Math.min(a.pitchRadius, b.pitchRadius) * 0.22)
  if (!best || best.error > tolerance) return null

  const directionSign = -(best.signA * best.signB)
  const centerDistance = a.center.distanceTo(b.center)
  const targetDistance = Math.hypot(a.pitchRadius, b.pitchRadius)
  return {
    id: `bevel:${a.instanceId}:${b.instanceId}`,
    kind: 'bevel',
    a,
    b,
    shaftA: a.shaft.id,
    shaftB: b.shaft.id,
    ratioAB: directionSign * (a.teeth / b.teeth),
    ratioBA: directionSign * (b.teeth / a.teeth),
    efficiency: Math.min(a.efficiency, b.efficiency),
    torqueShare: 1,
    centerDistance,
    targetDistance,
    apexError: best.error,
    error: best.error,
  }
}

export function detectGearMeshes(objects, shaftByPart, options = {}) {
  const gears = objects.map(object => gearInfo(object, shaftByPart)).filter(Boolean)
  const meshes = []

  for (let i = 0; i < gears.length; i += 1) {
    for (let j = i + 1; j < gears.length; j += 1) {
      const a = gears[i]
      const b = gears[j]
      if (!a.shaft || !b.shaft || a.shaft.id === b.shaft.id) continue
      if (a.kind !== b.kind) continue

      const mesh = a.kind === 'bevel'
        ? bevelGearMesh(a, b, options)
        : spurGearMesh(a, b, options)
      if (mesh) meshes.push(mesh)
    }
  }

  return meshes
}

function connectionAtPort(object, connectorId, connections, byId, shaftByPart) {
  for (const connection of connections) {
    let otherId = null
    if (connection.a.instanceId === object.userData.instanceId && connection.a.connectorId === connectorId) otherId = connection.b.instanceId
    else if (connection.b.instanceId === object.userData.instanceId && connection.b.connectorId === connectorId) otherId = connection.a.instanceId
    if (!otherId) continue
    const otherObject = byId.get(otherId)
    const shaft = shaftByPart.get(otherId)
    if (otherObject && shaft) return { connection, object: otherObject, shaft }
  }
  return null
}

function axisSignForPort(housing, connectorId, shaft) {
  const definition = findPart(housing.userData.partId)
  const connector = definition?.connectors?.find(item => item.id === connectorId)
  if (!connector || !shaft) return 1
  const portAxis = connectorWorldAxis(housing, connector).normalize()
  return shaft.axisWorld.dot(portAxis) >= 0 ? 1 : -1
}

function semanticEnd(shaft, object, teeth = 16) {
  return {
    instanceId: object.userData.instanceId,
    object,
    teeth,
    shaft,
  }
}

function transmissionCouplers(objects, connections, shaftByPart, byId) {
  const mode = currentTransmissionMode()
  const couplers = []
  const transmissions = []

  for (const object of objects) {
    const definition = findPart(object.userData.partId)
    const transmission = definition?.mechanics?.transmission
    if (!transmission) continue

    const input = connectionAtPort(object, transmission.inputConnectorId, connections, byId, shaftByPart)
    const output = connectionAtPort(object, transmission.outputConnectorId, connections, byId, shaftByPart)
    const rawRatio = transmission.modes?.[mode] ?? 0
    const inputSign = input ? axisSignForPort(object, transmission.inputConnectorId, input.shaft) : 1
    const outputSign = output ? axisSignForPort(object, transmission.outputConnectorId, output.shaft) : 1
    const ratio = rawRatio * inputSign * outputSign

    transmissions.push({
      id: object.userData.instanceId,
      partId: object.userData.partId,
      object,
      mode,
      ratio,
      inputShaftId: input?.shaft.id ?? null,
      outputShaftId: output?.shaft.id ?? null,
      connected: Boolean(input && output),
    })

    if (!input || !output || input.shaft.id === output.shaft.id || Math.abs(ratio) < 0.0001) continue
    const efficiency = transmission.efficiency ?? 0.9
    couplers.push({
      id: `transmission:${object.userData.instanceId}`,
      kind: definition?.mechanics?.articulatedCoupler ? 'articulated' : (definition?.mechanics?.wormDrive ? 'worm' : 'transmission'),
      housingId: object.userData.instanceId,
      mode,
      a: semanticEnd(input.shaft, input.object),
      b: semanticEnd(output.shaft, output.object),
      shaftA: input.shaft.id,
      shaftB: output.shaft.id,
      ratioAB: ratio,
      ratioBA: 1 / ratio,
      efficiency,
      torqueShare: 1,
      error: 0,
    })
  }

  return { transmissions, couplers }
}

function differentialCouplers(objects, connections, shaftByPart, byId) {
  const couplers = []
  const differentials = []

  for (const object of objects) {
    const definition = findPart(object.userData.partId)
    const differential = definition?.mechanics?.differential
    if (!differential) continue

    const input = connectionAtPort(object, differential.inputConnectorId, connections, byId, shaftByPart)
    const left = connectionAtPort(object, differential.leftConnectorId, connections, byId, shaftByPart)
    const right = connectionAtPort(object, differential.rightConnectorId, connections, byId, shaftByPart)
    const baseRatio = differential.ratio ?? 1
    const inputSign = input ? axisSignForPort(object, differential.inputConnectorId, input.shaft) : 1
    const efficiency = differential.efficiency ?? 0.92
    const torqueSplit = differential.torqueSplit ?? 0.5

    const result = {
      id: object.userData.instanceId,
      partId: object.userData.partId,
      object,
      inputShaftId: input?.shaft.id ?? null,
      leftShaftId: left?.shaft.id ?? null,
      rightShaftId: right?.shaft.id ?? null,
      connectedOutputs: Number(Boolean(left)) + Number(Boolean(right)),
    }
    differentials.push(result)
    if (!input) continue

    for (const [side, port, connectorId] of [
      ['left', left, differential.leftConnectorId],
      ['right', right, differential.rightConnectorId],
    ]) {
      if (!port || port.shaft.id === input.shaft.id) continue
      const outputSign = axisSignForPort(object, connectorId, port.shaft)
      const ratio = baseRatio * inputSign * outputSign
      couplers.push({
        id: `differential:${object.userData.instanceId}:${side}`,
        kind: 'differential',
        housingId: object.userData.instanceId,
        side,
        a: semanticEnd(input.shaft, input.object),
        b: semanticEnd(port.shaft, port.object),
        shaftA: input.shaft.id,
        shaftB: port.shaft.id,
        ratioAB: ratio,
        ratioBA: 1 / ratio,
        efficiency,
        torqueShare: torqueSplit,
        error: 0,
      })
    }
  }

  return { differentials, couplers }
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
    const nominalRpm = motor.rpm ?? 120
    const rpm = nominalRpm * (motor.direction ?? 1) * axisSign

    motors.push({
      id: info.motorObject.userData.instanceId,
      partId: info.motorObject.userData.partId,
      object: info.motorObject,
      connectionId: connection.id,
      shaftId: drivenShaft.id,
      rpm,
      nominalRpm,
      stallTorque: motor.stallTorque ?? DEFAULT_STALL_TORQUE,
      freeCurrent: motor.freeCurrent ?? 0.15,
      stallCurrent: motor.stallCurrent ?? 2.2,
    })
  }

  return motors
}

export function analyzeDrivetrain(objects, connections) {
  for (const object of objects) object.updateWorldMatrix(true, false)

  const { shafts, shaftByPart, byId } = buildShaftGraph(objects, connections)
  const physicalGearMeshes = detectGearMeshes(objects, shaftByPart)
  const transmissionLayer = transmissionCouplers(objects, connections, shaftByPart, byId)
  const differentialLayer = differentialCouplers(objects, connections, shaftByPart, byId)
  const gearMeshes = [
    ...physicalGearMeshes,
    ...transmissionLayer.couplers,
    ...differentialLayer.couplers,
  ]
  const motors = motorSeeds(objects, connections, shaftByPart)
  const shaftState = new Map(shafts.map(shaft => [shaft.id, {
    shaft,
    rpm: null,
    sourceMotorId: null,
    sourceType: null,
    ratioFromMotor: null,
    torqueCapacity: null,
    efficiency: null,
    stages: 0,
  }]))
  const conflicts = []

  const adjacency = new Map(shafts.map(shaft => [shaft.id, []]))
  for (const mesh of gearMeshes) {
    adjacency.get(mesh.shaftA)?.push({ to: mesh.shaftB, factor: mesh.ratioAB, efficiency: mesh.efficiency, torqueShare: mesh.torqueShare ?? 1, mesh })
    adjacency.get(mesh.shaftB)?.push({ to: mesh.shaftA, factor: mesh.ratioBA, efficiency: mesh.efficiency, torqueShare: mesh.torqueShare ?? 1, mesh })
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
      state.torqueCapacity = motor.stallTorque
      state.efficiency = 1
      state.stages = 0
      queue.push(state.shaft.id)
    } else if (Math.abs(state.rpm - motor.rpm) > Math.max(1, Math.abs(motor.rpm) * 0.02)) {
      conflicts.push({ type: 'motor-conflict', shaftId: state.shaft.id, expectedRpm: state.rpm, incomingRpm: motor.rpm })
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
      const expectedTorque = source.torqueCapacity == null
        ? null
        : source.torqueCapacity / Math.max(Math.abs(edge.factor), 0.001) * edge.efficiency * edge.torqueShare
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
          type: `${edge.mesh.kind ?? 'gear'}-loop-conflict`,
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
      torqueCapacity: state?.torqueCapacity ?? null,
      efficiency: state?.efficiency ?? null,
      stages: state?.stages ?? 0,
    }
  })

  const partRpm = new Map()
  const partTorque = new Map()
  for (const shaft of shaftResults) {
    for (const memberId of shaft.memberIds) {
      partRpm.set(memberId, shaft.rpm)
      partTorque.set(memberId, shaft.torqueCapacity)
    }
  }

  return {
    shafts: shaftResults,
    shaftByPart,
    gearMeshes,
    physicalGearMeshes,
    transmissions: transmissionLayer.transmissions,
    differentials: differentialLayer.differentials,
    motors,
    conflicts,
    partRpm,
    partTorque,
    transmissionMode: currentTransmissionMode(),
    stats: {
      shafts: shaftResults.length,
      drivenShafts: shaftResults.filter(shaft => shaft.rpm != null).length,
      motors: motors.length,
      gearMeshes: physicalGearMeshes.length,
      transmissions: transmissionLayer.transmissions.length,
      differentials: differentialLayer.differentials.length,
      conflicts: conflicts.length,
      maxTorque: Math.max(0, ...shaftResults.map(shaft => shaft.torqueCapacity ?? 0)),
    },
  }
}
