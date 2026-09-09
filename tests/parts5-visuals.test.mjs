import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = callback => { callback(0); return 0 }

await import('../basic-parts-pack.js')
await import('../technic-parts-pack-v2.js')
await import('../lab-parts.js')
await import('../vehicle-parts-v1.js')
await import('../parts3/mechanical-parts-pack-v3.js')
await import('../parts3/parts-3-extra-v1.js')
await import('../parts3/parts-3-wheel-dimensions.js')
await import('../parts4/mechanical-driveline-v1.js')
await import('../parts4/steering-suspension-v1.js')
await import('../parts5/visual-overhaul-v1.js')

const { PARTS, findPart } = await import('../parts.js')
const { GEAR_MODULE_STUD, PARTS5_GEOMETRY_VERSION } = await import('../parts5/part-geometry-metrics-v1.js')

function geometryIsFinite(object) {
  let meshes = 0
  let finite = true
  object.traverse(child => {
    if (!child.isMesh) return
    meshes += 1
    const position = child.geometry?.getAttribute?.('position')
    if (!position) {
      finite = false
      return
    }
    for (let i = 0; i < position.array.length; i += 1) {
      if (!Number.isFinite(position.array[i])) {
        finite = false
        break
      }
    }
  })
  return { meshes, finite }
}

function bounds(object) {
  object.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
}

const wheelIds = [
  'wheel', 'wheel-small', 'wheel-medium', 'wheel-road',
  'wheel-narrow', 'wheel-offroad-large', 'wheel-tractor',
]

test('every wheel uses the PARTS-5 profiled tyre/rim builder and canonical dimensions', () => {
  for (const id of wheelIds) {
    const part = findPart(id)
    assert.ok(part, `${id} exists`)
    assert.equal(part.visualQuality, 'parts-5-profiled-tyre-rim', `${id} upgraded`)
    assert.equal(part.geometryMetricsVersion, PARTS5_GEOMETRY_VERSION)
    assert.ok(part.mechanics.wheel.radius > 0)
    assert.ok(part.mechanics.wheel.width > 0)
    assert.equal(part.dimensions.radiusStud, part.mechanics.wheel.radius)
    assert.equal(part.dimensions.widthStud, part.mechanics.wheel.width)

    const object = part.create(part.defaultColor)
    const check = geometryIsFinite(object)
    assert.ok(check.meshes >= 5, `${id} has separate tyre/rim/hub details`)
    assert.equal(check.finite, true, `${id} geometry finite`)

    let latheCount = 0
    object.traverse(child => {
      if (child.isMesh && child.geometry?.type === 'LatheGeometry') latheCount += 1
    })
    assert.equal(latheCount, 1, `${id} has one profiled LatheGeometry tyre carcass`)

    const size = bounds(object)
    const intendedDiameter = part.mechanics.wheel.radius * 2
    assert.ok(size.y >= intendedDiameter * 0.90 && size.y <= intendedDiameter * 1.16, `${id} vertical diameter tracks wheel radius`)
    assert.ok(size.z >= intendedDiameter * 0.90 && size.z <= intendedDiameter * 1.16, `${id} radial depth tracks wheel radius`)
    assert.ok(size.x >= part.mechanics.wheel.width * 0.75 && size.x <= part.mechanics.wheel.width * 1.50, `${id} axial width tracks mechanics.wheel.width`)
  }
})

test('spur gear family shares one module/pitch source and finite real-hole geometry', () => {
  for (const teeth of [8, 12, 16, 20, 24, 36, 40]) {
    const part = findPart(`gear-${teeth}`)
    assert.ok(part)
    assert.equal(part.mechanics.gear.module, GEAR_MODULE_STUD)
    assert.equal(part.mechanics.gear.pitchRadius, teeth / 16)
    assert.equal(part.dimensions.pitchRadiusStud, teeth / 16)
    assert.equal(part.visualQuality, 'parts-5-module-tooth-profile')
    assert.equal(part.geometryMetricsVersion, PARTS5_GEOMETRY_VERSION)
    const object = part.create(part.defaultColor)
    const check = geometryIsFinite(object)
    assert.equal(check.finite, true)
    assert.ok(check.meshes >= 2)
  }
})

test('bevel gears use the dedicated PARTS-5 pitch-cone tooth builder', () => {
  for (const teeth of [12, 20]) {
    const part = findPart(`bevel-gear-${teeth}`)
    assert.ok(part)
    assert.equal(part.mechanics.gear.kind, 'bevel')
    assert.equal(part.mechanics.gear.module, GEAR_MODULE_STUD)
    assert.equal(part.mechanics.gear.pitchRadius, teeth / 16)
    assert.equal(part.visualQuality, 'parts-5-bevel-cone-teeth')
    const object = part.create(part.defaultColor)
    const check = geometryIsFinite(object)
    assert.equal(check.finite, true)
    assert.ok(check.meshes >= teeth + 2, 'bevel has a cone body, individual tapered teeth and axle-hole hub')
  }
})

test('representative beam, Technic brick, axle and pin are upgraded without changing connectors', () => {
  for (const [id, expectedQuality] of [
    ['beam-7', 'parts-5-clean-through-holes'],
    ['technic-brick-1x4', 'parts-5-clean-through-holes'],
    ['axle-9', 'parts-5-cross-axle'],
    ['pin', 'parts-5-molded-pin'],
  ]) {
    const part = findPart(id)
    assert.ok(part)
    assert.equal(part.visualQuality, expectedQuality)
    assert.ok(part.connectors.length > 0)
    const object = part.create(part.defaultColor)
    const check = geometryIsFinite(object)
    assert.equal(check.finite, true, `${id} geometry finite`)
  }
})

assert.equal(new Set(PARTS.map(part => part.id)).size, PARTS.length, 'PARTS-5 does not duplicate catalog ids')
await dom.happyDOM.close()
