import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS', 'Event']) {
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
await import('../parts5/detail-refinement-v3.js')
await import('../parts6/realism-refinement-v1.js')
await import('../parts6/precision-refinement-v2.js')
await import('../parts6/mechanical-realism-v1.js')
await import('../parts6/nominal-dimension-fidelity-v1.js')
await import('../parts6/connector-fidelity-v1.js')
await import('../parts6/interface-fit-refinement-v2.js')
await import('../parts6/interface-physics-safety-v1.js')

const { PARTS, findPart } = await import('../parts.js')

function finiteGeometry(object) {
  let meshes = 0
  let instanced = 0
  let finite = true
  object.traverse(child => {
    if (!child.isMesh) return
    meshes += 1
    if (child.isInstancedMesh) instanced += 1
    const position = child.geometry?.getAttribute?.('position')
    if (!position) { finite = false; return }
    for (const value of position.array) {
      if (!Number.isFinite(value)) { finite = false; break }
    }
  })
  return { meshes, instanced, finite }
}

function sizeOf(object) {
  object.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
}

test('PARTS-6 final owners use measured nominal dimensions for core molded families', () => {
  const expected = new Map([
    ['beam-7', 'parts-6-nominal-4p8mm-hole-liftarm'],
    ['thin-beam-5', 'parts-6-nominal-4p8mm-hole-thin-liftarm'],
    ['technic-brick-1x4', 'parts-6-nominal-4p8mm-hole-technic-brick'],
    ['technic-frame-5x7', 'parts-6-nominal-4p8mm-hole-frame'],
    ['axle-9', 'parts-6-nominal-4p78mm-cross-axle'],
    ['pin', 'parts-6-nominal-friction-pin'],
    ['pin-frictionless', 'parts-6-nominal-frictionless-pin'],
    ['bush', 'parts-6-nominal-cross-bore-bush'],
    ['half-bush', 'parts-6-nominal-cross-bore-bush'],
    ['axle-coupler', 'parts-6-nominal-cross-bore-coupler'],
    ['gear-24', 'parts-6-measured-tip-involute-gear'],
    ['bevel-gear-20', 'parts-6-bevel-gear-realism'],
    ['wheel-road', 'parts-6-road-wheel-v2'],
    ['wheel-offroad-large', 'parts-6-offroad-wheel-v2'],
    ['wheel-tractor', 'parts-6-tractor-wheel-v2'],
    ['steering-base', 'parts-6-steering-base-molded'],
    ['steering-knuckle', 'parts-6-steering-knuckle-pin-fidelity-v2'],
    ['steering-tie-rod-5', 'parts-6-tie-rod-nominal-eye-fidelity-v2'],
    ['wheel-hub', 'parts-6-wheel-hub-bearing-port-fidelity-v2'],
    ['shock-body-5', 'parts-6-shock-body-realism'],
    ['shock-rod-5', 'parts-6-metal-coil-shock'],
    ['universal-joint-30', 'parts-6-pom-universal-joint'],
    ['cv-joint-30', 'parts-6-compact-cv-joint'],
  ])
  for (const [id, quality] of expected) {
    const part = findPart(id)
    assert.ok(part, `${id} exists`)
    assert.equal(part.visualQuality, quality, `${id} final visual owner`)
    const result = finiteGeometry(part.create(part.defaultColor))
    assert.equal(result.finite, true, `${id} finite geometry`)
    assert.ok(result.meshes >= 2, `${id} is not a one-primitive placeholder`)
  }
})

test('liftarms keep true 4.8 mm-class holes and a molded waisted silhouette', () => {
  const part = findPart('beam-7')
  const object = part.create(part.defaultColor)
  const size = sizeOf(object)
  assert.ok(size.x > 6.7 && size.x < 7.1)
  assert.ok(size.y > 0.84 && size.y < 1.0)
  assert.ok(size.z > 0.70 && size.z < 0.86)
  assert.equal(part.connectors.filter(item => item.type === 'pin-hole').length, 7)
  assert.equal(globalThis.BrickLabParts6NominalDimensions.nominal.pinHoleRadius, 0.3)
})

test('Technic brick stays hollow and has aligned nominal side-hole bosses', () => {
  const part = findPart('technic-brick-1x4')
  const object = part.create(part.defaultColor)
  const result = finiteGeometry(object)
  assert.ok(result.meshes >= 14, 'side shells, studs, bosses, bores and internal ribs are separate molded features')
  assert.equal(part.connectors.filter(item => item.type === 'pin-hole').length, 3)
  assert.equal(part.connectors.filter(item => item.type === 'stud').length, 4)
})

test('spur gears preserve canonical pitch while using measured outer-tip geometry', () => {
  for (const teeth of [8, 12, 16, 20, 24, 36, 40]) {
    const part = findPart(`gear-${teeth}`)
    assert.equal(part.mechanics.gear.pitchRadius, teeth / 16)
    assert.equal(part.visualQuality, 'parts-6-measured-tip-involute-gear')
    const result = finiteGeometry(part.create(part.defaultColor))
    assert.equal(result.finite, true)
    if (teeth >= 16) assert.ok(result.meshes >= 6, `${teeth}T has separate tooth ring, hub and molded spokes`)
  }
})

test('wheel families keep authoritative radius/width while gaining detailed tyre/rim and keyed interfaces', () => {
  for (const id of ['wheel-small', 'wheel-narrow', 'wheel-road', 'wheel-medium', 'wheel', 'wheel-offroad-large', 'wheel-tractor']) {
    const part = findPart(id)
    const object = part.create(part.defaultColor)
    const result = finiteGeometry(object)
    assert.equal(result.finite, true)
    assert.ok(result.instanced >= 1, `${id} tread is instanced`)
    assert.ok(result.meshes >= 8, `${id} has tyre, bead lips, dish, spokes and keyed hub`)
    const size = sizeOf(object)
    assert.ok(size.x >= part.mechanics.wheel.width * 0.72 && size.x <= part.mechanics.wheel.width * 1.55)
    assert.ok(size.y >= part.mechanics.wheel.radius * 1.80 && size.y <= part.mechanics.wheel.radius * 2.20)
    assert.equal(part.interfaceFidelity, 'parts-6-interface-fit-refinement-v2')
  }
})

test('steering and suspension realism keeps connector identities intact', () => {
  const base = findPart('steering-base')
  const knuckle = findPart('steering-knuckle')
  const tie = findPart('steering-tie-rod-5')
  const body = findPart('shock-body-5')
  const rod = findPart('shock-rod-5')
  assert.ok(base.connectors.some(item => item.id === 'pivot-hole' && item.type === 'pin-hole'))
  assert.ok(knuckle.connectors.some(item => item.id === 'wheel-bearing' && item.type === 'pin-hole'))
  assert.ok(knuckle.connectors.some(item => item.id === 'steering-arm' && item.type === 'pin'))
  assert.equal(tie.connectors.filter(item => item.type === 'pin-hole').length, 2)
  assert.ok(body.connectors.some(item => item.id === 'rail' && item.type === 'slider-rail'))
  assert.ok(rod.connectors.some(item => item.id === 'slider' && item.type === 'slider'))
})

test('connector-fidelity and interface-fit wrappers visibly distinguish pin, bore and axle ports', () => {
  for (const id of ['steering-knuckle', 'wheel-hub', 'steering-tie-rod-5']) {
    const object = findPart(id).create(findPart(id).defaultColor)
    let connectorVisuals = 0
    let interfaceVisuals = 0
    object.traverse(child => {
      if (child.userData?.parts6ConnectorVisual) connectorVisuals += 1
      if (child.userData?.parts6InterfaceFeature) interfaceVisuals += 1
    })
    assert.ok(connectorVisuals >= 1, `${id} has connector-semantic visual detail`)
    if (id !== 'steering-tie-rod-5') assert.ok(interfaceVisuals >= 1, `${id} has nominal interface detail`)
  }
})

test('PARTS-6 interface detail remains excluded from bounds-derived physics', async () => {
  const realism = await import('../parts6/realism-refinement-v1.js')
  const precision = await import('../parts6/precision-refinement-v2.js')
  const mechanical = await import('../parts6/mechanical-realism-v1.js')
  const nominal = await import('../parts6/nominal-dimension-fidelity-v1.js')
  const fidelity = await import('../parts6/connector-fidelity-v1.js')
  const fit = await import('../parts6/interface-fit-refinement-v2.js')
  const safety = await import('../parts6/interface-physics-safety-v1.js')
  assert.equal(realism.PARTS6_REALISM_VERSION, 'parts-6-realism-refinement-v1')
  assert.equal(precision.PARTS6_PRECISION_VERSION, 'parts-6-precision-refinement-v2')
  assert.equal(mechanical.PARTS6_MECHANICAL_REALISM_VERSION, 'parts-6-mechanical-realism-v1')
  assert.equal(nominal.PARTS6_NOMINAL_DIMENSION_VERSION, 'parts-6-nominal-dimension-fidelity-v1')
  assert.equal(fidelity.PARTS6_CONNECTOR_FIDELITY_VERSION, 'parts-6-connector-fidelity-v2')
  assert.equal(fit.PARTS6_INTERFACE_FIT_VERSION, 'parts-6-interface-fit-refinement-v2')
  assert.equal(safety.PARTS6_INTERFACE_PHYSICS_SAFETY_VERSION, 'parts-6-interface-physics-safety-v1')
  const object = findPart('wheel-hub').create(findPart('wheel-hub').defaultColor)
  let interfaceMeshes = 0
  let unsafe = 0
  function walk(node, inherited = false) {
    const active = inherited || Boolean(node.userData?.parts6InterfaceFeature)
    if (active && node.isMesh) {
      interfaceMeshes += 1
      if (!node.userData.physicsIgnore) unsafe += 1
    }
    for (const child of node.children ?? []) walk(child, active)
  }
  walk(object)
  assert.ok(interfaceMeshes >= 2)
  assert.equal(unsafe, 0)
})

assert.equal(new Set(PARTS.map(part => part.id)).size, PARTS.length, 'PARTS-6 does not duplicate catalog ids')
await dom.happyDOM.close()
