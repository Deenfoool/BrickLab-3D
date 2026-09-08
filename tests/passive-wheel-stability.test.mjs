import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import RAPIER from '@dimforge/rapier3d-compat'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = () => 0
globalThis.setInterval = () => 0

await import('../runtime-extensions.js')
const { PhysicsSession } = await import('../physics.js')
const { findPart } = await import('../parts.js')
const { resetPhysicsClock } = await import('../simulation-time.js')
await RAPIER.init()

const STUD = 0.008
const WHEEL_RADIUS_STUD = 1.4
const WHEEL_RADIUS_M = WHEEL_RADIUS_STUD * STUD
const DRIFT_SPEED = 0.006 // deliberately below the old 0.01 m/s rolling-resistance cutoff

function part(partId, instanceId, position, color = 0xb7bcc3) {
  const definition = findPart(partId)
  assert.ok(definition, `missing ${partId}`)
  const object = definition.create(color)
  object.userData.partId = partId
  object.userData.instanceId = instanceId
  object.position.fromArray(position)
  object.rotation.set(0, 0, 0)
  object.updateMatrixWorld(true)
  return object
}

function fixed(id, aId, aConnector, bId, bConnector) {
  return {
    id,
    kind: 'fixed',
    a: { instanceId: aId, connectorId: aConnector, connectorType: 'stud' },
    b: { instanceId: bId, connectorId: bConnector, connectorType: 'tube' },
  }
}

function bearing(id, bearingId, axleId) {
  return {
    id,
    kind: 'bearing',
    a: { instanceId: bearingId, connectorId: 'bearing', connectorType: 'pin-hole' },
    b: { instanceId: axleId, connectorId: 'axle-3', connectorType: 'axle' },
  }
}

function axleLink(id, axleId, connectorId, wheelId) {
  return {
    id,
    kind: 'axle',
    a: { instanceId: axleId, connectorId, connectorType: 'axle' },
    b: { instanceId: wheelId, connectorId: 'axle-hole', connectorType: 'axle-hole' },
  }
}

function passiveCartSession() {
  window.__bricklabRequestedTimeScale = 1
  localStorage.setItem('bricklab.physics.v2.settings', JSON.stringify({ quality: 'balanced', selfCollision: 'mechanical' }))
  localStorage.setItem('bricklab.physics.v2.surface', 'concrete')

  // Geometry is connector-exact. Wheel centers are y=1.4 stud, so the 1.4-stud
  // tire radius starts exactly on the flat workshop floor with no launch/drop.
  const objects = [
    part('plate-2x8', 'cart-plate', [0, 0.1, 0], 0x666a70),
    part('bearing-block', 'front-bearing', [0, 0.5, -2], 0x2d69c4),
    part('bearing-block', 'rear-bearing', [0, 0.5, 2], 0x2d69c4),
    part('axle-7', 'front-axle', [0, 1.08, -2], 0x202326),
    part('axle-7', 'rear-axle', [0, 1.08, 2], 0x202326),
    part('wheel', 'front-left-wheel', [-3, 0.25, -2]),
    part('wheel', 'front-right-wheel', [3, 0.25, -2]),
    part('wheel', 'rear-left-wheel', [-3, 0.25, 2]),
    part('wheel', 'rear-right-wheel', [3, 0.25, 2]),
  ]

  const connections = [
    fixed('front-mount', 'cart-plate', 'stud-0-1', 'front-bearing', 'mount-0-0'),
    fixed('rear-mount', 'cart-plate', 'stud-0-5', 'rear-bearing', 'mount-0-0'),
    bearing('front-bearing-joint', 'front-bearing', 'front-axle'),
    bearing('rear-bearing-joint', 'rear-bearing', 'rear-axle'),
    axleLink('front-left-link', 'front-axle', 'axle-0', 'front-left-wheel'),
    axleLink('front-right-link', 'front-axle', 'axle-6', 'front-right-wheel'),
    axleLink('rear-left-link', 'rear-axle', 'axle-0', 'rear-left-wheel'),
    axleLink('rear-right-link', 'rear-axle', 'axle-6', 'rear-right-wheel'),
  ]

  const session = new PhysicsSession(RAPIER, objects, connections, 'flat')
  session.build()
  resetPhysicsClock(session, 0)
  return session
}

function advance(session, startFrame, endFrame) {
  for (let frame = startFrame; frame <= endFrame; frame += 1) session.step(frame / 60)
}

test('motorless four-wheel chassis remains stationary and is allowed to sleep', () => {
  const session = passiveCartSession()
  assert.equal(session.motorDrives.length, 0)
  assert.equal(session.failedJointCount, 0)
  assert.equal(session.wheelMonitors.length, 4)

  const chassis = session.members.get('cart-plate').body
  const start = chassis.translation()
  advance(session, 1, 360)
  const end = chassis.translation()

  assert.ok(Math.hypot(end.x - start.x, end.z - start.z) < 0.001, JSON.stringify({ start, end }))
  assert.ok(Math.hypot(chassis.linvel().x, chassis.linvel().z) < 0.0005, JSON.stringify(chassis.linvel()))
  assert.ok(session.components.every(component => component.body.isSleeping()), 'passive chassis island should sleep')
  session.dispose()
})

test('sub-1cm/s pure rolling perturbation decays instead of becoming permanent coasting', () => {
  const session = passiveCartSession()
  advance(session, 1, 120)

  const chassis = session.members.get('cart-plate').body
  const frontAxle = session.members.get('front-axle').body
  const rearAxle = session.members.get('rear-axle').body

  for (const body of [chassis, frontAxle, rearAxle]) {
    body.setLinvel({ x: 0, y: 0, z: DRIFT_SPEED }, true)
  }
  const rollingOmega = DRIFT_SPEED / WHEEL_RADIUS_M
  frontAxle.setAngvel({ x: rollingOmega, y: 0, z: 0 }, true)
  rearAxle.setAngvel({ x: rollingOmega, y: 0, z: 0 }, true)

  const startZ = chassis.translation().z
  advance(session, 121, 420)
  const endZ = chassis.translation().z
  const speed = Math.hypot(chassis.linvel().x, chassis.linvel().z)

  // Before PHYSICS-10, rolling resistance was exactly zero below 0.01 m/s and
  // every rigid body was forced awake, so 0.006 m/s coasted ~0.03 m in 5 s.
  assert.ok(Math.abs(endZ - startZ) < 0.01, JSON.stringify({ startZ, endZ, speed }))
  assert.ok(speed < 0.001, JSON.stringify({ speed, velocity: chassis.linvel() }))
  assert.ok(session.components.every(component => component.body.isSleeping()), 'perturbed passive chassis should settle back to sleep')
  session.dispose()
})

test('passive settling layer owns tire and torque reset behavior', () => {
  assert.equal(window.BrickLabPhysicsStability?.version, 'physics-stability-v4')
  assert.equal(window.BrickLabPhysicsStability?.tireOwner, 'passive-settling-tire-v4')
  assert.equal(window.BrickLabPhysicsStability?.sleepOwner, 'passive-sleep-v1')
  assert.equal(PhysicsSession.prototype.resetCustomTorques.__bricklabOwner, 'passive-sleep-v1')
})

after(() => dom.happyDOM.close())
