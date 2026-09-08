import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = () => 0

const { PhysicsSession } = await import('../physics.js')
await import('../joint-stability-v4.js')

function fakeObject(partId) {
  return {
    userData: { partId },
    matrixWorld: new THREE.Matrix4(),
    updateWorldMatrix() {},
  }
}

function makeSession() {
  const session = Object.create(PhysicsSession.prototype)
  const shaftBody = {}
  const frameBody = {}
  const identity = new THREE.Matrix4()
  session.members = new Map([
    ['shaft', {
      object: fakeObject('axle-5'),
      body: shaftBody,
      component: { id: 'shaft-body', bodyWorldInverse: identity.clone() },
    }],
    ['frame', {
      object: fakeObject('beam-5'),
      body: frameBody,
      component: { id: 'frame-body', bodyWorldInverse: identity.clone() },
    }],
  ])
  session.jointCount = 0
  session.failedJointCount = 0
  session.internalJointCount = 0
  session.bearingCount = 0
  session.bodyLocalAxis = () => new THREE.Vector3(1, 0, 0)

  const created = []
  session.RAPIER = {
    JointData: {
      revolute(anchorA, anchorB, axis) {
        return { anchorA, anchorB, axis }
      },
    },
  }
  session.world = {
    createImpulseJoint(params) {
      created.push(params)
      return { setContactsEnabled() {} }
    },
  }
  return { session, created }
}

const bearing = (axleConnectorId, holeConnectorId) => ({
  kind: 'bearing',
  a: { instanceId: 'shaft', connectorId: axleConnectorId },
  b: { instanceId: 'frame', connectorId: holeConnectorId },
})

test('multiple bearings between the same rigid bodies create one revolute joint', () => {
  const { session, created } = makeSession()

  session.createJoint(bearing('axle-0', 'hole-0'))
  session.createJoint(bearing('axle-1', 'hole-1'))
  session.createJoint(bearing('axle-2', 'hole-2'))

  assert.equal(created.length, 1)
  assert.equal(session.jointCount, 1)
  assert.equal(session.bearingCount, 1)
  assert.equal(session.__bricklabJointStability.redundantRevoluteSkipped, 2)
})

test('revolute anchors use one shared midpoint and start with zero positional error', () => {
  const { session, created } = makeSession()
  session.createJoint(bearing('axle-0', 'hole-0'))

  assert.equal(created.length, 1)
  const { anchorA, anchorB } = created[0]
  assert.deepEqual(anchorA, anchorB)
  assert.ok(session.__bricklabJointStability.maxInitialMismatchStud > 0)
  assert.ok(session.__bricklabJointStability.maxInitialMismatchStud <= 0.20)
})

await dom.happyDOM.close()
