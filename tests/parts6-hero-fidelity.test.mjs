import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'

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

const { findPart } = await import('../parts.js')

const targetIds = [
  'wheel-small', 'wheel-narrow', 'wheel-road', 'wheel-medium', 'wheel', 'wheel-offroad-large', 'wheel-tractor',
  'bevel-gear-12', 'bevel-gear-20',
  'universal-joint-30', 'cv-joint-30', 'gearbox-fnr', 'open-differential',
]

const metadataBefore = new Map(targetIds.map(id => {
  const part = findPart(id)
  return [id, JSON.stringify({ connectors: part?.connectors ?? null, mechanics: part?.mechanics ?? null, physics: part?.physics ?? null })]
}))

const heroModule = await import('../parts6/hero-mechanical-fidelity-v2.js')

function features(object, name = null) {
  const result = []
  object.traverse(child => {
    const value = child.userData?.parts6HeroFeature
    if (value && (!name || value === name)) result.push(child)
  })
  return result
}

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

test('hero fidelity pass preserves connector, mechanics and physics metadata exactly', () => {
  for (const id of targetIds) {
    const part = findPart(id)
    assert.equal(
      JSON.stringify({ connectors: part.connectors, mechanics: part.mechanics, physics: part.physics ?? null }),
      metadataBefore.get(id),
      `${id} metadata preserved`,
    )
  }
})

test('all wheel families use profiled carcasses, family tread and molded tapered spokes', () => {
  const rows = new Map()
  for (const id of ['wheel-small', 'wheel-narrow', 'wheel-road', 'wheel-medium', 'wheel', 'wheel-offroad-large', 'wheel-tractor']) {
    const part = findPart(id)
    assert.match(part.visualQuality, /^parts-6-wheel-fidelity-v3-/)
    const object = part.create(part.defaultColor)
    const result = finiteGeometry(object)
    assert.equal(result.finite, true, `${id} finite`)
    assert.ok(result.meshes >= 10, `${id} detailed tyre/rim assembly`)
    assert.ok(result.instanced >= 1, `${id} instanced tread`)
    assert.ok(features(object, 'profiled-tyre-carcass').length >= 1)
    assert.ok(features(object, 'rim-barrel').length >= 1)
    assert.ok(features(object, 'recessed-rim-dish').length >= 2)
    assert.ok(features(object, 'tapered-spoke').length >= 5)
    assert.ok(features(object, 'keyed-hub-core').length >= 1)
    assert.ok(features(object).some(node => /-tread$/.test(node.userData.parts6HeroFeature)), `${id} family tread marker`)
    assert.equal(object.userData.wheelFidelity.radiusStud, part.mechanics.wheel.radius)
    assert.equal(object.userData.wheelFidelity.widthStud, part.mechanics.wheel.width)
    rows.set(object.userData.wheelFidelity.family, object.userData.wheelFidelity.treadRows)
  }
  assert.equal(rows.get('tractor'), 2)
  assert.equal(rows.get('offroad'), 3)
  assert.equal(rows.get('road'), 3)
  assert.equal(rows.get('narrow'), 1)
})

test('bevel gears keep canonical pitch while gaining tapered teeth and open molded webs', () => {
  for (const teeth of [12, 20]) {
    const part = findPart(`bevel-gear-${teeth}`)
    assert.equal(part.visualQuality, 'parts-6-bevel-fidelity-v3')
    assert.equal(part.mechanics.gear.pitchRadius, teeth / 16)
    const object = part.create(part.defaultColor)
    const result = finiteGeometry(object)
    assert.equal(result.finite, true)
    assert.ok(result.instanced >= 1)
    assert.ok(features(object, 'conical-gear-rim').length >= 1)
    assert.ok(features(object, 'tapered-bevel-teeth').length >= 1)
    assert.ok(features(object, 'bevel-keyed-hub').length >= 1)
    assert.ok(features(object, 'bevel-molded-web').length >= (teeth === 12 ? 4 : 6))
    assert.equal(object.userData.bevelFidelity.teeth, teeth)
    assert.equal(object.userData.bevelFidelity.pitchRadiusStud, teeth / 16)
    assert.equal(object.userData.bevelFidelity.pressureAngleDeg, 20)
  }
})

test('Cardan and CV refinements decorate prior articulated bounds instead of replacing mechanics', () => {
  const cardan = findPart('universal-joint-30')
  const cardanObject = cardan.create(cardan.defaultColor)
  assert.equal(cardan.visualQuality, 'parts-6-cardan-fidelity-v3')
  assert.ok(features(cardanObject, 'cardan-bearing-cap').length >= 4)
  assert.ok(features(cardanObject, 'cardan-seal-ring').length >= 4)
  assert.equal(cardanObject.userData.heroDriveline, 'cardan-bearing-caps-and-collars')

  const cv = findPart('cv-joint-30')
  const cvObject = cv.create(cv.defaultColor)
  assert.equal(cv.visualQuality, 'parts-6-rzeppa-cv-fidelity-v3')
  assert.ok(features(cvObject, 'cv-input-bell-rib').length >= 3)
  assert.ok(features(cvObject, 'cv-output-bell-rib').length >= 3)
  assert.ok(features(cvObject, 'cv-cage-retainer').length >= 1)
  assert.equal(cvObject.userData.heroDriveline, 'rzeppa-bell-ribs-and-cage-retainer')

  for (const object of [cardanObject, cvObject]) {
    for (const node of features(object)) assert.equal(node.userData.physicsIgnore, true)
  }
})

test('gearbox is a split ribbed casting with retained explicit collider profile', () => {
  const part = findPart('gearbox-fnr')
  assert.equal(part.visualQuality, 'parts-6-gearbox-housing-fidelity-v3')
  assert.ok(part.physics?.colliderProfile?.specs?.length > 0)
  const object = part.create(part.defaultColor)
  assert.equal(finiteGeometry(object).finite, true)
  assert.equal(features(object, 'gearbox-shell-half').length, 2)
  assert.equal(features(object, 'gearbox-bearing-boss').length, 2)
  assert.ok(features(object, 'gearbox-casting-rib').length >= 8)
  assert.ok(features(object, 'gearbox-case-bolt').length >= 8)
  assert.equal(features(object, 'selector-detent').length, 3)
  assert.equal(object.userData.gearboxFidelity.splitShell, true)
})

test('open differential exposes ring carrier, spider and bearing architecture', () => {
  const part = findPart('open-differential')
  assert.equal(part.visualQuality, 'parts-6-open-differential-fidelity-v3')
  assert.ok(part.physics?.colliderProfile?.specs?.length > 0)
  const object = part.create(part.defaultColor)
  const result = finiteGeometry(object)
  assert.equal(result.finite, true)
  assert.ok(result.instanced >= 1)
  assert.equal(features(object, 'differential-ring-carrier').length, 1)
  assert.equal(features(object, 'differential-ring-teeth').length, 1)
  assert.equal(features(object, 'differential-side-hub').length, 2)
  assert.equal(features(object, 'open-carrier-rib').length, 4)
  assert.equal(features(object, 'differential-spider-gear').length, 4)
  assert.equal(features(object, 'differential-input-boss').length, 1)
  assert.equal(object.userData.differentialFidelity.openCarrier, true)
})

test('hero module advertises visual-only ownership boundaries', () => {
  assert.equal(heroModule.PARTS6_HERO_MECHANICAL_FIDELITY_VERSION, 'parts-6-hero-mechanical-fidelity-v2')
  const state = globalThis.BrickLabParts6HeroMechanicalFidelity
  assert.ok(state.upgraded.includes('wheel-tractor'))
  assert.ok(state.upgraded.includes('bevel-gear-20'))
  assert.ok(state.upgraded.includes('universal-joint-30'))
  assert.ok(state.upgraded.includes('open-differential'))
  assert.match(state.physics, /metadata-driven/)
  assert.match(state.physics, /explicit collider profiles/)
})

await dom.happyDOM.close()
