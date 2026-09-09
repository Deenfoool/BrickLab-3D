import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Window } from 'happy-dom'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS', 'Event']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = callback => { callback?.(0); return 0 }

await import('../parts4/steering-suspension-v1.js')
const { findPart } = await import('../parts.js')
const { connectorRule } = await import('../connections-v3.js')
const { validateConnectorCatalog } = await import('../connector-validation-v3.js')
const { PhysicsSession } = await import('../physics.js')
await import('../joint-stability-v4.js')

test('slider connector pair is an authoritative prismatic connection', () => {
  assert.equal(connectorRule('slider', 'slider-rail')?.kind, 'prismatic')
  assert.equal(connectorRule('slider-rail', 'slider')?.kind, 'prismatic')
})

test('rack and shock definitions expose validated linear-mechanism metadata', () => {
  const guide = findPart('steering-rack-guide')
  const rack = findPart('steering-rack-7')
  const body = findPart('shock-body-5')
  const rod = findPart('shock-rod-5')
  assert.ok(guide && rack && body && rod)
  assert.equal(guide.connectors.find(item => item.id === 'rail')?.type, 'slider-rail')
  assert.equal(rack.connectors.find(item => item.id === 'slider')?.type, 'slider')
  assert.equal(body.connectors.find(item => item.id === 'rail')?.type, 'slider-rail')
  assert.equal(rod.connectors.find(item => item.id === 'slider')?.type, 'slider')
  assert.equal(rack.mechanics?.steeringRack?.maxTravelStud, 1)
  assert.ok(body.mechanics?.shockBody?.springStiffness > 0)
  assert.ok(body.mechanics?.shockBody?.damping > 0)

  const report = validateConnectorCatalog([guide, rack, body, rod])
  assert.equal(report.ok, true, report.errors.join('\n'))
  assert.equal(report.errors.length, 0)
})

function makeMember(partId, instanceId, componentId, body) {
  const object = findPart(partId).create(0x88919a)
  object.userData.partId = partId
  object.userData.instanceId = instanceId
  object.updateWorldMatrix(true, false)
  return {
    object,
    body,
    component: {
      id: componentId,
      body,
      bodyWorldInverse: new THREE.Matrix4(),
      bodyWorldRotation: new THREE.Quaternion(),
    },
  }
}

test('joint owner creates and registers one prismatic joint for rack-guide connection', () => {
  const bodyA = { rotation: () => new THREE.Quaternion() }
  const bodyB = { rotation: () => new THREE.Quaternion() }
  const guide = makeMember('steering-rack-guide', 'guide', 'guide-body', bodyA)
  const rack = makeMember('steering-rack-7', 'rack', 'rack-body', bodyB)
  const created = []

  const session = Object.create(PhysicsSession.prototype)
  session.members = new Map([['guide', guide], ['rack', rack]])
  session.jointCount = 0
  session.failedJointCount = 0
  session.internalJointCount = 0
  session.bearingCount = 0
  session.bodyLocalAxis = () => new THREE.Vector3(1, 0, 0)
  session.RAPIER = {
    JointData: {
      prismatic(anchorA, anchorB, axis) { return { anchorA, anchorB, axis } },
    },
  }
  session.world = {
    createImpulseJoint(params) {
      created.push(params)
      return { setContactsEnabled() {} }
    },
  }

  session.createJoint({
    id: 'rack-prismatic',
    kind: 'prismatic',
    a: { instanceId: 'guide', connectorId: 'rail' },
    b: { instanceId: 'rack', connectorId: 'slider' },
  })

  assert.equal(created.length, 1)
  assert.equal(session.jointCount, 1)
  assert.equal(session.prismaticJoints?.length, 1)
  assert.equal(session.prismaticJoints[0].connection.kind, 'prismatic')
  assert.equal(session.__bricklabJointStability.createdPrismatic, 1)
})

test('rack/shock runtime configures bounded prismatic travel instead of velocity clamps', async () => {
  const source = await readFile(new URL('../parts4/steering-suspension-physics-v1.js', import.meta.url), 'utf8')
  assert.match(source, /setLimits\?\.\(-limit, limit\)/)
  assert.match(source, /configureMotorPosition\?\./)
  assert.match(source, /springStiffness/)
  assert.match(source, /linkedKnuckleIds/)
  assert.doesNotMatch(source, /setLinvel|setAngvel|sleep\(\)/)
})

await dom.happyDOM.close()
