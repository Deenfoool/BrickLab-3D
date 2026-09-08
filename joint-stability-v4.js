import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'

const STUD = globalThis.BrickLabPhysicsUnits?.studMeters ?? 0.008
const MAX_JOINT_MISMATCH_STUD = 0.20
const originalCreateJoint = PhysicsSession.prototype.createJoint
const marker = Symbol.for('bricklab.jointStability.v4')

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
      version: 'joint-stability-v4',
      createdRevolute: 0,
      redundantRevoluteSkipped: 0,
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

if (!PhysicsSession.prototype[marker]) {
  PhysicsSession.prototype.createJoint = function createStableJointV4(connection) {
    if (connection?.kind !== 'bearing' && connection?.kind !== 'hinge') {
      return originalCreateJoint.call(this, connection)
    }

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

    memberA.object.updateWorldMatrix(true, false)
    memberB.object.updateWorldMatrix(true, false)

    const state = diagnostics(this)
    const pairKey = bodyPairKey(memberA, memberB)
    this.__bricklabRevolutePairs ??= new Set()

    // A revolute joint already removes all relative DOF except rotation about one axis.
    // Additional bearings/hinges between the exact same two rigid bodies are redundant
    // and can over-constrain Rapier when their anchors are even slightly misaligned.
    if (this.__bricklabRevolutePairs.has(pairKey)) {
      state.redundantRevoluteSkipped += 1
      state.pairs.push({ pairKey, kind: connection.kind, action: 'skip-redundant' })
      this.internalJointCount += 1
      globalThis.__bricklabJointStability = { ...state, pairs: [...state.pairs] }
      return
    }

    const pointA = worldPoint(memberA.object, connectorA)
    const pointB = worldPoint(memberB.object, connectorB)
    const mismatchStud = pointA.distanceTo(pointB)
    state.maxInitialMismatchStud = Math.max(state.maxInitialMismatchStud, mismatchStud)

    // The connector graph should already have rejected anything farther away than this.
    // Do not let a bad legacy connection become a high-energy solver correction.
    if (!Number.isFinite(mismatchStud) || mismatchStud > MAX_JOINT_MISMATCH_STUD) {
      state.rejectedLargeMismatch += 1
      state.pairs.push({ pairKey, kind: connection.kind, action: 'reject-mismatch', mismatchStud })
      this.failedJointCount += 1
      globalThis.__bricklabJointStability = { ...state, pairs: [...state.pairs] }
      console.warn('BrickLab rejected unstable revolute joint', { connection, mismatchStud })
      return
    }

    try {
      // Both local anchors come from one shared world-space midpoint. This guarantees
      // zero positional constraint error at t=0 instead of asking Rapier to teleport
      // two light rigid bodies together on the first solver iteration.
      const midpoint = pointA.clone().add(pointB).multiplyScalar(0.5)
      const anchorA = sharedLocalAnchor(memberA, midpoint)
      const anchorB = sharedLocalAnchor(memberB, midpoint)
      const axisA = this.bodyLocalAxis(memberA, connectorA)
      const params = this.revoluteJointData(memberA, memberB, anchorA, anchorB, axisA)
      const joint = this.world.createImpulseJoint(params, memberA.body, memberB.body, true)
      joint.setContactsEnabled?.(false)

      this.__bricklabRevolutePairs.add(pairKey)
      this.jointCount += 1
      if (connection.kind === 'bearing') this.bearingCount += 1
      state.createdRevolute += 1
      state.pairs.push({ pairKey, kind: connection.kind, action: 'create', mismatchStud })
      globalThis.__bricklabJointStability = { ...state, pairs: [...state.pairs] }

      // Authoritative joint creation stops here. Specialized systems (suspension,
      // steering, telemetry) consume this registry instead of creating duplicates.
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
      })
      return joint
    } catch (error) {
      this.failedJointCount += 1
      console.warn('BrickLab could not create stabilized revolute joint', connection, error)
    }
  }

  Object.defineProperty(PhysicsSession.prototype, marker, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  })
}

export const JOINT_STABILITY_VERSION = 'joint-stability-v4'
