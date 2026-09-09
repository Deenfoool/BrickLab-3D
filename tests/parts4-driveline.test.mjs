import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = callback => { callback(0); return 0 }

const { PARTS, findPart } = await import('../parts.js')
await import('../technic-parts-pack-v2.js')
await import('../parts4/mechanical-driveline-v1.js')
await import('../physical-parts.js')
await import('../parts4/parts-4-physics.js')
const {
  analyzeDrivetrain,
  detectGearMeshes,
  isRigidAxleConnection,
} = await import('../drivetrain.js')
const { PhysicsSession } = await import('../physics.js')
const { JOINT_STABILITY_VERSION } = await import('../joint-stability-v4.js')

function instance(partId, instanceId) {
  const object = new THREE.Object3D()
  object.userData.partId = partId
  object.userData.instanceId = instanceId
  object.updateMatrixWorld(true)
  return object
}

function axleConnection(a, aConnectorId, b, bConnectorId) {
  return {
    id: `${a.userData.instanceId}:${aConnectorId}>${b.userData.instanceId}:${bConnectorId}`,
    kind: 'axle',
    a: { instanceId: a.userData.instanceId, connectorId: aConnectorId },
    b: { instanceId: b.userData.instanceId, connectorId: bConnectorId },
  }
}

test('PARTS-4 registers real driveline inventory exactly once', () => {
  for (const id of ['universal-joint-30', 'cv-joint-30', 'worm-drive-8', 'bevel-gear-12', 'bevel-gear-20']) {
    assert.equal(PARTS.filter(part => part.id === id).length, 1, `${id} unique`)
    assert.ok(findPart(id).physics?.massKg > 0, `${id} has physical mass`)
  }
})

test('articulated coupler welds only its input yoke and leaves output articulated', () => {
  const input = instance('axle-3', 'in')
  const joint = instance('universal-joint-30', 'uj')
  const output = instance('axle-3', 'out')
  const objects = [input, joint, output]

  const inputConnection = axleConnection(input, 'axle-1', joint, 'input')
  const outputConnection = axleConnection(joint, 'output', output, 'axle-1')
  assert.equal(isRigidAxleConnection(inputConnection, objects), true)
  assert.equal(isRigidAxleConnection(outputConnection, objects), false)
})

test('universal and CV joints participate in drivetrain as 1:1 articulated couplers', () => {
  for (const [partId, expectedEfficiency] of [['universal-joint-30', 0.955], ['cv-joint-30', 0.985]]) {
    const input = instance('axle-3', `${partId}-in`)
    const coupling = instance(partId, `${partId}-body`)
    const output = instance('axle-3', `${partId}-out`)
    const connections = [
      axleConnection(input, 'axle-1', coupling, 'input'),
      axleConnection(coupling, 'output', output, 'axle-1'),
    ]
    const result = analyzeDrivetrain([input, coupling, output], connections)
    const mesh = result.gearMeshes.find(item => item.housingId === coupling.userData.instanceId)
    assert.ok(mesh, `${partId} semantic coupling exists`)
    assert.equal(mesh.kind, 'articulated')
    assert.ok(Math.abs(Math.abs(mesh.ratioAB) - 1) < 1e-9)
    assert.equal(mesh.efficiency, expectedEfficiency)
  }
})

test('worm drive contributes a real 8:1 perpendicular transmission ratio', () => {
  const input = instance('axle-3', 'worm-in')
  const gearbox = instance('worm-drive-8', 'worm-box')
  const output = instance('axle-3', 'worm-out')
  const result = analyzeDrivetrain([input, gearbox, output], [
    axleConnection(input, 'axle-1', gearbox, 'input'),
    axleConnection(gearbox, 'output', output, 'axle-1'),
  ])
  const mesh = result.gearMeshes.find(item => item.housingId === 'worm-box')
  assert.ok(mesh)
  assert.equal(mesh.kind, 'worm')
  assert.ok(Math.abs(Math.abs(mesh.ratioAB) - 0.125) < 1e-9)
  assert.equal(mesh.efficiency, 0.74)
})

function placeGear(partId, instanceId, axis, center) {
  const object = instance(partId, instanceId)
  const connector = findPart(partId).connectors.find(item => item.id === 'axle-hole')
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize())
  object.quaternion.copy(q)
  const connectorOffset = new THREE.Vector3(...connector.position).applyQuaternion(q)
  object.position.copy(center).sub(connectorOffset)
  object.updateMatrixWorld(true)
  return object
}

test('12T and 20T bevel gears mesh on perpendicular shafts using a shared pitch-cone apex', () => {
  const x = new THREE.Vector3(1, 0, 0)
  const z = new THREE.Vector3(0, 0, 1)
  const r12 = 12 / 16
  const r20 = 20 / 16
  const a = placeGear('bevel-gear-12', 'bevel-a', x, x.clone().multiplyScalar(r20))
  const b = placeGear('bevel-gear-20', 'bevel-b', z, z.clone().multiplyScalar(r12))
  const shaftByPart = new Map([
    ['bevel-a', { id: 'shaft-a', axisWorld: x.clone() }],
    ['bevel-b', { id: 'shaft-b', axisWorld: z.clone() }],
  ])

  const meshes = detectGearMeshes([a, b], shaftByPart)
  assert.equal(meshes.length, 1)
  assert.equal(meshes[0].kind, 'bevel')
  assert.ok(meshes[0].apexError < 1e-8)
  assert.ok(Math.abs(Math.abs(meshes[0].ratioAB) - 0.6) < 1e-9)
})

test('articulated axle output creates one stable spherical Rapier joint', () => {
  const couplingObject = instance('universal-joint-30', 'coupling')
  const shaftObject = instance('axle-3', 'shaft')
  shaftObject.position.set(0.54, 0.26, 0.31)
  shaftObject.updateMatrixWorld(true)

  const identity = new THREE.Matrix4()
  const bodyA = { rotation: () => new THREE.Quaternion() }
  const bodyB = { rotation: () => new THREE.Quaternion() }
  const session = Object.create(PhysicsSession.prototype)
  session.members = new Map([
    ['coupling', { object: couplingObject, body: bodyA, component: { id: 'body-a', bodyWorldInverse: identity.clone() } }],
    ['shaft', { object: shaftObject, body: bodyB, component: { id: 'body-b', bodyWorldInverse: identity.clone() } }],
  ])
  session.jointCount = 0
  session.failedJointCount = 0
  session.internalJointCount = 0
  session.bearingCount = 0
  const created = []
  session.RAPIER = {
    JointData: {
      spherical(anchorA, anchorB) { return { type: 'spherical', anchorA, anchorB } },
      revoluteWithAxes() { throw new Error('unexpected revolute') },
    },
  }
  session.world = {
    createImpulseJoint(params) {
      created.push(params)
      return { setContactsEnabled() {} }
    },
  }

  session.createJoint({
    kind: 'axle',
    a: { instanceId: 'coupling', connectorId: 'output' },
    b: { instanceId: 'shaft', connectorId: 'axle-1' },
  })

  assert.equal(JOINT_STABILITY_VERSION, 'joint-stability-v5')
  assert.equal(created.length, 1)
  assert.equal(created[0].type, 'spherical')
  assert.equal(session.sphericalJoints.length, 1)
  assert.equal(session.__bricklabJointStability.createdSpherical, 1)
  assert.equal(session.jointCount, 1)
})

await dom.happyDOM.close()
