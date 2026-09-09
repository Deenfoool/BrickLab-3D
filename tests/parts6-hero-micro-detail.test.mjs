import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
await import('../parts6/hero-mechanical-fidelity-v2.js')
await import('../parts6/fine-mechanical-detail-v3.js')
await import('../parts6/core-molded-fidelity-v4.js')

const { findPart } = await import('../parts.js')

const TARGETS = [
  'wheel-small', 'wheel-narrow', 'wheel-road', 'wheel-medium', 'wheel', 'wheel-offroad-large', 'wheel-tractor',
  'bevel-gear-12', 'bevel-gear-20',
  'universal-joint-30', 'cv-joint-30', 'gearbox-fnr', 'open-differential',
]

function snapshot(part) {
  return JSON.stringify({
    connectors: part?.connectors ?? null,
    mechanics: part?.mechanics ?? null,
    physics: part?.physics ?? null,
  })
}

const before = new Map(TARGETS.map(id => [id, snapshot(findPart(id))]))
const source = await readFile(new URL('../parts6/hero-micro-detail-v5.js', import.meta.url), 'utf8')
const microModule = await import('../parts6/hero-micro-detail-v5.js')

function features(object) {
  const names = []
  object.traverse(node => {
    if (node.userData?.parts6HeroMicroFeature) names.push(node.userData.parts6HeroMicroFeature)
  })
  return names
}

function assertVisualOnly(id) {
  const part = findPart(id)
  const object = part.create(part.defaultColor)
  let count = 0
  object.traverse(node => {
    if (!node.userData?.parts6HeroMicroFeature) return
    count += 1
    assert.equal(node.userData.physicsIgnore, true, `${id}:${node.userData.parts6HeroMicroFeature} stays visual-only`)
  })
  assert.ok(count > 0, `${id} exposes micro-detail meshes`)
  return new Set(features(object))
}

test('hero micro-detail preserves connector, mechanics and physics metadata', () => {
  for (const id of TARGETS) {
    const part = findPart(id)
    assert.ok(part, `missing target ${id}`)
    assert.equal(snapshot(part), before.get(id), `${id} metadata changed during micro-detail pass`)
    assert.match(part.visualQuality, /^parts-6-.*micro-detail-v5/)
  }
})

test('all hero micro-detail meshes are collider-independent', () => {
  for (const id of TARGETS) assertVisualOnly(id)
})

test('wheel families gain manufacturing cues without another fake tread system', () => {
  for (const id of ['wheel-small', 'wheel-narrow', 'wheel-road', 'wheel-medium', 'wheel', 'wheel-offroad-large', 'wheel-tractor']) {
    const names = assertVisualOnly(id)
    assert.ok(names.has('tyre-centre-mold-seam'), `${id} has subtle tyre parting seam`)
    assert.ok(names.has('sidewall-mold-vent-nibs'), `${id} has sparse sidewall vent nibs`)
    assert.ok(names.has('rim-hub-retaining-shoulder'), `${id} has molded hub retention shoulder`)
    assert.ok(names.has('rim-mold-witness'), `${id} has a rim mold witness`)
  }
})

test('bevel gears expose face shoulders, root relief and mold witnesses', () => {
  for (const id of ['bevel-gear-12', 'bevel-gear-20']) {
    const names = assertVisualOnly(id)
    assert.ok(names.has('bevel-hub-face-shoulder'))
    assert.ok(names.has('bevel-root-face-relief'))
    assert.ok(names.has('bevel-mold-witness'))
  }
})

test('Cardan and CV joints gain close-range retaining and cage detail', () => {
  const cardan = assertVisualOnly('universal-joint-30')
  assert.ok(cardan.has('cardan-trunnion-snap-ring'))
  assert.ok(cardan.has('cardan-input-yoke-parting-line'))
  assert.ok(cardan.has('cardan-output-yoke-parting-line'))

  const cv = assertVisualOnly('cv-joint-30')
  assert.ok(cv.has('cv-bell-parting-line'))
  assert.ok(cv.has('cv-cage-window-shadow'))
})

test('gearbox gains bearing hardware and service details', () => {
  const names = assertVisualOnly('gearbox-fnr')
  for (const name of ['gearbox-bearing-bolt', 'gearbox-fill-plug', 'gearbox-drain-plug', 'gearbox-breather-cap', 'gearbox-alignment-dowel']) {
    assert.ok(names.has(name), `gearbox missing ${name}`)
  }
})

test('differential gains bearing bolts, axle seals and spider-pin retainers', () => {
  const names = assertVisualOnly('open-differential')
  assert.ok(names.has('differential-bearing-bolt'))
  assert.ok(names.has('differential-axle-seal'))
  assert.ok(names.has('differential-spider-pin-retainer'))
  assert.ok(names.has('differential-carrier-mold-witness'))
})

test('micro-detail source remains a pure rendering layer', () => {
  assert.equal(microModule.PARTS6_HERO_MICRO_DETAIL_VERSION, 'parts-6-hero-micro-detail-v5')
  assert.doesNotMatch(source, /mechanics\s*:/)
  assert.doesNotMatch(source, /connectors\s*:/)
  assert.doesNotMatch(source, /colliderProfile\s*:/)
  assert.match(source, /physicsIgnore = true/)
  assert.match(source, /wheelMetrics/)
  assert.match(source, /gearMetrics/)
  assert.equal(globalThis.BrickLabParts6HeroMicroDetail.upgraded.length, TARGETS.length)
})

await dom.happyDOM.close()
