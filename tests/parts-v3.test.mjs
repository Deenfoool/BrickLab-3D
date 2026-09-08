import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

if (!globalThis.window) globalThis.window = globalThis
if (!globalThis.CustomEvent) globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail } }
if (!globalThis.Event) globalThis.Event = class Event { constructor(type) { this.type = type } }
window.dispatchEvent ??= () => true
const storage = new Map()
globalThis.localStorage ??= {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
}
globalThis.document ??= { documentElement: { lang: 'en' }, body: { dataset: {} }, getElementById: () => null }
globalThis.requestAnimationFrame ??= callback => callback(0)

const { PARTS, findPart } = await import('../parts.js')
await import('../technic-parts-pack-v2.js')
await import('../vehicle-parts-v1.js')
await import('../parts3/mechanical-parts-pack-v3.js')
await import('../parts3/parts-3-extra-v1.js')
await import('../parts3/parts-3-visual-normalize.js')
await import('../parts3/parts-3-steering-upgrade.js')
await import('../physical-parts.js')
await import('../parts3/parts-3-physics.js')

const newIds = [
  'axle-2', 'axle-9', 'bush', 'half-bush', 'steering-tie-rod-5', 'wheel-hub',
  'wheel-narrow', 'wheel-offroad-large', 'wheel-tractor',
  'beam-3', 'beam-7', 'beam-11', 'technic-brick-1x4', 'technic-frame-5x7', 'pin-frictionless',
]

test('PARTS-3 registers its mechanical inventory exactly once', () => {
  for (const id of newIds) assert.equal(PARTS.filter(part => part.id === id).length, 1, `${id} is unique`)
})

test('PARTS-3 connector axes are normalized and connector ids are unique', () => {
  for (const id of newIds) {
    const part = findPart(id)
    assert.ok(part, `${id} exists`)
    const ids = new Set()
    for (const connector of part.connectors ?? []) {
      assert.ok(!ids.has(connector.id), `${id}/${connector.id} is unique`)
      ids.add(connector.id)
      assert.ok(Math.abs(Math.hypot(...connector.axis) - 1) < 1e-9, `${id}/${connector.id} axis normalized`)
    }
  }
})

test('new tyre sizes carry real wheel physics metadata', () => {
  const narrow = findPart('wheel-narrow')
  const offroad = findPart('wheel-offroad-large')
  const tractor = findPart('wheel-tractor')
  assert.equal(narrow.physics.collisionClass, 'wheel')
  assert.equal(offroad.physics.collisionClass, 'wheel')
  assert.equal(tractor.physics.collisionClass, 'wheel')
  assert.ok(narrow.mechanics.wheel.radius < offroad.mechanics.wheel.radius)
  assert.ok(offroad.mechanics.wheel.radius < tractor.mechanics.wheel.radius)
  assert.ok(narrow.mechanics.wheel.tire.rollingResistanceScale < tractor.mechanics.wheel.tire.rollingResistanceScale)
})

test('PARTS-3 tyre visual width is applied along the axle axis, not the tyre radius', () => {
  const object = findPart('wheel-offroad-large').create(0xb7bcc3)
  assert.equal(object.userData.parts3WheelProfileNormalized, true)
  const tyre = object.children.find(child => child.geometry?.type === 'TorusGeometry' && Math.abs(child.scale.z - 1) > 1e-6)
  assert.ok(tyre, 'scaled tyre torus found')
  assert.ok(Math.abs(tyre.scale.x - 1) < 1e-9)
  assert.ok(tyre.scale.z > 1)
})

test('new structural and connector inventory has explicit physical classes', () => {
  assert.equal(findPart('technic-frame-5x7').physics.collisionClass, 'structure')
  assert.equal(findPart('pin-frictionless').physics.collisionClass, 'mechanical')
  assert.equal(findPart('wheel-hub').physics.collisionClass, 'mechanical')
  assert.ok(findPart('technic-frame-5x7').physics.massKg > 0)
})

test('steering knuckle, tie rod and hub expose compatible physical linkage connectors', () => {
  const knuckle = findPart('steering-knuckle')
  const arm = knuckle.connectors.find(item => item.id === 'steering-arm')
  assert.ok(arm)
  assert.equal(arm.type, 'pin')
  assert.deepEqual(arm.axis, [0, 1, 0])

  const tieRod = findPart('steering-tie-rod-5')
  assert.equal(tieRod.connectors.filter(item => item.type === 'pin-hole').length, 2)
  assert.ok(tieRod.connectors.every(item => item.axis[1] === 1))

  const hub = findPart('wheel-hub')
  assert.equal(hub.connectors.find(item => item.id === 'bearing')?.type, 'axle')
  assert.equal(hub.connectors.find(item => item.id === 'wheel-stub')?.type, 'axle')
  assert.equal(knuckle.connectors.find(item => item.id === 'wheel-bearing')?.type, 'pin-hole')
})

test('upgraded representative parts create finite Three.js geometry', () => {
  for (const id of [
    'beam-8', 'beam-11', 'technic-brick-1x8', 'technic-brick-1x4', 'technic-frame-5x7',
    'axle-8', 'gear-24', 'wheel-medium', 'wheel-hub', 'pin-frictionless', 'steering-knuckle',
  ]) {
    const part = findPart(id)
    const object = part.create(part.defaultColor)
    object.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    assert.ok(Number.isFinite(size.x + size.y + size.z), `${id} bounds finite`)
    assert.ok(size.length() > 0.1, `${id} has visible geometry`)
  }
})
