import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

const source = await readFile(new URL('parts6/steering-carrier-fidelity-v8.js', root), 'utf8')
const dedup = await readFile(new URL('parts6/steering-carrier-port-dedup-v8.js', root), 'utf8')

test('steering carrier v8 rebuilds the five high-visibility steering/bearing parts', () => {
  assert.match(source, /PARTS6_STEERING_CARRIER_FIDELITY_VERSION = 'parts-6-steering-carrier-fidelity-v8'/)
  for (const id of ['steering-base', 'steering-knuckle', 'wheel-hub', 'steering-tie-rod-5', 'bearing-block']) {
    assert.match(source, new RegExp(`'${id}'`))
  }
  assert.match(source, /createSteeringBase/)
  assert.match(source, /createSteeringKnuckle/)
  assert.match(source, /createWheelHub/)
  assert.match(source, /createTieRod/)
  assert.match(source, /createBearingBlock/)
})

test('steering carrier v8 models true bores, open flange relief and molded steering geometry', () => {
  assert.match(source, /steering-base-true-bore/)
  assert.match(source, /knuckle-bearing-liner/)
  assert.match(source, /knuckle-bearing-race/)
  assert.match(source, /flangeShape\(0\.57, N\.axleTipRadius \+ 0\.055, 0\.070, 6\)/)
  assert.match(source, /trueFlangeOpenings: 6/)
  assert.match(source, /tie-rod-eye-bore/)
  assert.match(source, /bearing-block-liner/)
  assert.match(source, /forgedUpright: true/)
  assert.match(source, /forgedRod: true/)
})

test('steering carrier v8 preserves connector/mechanics ownership and freezes old bounds before replacement', () => {
  assert.doesNotMatch(source, /mechanics\s*:/)
  assert.doesNotMatch(source, /connectors\s*:/)
  assert.match(source, /freezeLegacyBoundsCollider/)
  assert.match(source, /parts-6-frozen-pre-v8-bounds-v1/)
  assert.match(source, /child\.userData\?\.physicsIgnore/)
  assert.match(source, /colliderFreeze\[id\] = freezeLegacyBoundsCollider\(part, previous\)/)
  assert.match(source, /pre-v8 non-ignored render bounds are frozen into explicit collider profiles/)
})

test('steering carrier v8 marks micro finish collider-independent', () => {
  assert.match(source, /physicsIgnore = true/)
  for (const feature of [
    'steering-base-pivot-retainer',
    'knuckle-bearing-seal',
    'knuckle-kingpin-retainer',
    'hub-bearing-seal',
    'hub-snap-ring',
    'tie-rod-eye-retainer',
    'bearing-block-race',
  ]) {
    assert.match(source, new RegExp(feature))
  }
})

test('final steering carrier dedup removes overlapping generic port finish without deleting canonical hub bearing axle', () => {
  assert.match(dedup, /PARTS6_STEERING_CARRIER_PORT_DEDUP_VERSION = 'parts-6-steering-carrier-port-dedup-v8'/)
  assert.match(dedup, /parts6InterfaceFeature/)
  assert.match(dedup, /parts6ConnectorVisual/)
  assert.match(dedup, /feature === 'nominal-cross-axle-stub'/)
  assert.match(dedup, /Number\(node\.position\?\.x \?\? 0\) > 0/)
  assert.match(dedup, /hub inboard bearing axle remains canonical/)
  assert.doesNotMatch(dedup, /mechanics\s*:/)
  assert.doesNotMatch(dedup, /connectors\s*:/)
})

test('runtime loads steering carrier v8, then generic wrappers, then dedup before physics', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const carrier = runtime.indexOf("import('./parts6/steering-carrier-fidelity-v8.js?v=parts-6-20260909-realism-v1')")
  const fidelity = runtime.indexOf("import('./parts6/connector-fidelity-v1.js?v=parts-6-20260909-realism-v1')")
  const safety = runtime.indexOf("import('./parts6/interface-physics-safety-v1.js?v=parts-6-20260909-realism-v1')")
  const dedupOwner = runtime.indexOf("import('./parts6/steering-carrier-port-dedup-v8.js?v=parts-6-20260909-realism-v1')")
  const physics = runtime.indexOf("import('./physics-v2.js')")
  assert.ok(carrier >= 0)
  assert.ok(fidelity > carrier)
  assert.ok(safety > fidelity)
  assert.ok(dedupOwner > safety)
  assert.ok(physics > dedupOwner)
})
