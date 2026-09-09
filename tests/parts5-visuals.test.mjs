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
await import('../parts3/parts-3-steering-upgrade.js')
await import('../parts4/mechanical-driveline-v1.js')
await import('../parts4/steering-suspension-v1.js')
await import('../parts5/visual-overhaul-v1.js')
await import('../parts5/visual-refinement-v2.js')
await import('../parts5/driveline-refinement-v2.js')
await import('../parts5/structural-refinement-v2.js')

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

test('every wheel uses refined PARTS-5 tyre/rim geometry and canonical dimensions', () => {
  for (const id of wheelIds) {
    const part = findPart(id)
    assert.ok(part, `${id} exists`)
    assert.equal(part.visualQuality, 'parts-5-refined-profiled-wheel-v2', `${id} upgraded`)
    assert.equal(part.geometryMetricsVersion, PARTS5_GEOMETRY_VERSION)
    assert.ok(part.mechanics.wheel.radius > 0)
    assert.ok(part.mechanics.wheel.width > 0)
    assert.equal(part.dimensions.radiusStud, part.mechanics.wheel.radius)
    assert.equal(part.dimensions.widthStud, part.mechanics.wheel.width)

    const object = part.create(part.defaultColor)
    const check = geometryIsFinite(object)
    assert.ok(check.meshes >= 7, `${id} has separate carcass/rim/hub/dish details`)
    assert.equal(check.finite, true, `${id} geometry finite`)

    let latheCount = 0
    let instancedCount = 0
    object.traverse(child => {
      if (child.isMesh && child.geometry?.type === 'LatheGeometry') latheCount += 1
      if (child.isInstancedMesh) instancedCount += 1
    })
    assert.equal(latheCount, 1, `${id} has one smooth profiled tyre carcass`)
    assert.ok(instancedCount >= 1, `${id} uses instanced tread instead of many loose meshes`)

    const size = bounds(object)
    const intendedDiameter = part.mechanics.wheel.radius * 2
    assert.ok(size.y >= intendedDiameter * 0.90 && size.y <= intendedDiameter * 1.16, `${id} vertical diameter tracks wheel radius`)
    assert.ok(size.z >= intendedDiameter * 0.90 && size.z <= intendedDiameter * 1.16, `${id} radial depth tracks wheel radius`)
    assert.ok(size.x >= part.mechanics.wheel.width * 0.75 && size.x <= part.mechanics.wheel.width * 1.50, `${id} axial width tracks mechanics.wheel.width`)
  }
})

test('spur gear family shares one module and refined involute-like tooth source', () => {
  for (const teeth of [8, 12, 16, 20, 24, 36, 40]) {
    const part = findPart(`gear-${teeth}`)
    assert.ok(part)
    assert.equal(part.mechanics.gear.module, GEAR_MODULE_STUD)
    assert.equal(part.mechanics.gear.pitchRadius, teeth / 16)
    assert.equal(part.dimensions.pitchRadiusStud, teeth / 16)
    assert.equal(part.visualQuality, 'parts-5-involute-spur-v2')
    assert.equal(part.geometryMetricsVersion, PARTS5_GEOMETRY_VERSION)
    const object = part.create(part.defaultColor)
    const check = geometryIsFinite(object)
    assert.equal(check.finite, true)
    assert.ok(check.meshes >= 4, `${teeth}T has toothed body, real-bore hub and face details`)
  }
})

test('bevel gears use refined conical body plus instanced tapered teeth', () => {
  for (const teeth of [12, 20]) {
    const part = findPart(`bevel-gear-${teeth}`)
    assert.ok(part)
    assert.equal(part.mechanics.gear.kind, 'bevel')
    assert.equal(part.mechanics.gear.module, GEAR_MODULE_STUD)
    assert.equal(part.mechanics.gear.pitchRadius, teeth / 16)
    assert.equal(part.visualQuality, 'parts-5-refined-bevel-v2')
    const object = part.create(part.defaultColor)
    const check = geometryIsFinite(object)
    assert.equal(check.finite, true)
    assert.ok(check.meshes >= 4)
    let instanced = 0
    object.traverse(child => { if (child.isInstancedMesh) instanced += 1 })
    assert.ok(instanced >= 1, 'bevel teeth are one instanced tapered tooth family')
  }
})

test('liftarms and Technic bricks use the final molded/hollow factories', () => {
  for (const [id, expectedQuality] of [
    ['beam-7', 'parts-5-liftarm-molded-v2'],
    ['thin-beam-5', 'parts-5-thin-liftarm-molded-v2'],
    ['technic-brick-1x4', 'parts-5-hollow-technic-brick-v2'],
  ]) {
    const part = findPart(id)
    assert.ok(part)
    assert.equal(part.visualQuality, expectedQuality)
    assert.ok(part.connectors.length > 0)
    const object = part.create(part.defaultColor)
    const check = geometryIsFinite(object)
    assert.equal(check.finite, true, `${id} geometry finite`)
    assert.ok(check.meshes >= 3, `${id} has molded detail beyond one flat extrusion`)
  }
})

test('axles, pins, bushes and coupler retain real mechanical bores/details', () => {
  for (const [id, expectedQuality] of [
    ['axle-9', 'parts-5-cross-axle'],
    ['pin', 'parts-5-molded-pin'],
    ['bush', 'parts-5-true-cross-bore-v2'],
    ['half-bush', 'parts-5-true-cross-bore-v2'],
    ['axle-coupler', 'parts-5-true-cross-bore-v2'],
  ]) {
    const part = findPart(id)
    assert.ok(part)
    assert.equal(part.visualQuality, expectedQuality)
    const check = geometryIsFinite(part.create(part.defaultColor))
    assert.equal(check.finite, true, `${id} geometry finite`)
  }
})

test('steering and suspension high-visibility parts use refined factories', () => {
  for (const [id, expectedQuality] of [
    ['steering-tie-rod-5', 'parts-5-steering-link-v2'],
    ['wheel-hub', 'parts-5-wheel-hub-v2'],
    ['steering-knuckle', 'parts-5-steering-knuckle-v2'],
    ['steering-rack-guide', 'parts-5-rack-guide-v2'],
    ['steering-rack-7', 'parts-5-rack-v2'],
    ['shock-body-5', 'parts-5-shock-body-v2'],
    ['shock-rod-5', 'parts-5-helical-spring-v2'],
  ]) {
    const part = findPart(id)
    assert.ok(part)
    assert.equal(part.visualQuality, expectedQuality)
    const check = geometryIsFinite(part.create(part.defaultColor))
    assert.equal(check.finite, true, `${id} geometry finite`)
  }
})

test('PARTS-4 articulated driveline no longer uses primitive placeholder factories', () => {
  for (const [id, expectedQuality] of [
    ['universal-joint-30', 'parts-5-forked-cardan-v2'],
    ['cv-joint-30', 'parts-5-caged-cv-v2'],
    ['worm-drive-8', 'parts-5-open-worm-drive-v2'],
  ]) {
    const part = findPart(id)
    assert.ok(part)
    assert.equal(part.visualQuality, expectedQuality)
    const check = geometryIsFinite(part.create(part.defaultColor))
    assert.equal(check.finite, true, `${id} geometry finite`)
    assert.ok(check.meshes >= 4, `${id} has a multi-piece mechanical silhouette`)
  }
})

assert.equal(new Set(PARTS.map(part => part.id)).size, PARTS.length, 'PARTS-5 does not duplicate catalog ids')
await dom.happyDOM.close()
