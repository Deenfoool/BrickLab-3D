import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = () => 0

await import('../parts4/mechanical-driveline-v1.js')
await import('../parts4/semantic-bearing-upgrade-v1.js')
await import('../physical-parts.js')
const { PhysicsSession } = await import('../physics.js')
await import('../joint-stability-v4.js')
await import('../physics-stability-v3.js')
await import('../drivetrain-stress-v2.js')
await import('../parts4/articulated-driveline-physics-v1.js')
const { findPart } = await import('../parts.js')

function objectFor(partId, instanceId) {
  const object = new THREE.Object3D()
  object.userData.partId = partId
  object.userData.instanceId = instanceId
  object.updateMatrixWorld(true)
  return object
}

test('worm, FNR and differential declare physical shaft bearing ports', () => {
  assert.deepEqual(findPart('worm-drive-8').mechanics.transmission.bearingConnectorIds, ['input', 'output'])
  assert.deepEqual(findPart('gearbox-fnr').mechanics.transmission.bearingConnectorIds, ['input', 'output'])
  assert.deepEqual(findPart('open-differential').mechanics.differential.bearingConnectorIds, ['input', 'left', 'right'])
  assert.deepEqual(globalThis.BrickLabParts4SemanticBearings?.installed, {
    worm: true,
    gearbox: true,
    differential: true,
  })
})

test('an axle connected to a semantic worm port receives a stabilized revolute bearing', () => {
  const housing = objectFor('worm-drive-8', 'housing')
  const shaft = objectFor('axle-3', 'shaft')
  const target = new THREE.Vector3(0, 0.92, 1.05)
  const axleConnector = findPart('axle-3').connectors.find(item => item.id === 'axle-1')
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1))
  shaft.quaternion.copy(q)
  shaft.position.copy(target).sub(new THREE.Vector3(...axleConnector.position).applyQuaternion(q))
  shaft.updateMatrixWorld(true)

  const identity = new THREE.Matrix4()
  const bodyA = { rotation: () => new THREE.Quaternion() }
  const bodyB = { rotation: () => q.clone() }
  const session = Object.create(PhysicsSession.prototype)
  session.members = new Map([
    ['housing', { object: housing, body: bodyA, component: { id: 'housing-body', bodyWorldInverse: identity.clone(), bodyWorldRotation: new THREE.Quaternion() } }],
    ['shaft', { object: shaft, body: bodyB, component: { id: 'shaft-body', bodyWorldInverse: identity.clone(), bodyWorldRotation: q.clone() } }],
  ])
  session.jointCount = 0
  session.failedJointCount = 0
  session.internalJointCount = 0
  session.bearingCount = 0
  session.bodyLocalAxis = () => new THREE.Vector3(0, 0, 1)
  session.revoluteJointData = () => ({ type: 'revolute' })
  const created = []
  session.world = {
    createImpulseJoint(params) {
      created.push(params)
      return { setContactsEnabled() {} }
    },
  }

  session.createJoint({
    kind: 'axle',
    a: { instanceId: 'housing', connectorId: 'input' },
    b: { instanceId: 'shaft', connectorId: 'axle-1' },
  })

  assert.equal(created.length, 1)
  assert.equal(created[0].type, 'revolute')
  assert.equal(session.bearingCount, 1)
  assert.equal(session.__bricklabJointStability.createdSemanticBearings, 1)
  assert.equal(session.revoluteJoints.length, 1)
  assert.equal(session.revoluteJoints[0].semanticBearing, true)
  assert.equal(session.failedJointCount, 0)
})

await dom.happyDOM.close()
