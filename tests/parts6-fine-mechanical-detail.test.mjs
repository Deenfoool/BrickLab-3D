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

const { findPart } = await import('../parts.js')

const TARGETS = [
  'steering-base',
  'steering-knuckle',
  'steering-tie-rod-5',
  'wheel-hub',
  'shock-body-5',
  'shock-rod-5',
  'suspension-arm-5',
  'bearing-block',
  'motor',
  'worm-drive-8',
  'rpm-sensor',
  'torque-sensor',
  'connector-triple',
  'connector-perpendicular',
  'connector-angle',
  'axle-pin',
]

function snapshot(part) {
  return JSON.stringify({
    connectors: part?.connectors ?? null,
    mechanics: part?.mechanics ?? null,
    physics: part?.physics ?? null,
  })
}

const before = new Map(TARGETS.map(id => [id, snapshot(findPart(id))]))
const source = await readFile(new URL('../parts6/fine-mechanical-detail-v3.js', import.meta.url), 'utf8')
const fineModule = await import('../parts6/fine-mechanical-detail-v3.js')

function fineFeatures(object) {
  const features = []
  object.traverse(node => {
    if (node.userData?.parts6FineFeature) features.push(node)
  })
  return features
}

function featureNames(object) {
  return new Set(fineFeatures(object).map(node => node.userData.parts6FineFeature))
}

test('fine detail pass preserves connector, mechanics and physics metadata', () => {
  for (const id of TARGETS) {
    const part = findPart(id)
    assert.ok(part, `missing target ${id}`)
    assert.equal(snapshot(part), before.get(id), `${id} metadata changed during visual pass`)
    assert.match(part.visualQuality, /^parts-6-fine-/)
  }
})

test('all fine-detail meshes are excluded from physics bounds', () => {
  for (const id of TARGETS) {
    const part = findPart(id)
    const object = part.create(part.defaultColor)
    const features = fineFeatures(object)
    assert.ok(features.length > 0, `${id} should expose fine-detail features`)
    for (const node of features) assert.equal(node.userData.physicsIgnore, true, `${id}:${node.userData.parts6FineFeature}`)
  }
})

test('steering and hub parts expose bearing, kingpin and retaining detail', () => {
  const base = featureNames(findPart('steering-base').create(findPart('steering-base').defaultColor))
  assert.ok(base.has('pivot-bushing-retainer'))
  assert.ok(base.has('base-mount-seat'))

  const knuckle = featureNames(findPart('steering-knuckle').create(findPart('steering-knuckle').defaultColor))
  assert.ok(knuckle.has('wheel-bearing-race'))
  assert.ok(knuckle.has('kingpin-retainer'))

  const hub = featureNames(findPart('wheel-hub').create(findPart('wheel-hub').defaultColor))
  assert.ok(hub.has('hub-snap-ring'))
  assert.ok(hub.has('hub-flange-relief'))
})

test('shock pair exposes spring-seat, preload, seal and dust-boot detail', () => {
  const body = featureNames(findPart('shock-body-5').create(findPart('shock-body-5').defaultColor))
  assert.ok(body.has('shock-spring-seat-lip'))
  assert.ok(body.has('shock-preload-thread'))
  assert.ok(body.has('shock-rod-seal'))

  const rod = featureNames(findPart('shock-rod-5').create(findPart('shock-rod-5').defaultColor))
  assert.ok(rod.has('shock-spring-retainer-lip'))
  assert.ok(rod.has('shock-bump-stop'))
  assert.ok(rod.has('shock-dust-boot-rib'))
})

test('power parts expose believable case and bearing detail', () => {
  const motor = featureNames(findPart('motor').create(findPart('motor').defaultColor))
  for (const feature of ['motor-output-bearing-retainer', 'motor-rear-endbell', 'motor-rear-vent', 'motor-cable-gland', 'motor-cable-stub']) {
    assert.ok(motor.has(feature), `motor missing ${feature}`)
  }

  const worm = featureNames(findPart('worm-drive-8').create(findPart('worm-drive-8').defaultColor))
  assert.ok(worm.has('worm-input-bearing-race'))
  assert.ok(worm.has('worm-output-bearing-race'))
  assert.ok(worm.has('worm-wheel-face-rim'))
  assert.ok(worm.has('worm-wheel-web'))
})

test('suspension, bearing and connector details are present', () => {
  const suspension = featureNames(findPart('suspension-arm-5').create(findPart('suspension-arm-5').defaultColor))
  assert.ok(suspension.has('suspension-pivot-washer'))
  assert.ok(suspension.has('suspension-arm-lightening-recess'))

  const bearing = featureNames(findPart('bearing-block').create(findPart('bearing-block').defaultColor))
  assert.ok(bearing.has('bearing-block-race'))
  assert.ok(bearing.has('bearing-block-seal'))

  const connectorPart = featureNames(findPart('connector-perpendicular').create(findPart('connector-perpendicular').defaultColor))
  assert.ok(connectorPart.has('connector-molded-lip'))
  assert.ok(connectorPart.has('connector-parting-line'))
})

test('fine pass source is visual-only and does not author physical/mechanical metadata', () => {
  assert.equal(fineModule.PARTS6_FINE_MECHANICAL_DETAIL_VERSION, 'parts-6-fine-mechanical-detail-v3')
  assert.doesNotMatch(source, /mechanics\s*:/)
  assert.doesNotMatch(source, /connectors\s*:/)
  assert.doesNotMatch(source, /colliderProfile\s*:/)
  assert.match(source, /physicsIgnore = true/)
  assert.match(source, /wrapPart\(/)
  assert.equal(globalThis.BrickLabParts6FineMechanicalDetail.upgraded.length, TARGETS.length)
})

await dom.happyDOM.close()
