import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'

export const JOINT_STABILITY_VERSION = 'joint-stability-v5'
const STUD = globalThis.BrickLabPhysicsUnits?.studMeters ?? 0.008
const MAX_JOINT_MISMATCH_STUD = 0.20
const originalCreateJoint = PhysicsSession.prototype.createJoint
const marker = Symbol.for('bricklab.jointStability.v5')

function connectorFor(object, connectorId) {
  return findPart(object?.userData?.partId)?.connectors?.find(connector => connector.id === connectorId) ?? null
}

function worldPoint(object, connector) {
  return new THREE.Vector3(...connector.position).applyMatrix4(object.matrixWorld)
}

function bodyPairKey(memberA, memberB) {
  return [memberA.component.id, memberB.component.id].sort().join('<>')
}

function sharedLocalAnchor(member, worldMidpointStud) {
  return worldMidpointStud.clone()
    .applyMatrix4(member.component.bodyWorldInverse)
    .multiplyScalar(STUD)
}

function diagnostics(session) {
  if (!session.__bricklabJointStability) {
    session.__bricklabJointStability = {
      version: JOINT_STABILITY_VERSION,
      createdRevolute: 0,
      createdSpherical: 0,
      createdSemanticBearings: 0,
      redundantRevoluteSkipped: 0,
      redundantSphericalSkipped: 0,
      rejectedLargeMismatch: 0,
      maxInitialMismatchStud: 0,
      pairs: [],
    }
  }
  return session.__bricklabJointStability
}

function registerRevolute(session, connection, joint, context) {
  session.revoluteJoints ??= []
  const record = { connection, joint, ...context }
  session.revoluteJoints.push(record)
  session.onRevoluteJointCreated?.(connection, joint, record)
  return record
}

function registerSpherical(session, connection, joint, context) {
  session.sphericalJoints ??= []
  const record = { connection, joint, ...context }
  session.sphericalJoints.push(record)
  session.onSphericalJointCreated?.(connection, joint, record)
  return record
}

function articulatedOutput(member, endpoint) {
  const definition = findPart(member?.object?.userData?.partId)
  const articulated = definition?.mechanics?.articulatedCoupler
  if (!articulated || endpoint?.connectorId !== articulated.outputConnectorId) return null
  return { definition, articulated }
}

function articulatedConnectionInfo(connection, memberA, memberB) {
  if (connection?.kind !== 'axle') return null
  const a = articulatedOutput(memberA, connection.a)
  if (a) return { side: 'a', member: memberA, ...a }
  const b = articulatedOutput(memberB, connection.b)
  if (b) return { side: 'b', member: memberB, ...b }
  return null
}

function semanticBearingPort(member, endpoint) {
  const definition = findPart(member?.object?.userData?.partId)
  if (!definition || !endpoint?.connectorId) return null
  const mechanics = definition.mechanics ?? {}
  const transmissionPorts = mechanics.transmission?.bearingConnectorIds ?? []
  const differentialPorts = mechanics.differential?.bearingConnectorIds ?? []
  if (!transmissionPorts.includes(endpoint.connectorId) && !differentialPorts.includes(endpoint.connectorId)) return null
  return { definition, connectorId: endpoint.connectorId }
}

function semanticBearingConnectionInfo(connection, memberA, memberB) {
  if (connection?.kind !== 'axle') return null
  const a = semanticBearingPort(memberA, connection.a)
  if (a) return { side: 'a', member: memberA, ...a }
  const b = semanticBearingPort(memberB, connection.b)
  if (b) return { side: 'b', member: memberB, ...b }
  return null
}

function sharedJointContext(session, connection, memberA, memberB, connectorA, connectorB) {
  memberA.object.updateWorldMatrix(true, false)
  memberB.object.updateWorldMatrix(true, false)

  const state = diagnostics(session)
  const pairKey = bodyPairKey(memberA, memberB)
  const pointA = worldPoint(memberA.object, connectorA)
  const pointB = worldPoint(memberB.object, connectorB)
  const mismatchStud = pointA.distanceTo(pointB)
  state.maxInitialMismatchStud = Math.max(state.maxInitialMismatchStud, mismatchStud)

  if (!Number.isFinite(mismatchStud) || mismatchStud > MAX_JOINT_MISMATCH_STUD) {
    state.rejectedLargeMismatch += 1
    state.pairs.push({ pairKey, kind: connection.kind, action: 'reject-mismatch', mismatchStud })
    session.failedJointCount += 1
    globalThis.__bricklabJointStability = { ...state, pairs: [...state.pairs] }
    console.warn('BrickLab rejected unstable joint', { connection, mismatchStud })
    return null
  }

  const midpoint = pointA.clone().add(pointB).multiplyScalar(0.5)
  const anchorA = sharedLocalAnchor(memberA, midpoint)
  const anchorB = sharedLocalAnchor(memberB, midpoint)
  return { state, pairKey, mismatchStud, anchorA, anchorB }
}

if (!PhysicsSession.prototype[marker]) {
  PhysicsSession.prototype.createJoint = function createStableJointV5(connection) {
    const memberA = this.members.get(connection?.a?.instanceId)
    const memberB = this.members.get(connection?.b?.instanceId)
    const articulated = memberA && memberB ? articulatedConnectionInfo(connection, memberA, memberB) : null
    const semanticBearing = memberA && memberB ? semanticBearingConnectionInfo(connection, memberA, memberB) : null
    const isRevolute = connection?.kind === 'bearing' || connection?.kind === 'hinge' || Boolean(semanticBearing)

    if (!isRevolute && !articulated) {
      return originalCreateJoint.call(this, connection)
    }

    if (!memberA || !memberB) return
    if (memberA.body === memberB.body) {
      this.internalJointCount += 1
      return
    }

    const connectorA = connectorFor(memberA.object, connection.a.connectorId)
    const connectorB = connectorFor(memberB.object, connection.b.connectorId)
    if (!connectorA || !connectorB) return

    const context = sharedJointContext(this, connection, memberA, memberB, connectorA, connectorB)
    if (!context) return
    const { state, pairKey, mismatchStud, anchorA, anchorB } = context

    if (articulated) {
      this.__bricklabSphericalPairs ??= new Set()
      if (this.__bricklabSphericalPairs.has(pairKey)) {
        state.redundantSphericalSkipped += 1
        state.pairs.push({ pairKey, kind: 'spherical', action: 'skip-redundant' })
        this.internalJointCount += 1
        globalThis.__bricklabJointStability = { ...state, pairs: [...state.pairs] }
        return
      }

      try {
        const params = this.RAPIER.JointData.spherical(
          { x: anchorA.x, y: anchorA.y, z: anchorA.z },
          { x: anchorB.x, y: anchorB.y, z: anchorB.z },
        )
        const joint = this.world.createImpulseJoint(params, memberA.body, memberB.body, true)
        joint.setContactsEnabled?.(false)

        this.__bricklabSphericalPairs.add(pairKey)
        this.jointCount += 1
        state.createdSpherical += 1
        state.pairs.push({
          pairKey,
          kind: 'spherical',
          action: 'create',
          mismatchStud,
          coupler: articulated.definition.id,
          maxAngleDeg: articulated.articulated.maxAngleDeg ?? null,
        })
        globalThis.__bricklabJointStability = { ...state, pairs: [...state.pairs] }

        registerSpherical(this, connection, joint, {
          memberA,
          memberB,
          connectorA,
          connectorB,
          anchorA: anchorA.clone(),
          anchorB: anchorB.clone(),
          pairKey,
          mismatchStud,
          couplerId: articulated.definition.id,
          maxAngleDeg: articulated.articulated.maxAngleDeg ?? null,
        })
        return joint
      } catch (error) {
        this.failedJointCount += 1
        console.warn('BrickLab could not create stabilized spherical joint', connection, error)
        return
      }
    }

    this.__bricklabRevolutePairs ??= new Set()

    // A revolute joint already removes all relative DOF except rotation about one axis.
    // Additional bearings/hinges between the exact same two rigid bodies are redundant
    // and can over-constrain Rapier when their anchors are even slightly misaligned.
    if (this.__bricklabRevolutePairs.has(pairKey)) {
      state.redundantRevoluteSkipped += 1
      state.pairs.push({ pairKey, kind: semanticBearing ? 'semantic-bearing' : connection.kind, action: 'skip-redundant' })
      this.internalJointCount += 1
      globalThis.__bricklabJointStability = { ...state, pairs: [...state.pairs] }
      return
    }

    try {
      // Both local anchors come from one shared world-space midpoint. This guarantees
      // zero positional constraint error at t=0 instead of asking Rapier to teleport
      // two light rigid bodies together on the first solver iteration.
      const axisA = this.bodyLocalAxis(memberA, connectorA)
      const params = this.revoluteJointData(memberA, memberB, anchorA, anchorB, axisA)
      const joint = this.world.createImpulseJoint(params, memberA.body, memberB.body, true)
      joint.setContactsEnabled?.(false)

      this.__bricklabRevolutePairs.add(pairKey)
      this.jointCount += 1
      if (connection.kind === 'bearing' || semanticBearing) this.bearingCount += 1
      if (semanticBearing) state.createdSemanticBearings += 1
      state.createdRevolute += 1
      state.pairs.push({
        pairKey,
        kind: semanticBearing ? 'semantic-bearing' : connection.kind,
        action: 'create',
        mismatchStud,
        housing: semanticBearing?.definition?.id ?? null,
        connectorId: semanticBearing?.connectorId ?? null,
      })
      globalThis.__bricklabJointStability = { ...state, pairs: [...state.pairs] }

      // Authoritative joint creation stops here. Specialized systems (suspension,
      // steering, transmission bearings, telemetry) consume this registry instead of
      // creating duplicate constraints.
      registerRevolute(this, connection, joint, {
        memberA,
        memberB,
        connectorA,
        connectorB,
        axisA: axisA.clone(),
        anchorA: anchorA.clone(),
        anchorB: anchorB.clone(),
        pairKey,
        mismatchStud,
        semanticBearing: Boolean(semanticBearing),
        semanticHousingId: semanticBearing?.definition?.id ?? null,
      })
      return joint
    } catch (error) {
      this.failedJointCount += 1
      console.warn('BrickLab could not create stabilized revolute joint', connection, error)
    }
  }
  PhysicsSession.prototype.createJoint.__bricklabOwner = JOINT_STABILITY_VERSION

  Object.defineProperty(PhysicsSession.prototype, marker, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })
}
