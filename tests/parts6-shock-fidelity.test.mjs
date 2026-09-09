import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const source = await readFile(new URL('parts6/shock-fidelity-v9.js', root), 'utf8')

test('shock fidelity v9 rebuilds body and rod as a coherent real damper family', () => {
  assert.match(source, /PARTS6_SHOCK_FIDELITY_VERSION = 'parts-6-shock-fidelity-v9'/)
  assert.match(source, /createShockBody/)
  assert.match(source, /createShockRod/)
  assert.match(source, /threadedPreload: true/)
  assert.match(source, /barrelProfile: 'tapered-monotube'/)
  assert.match(source, /helicalSpring: true/)
  assert.match(source, /dustBoot: true/)
  assert.match(source, /progressiveBumpStop: true/)
})

test('shock fidelity v9 uses real bored eyes and close-range molded/mechanical details', () => {
  assert.match(source, /annulusShape\(0\.315, N\.pinHoleRadius\)/)
  assert.match(source, /shock-lower-eye-bore/)
  assert.match(source, /shock-upper-eye-bore/)
  assert.match(source, /shock-body-thread/)
  assert.match(source, /shock-preload-collar-notch/)
  assert.match(source, /shock-rod-seal/)
  assert.match(source, /shock-dust-boot-rib/)
  assert.match(source, /shock-helical-spring/)
})

test('shock fidelity v9 freezes pre-v9 physical bounds and preserves mechanics/connectors', () => {
  assert.doesNotMatch(source, /mechanics\s*:/)
  assert.doesNotMatch(source, /connectors\s*:/)
  assert.match(source, /freezeLegacyBoundsCollider/)
  assert.match(source, /parts-6-frozen-pre-v9-shock-bounds-v1/)
  assert.match(source, /child\.userData\?\.physicsIgnore/)
  assert.match(source, /pre-v9 non-ignored visual bounds are frozen before replacement/)
  assert.match(source, /PARTS-4 prismatic shock travel\/spring\/damper mechanics and connector centres remain unchanged/)
})

test('shock v9 visual-only spring/seal/boot detail stays collider independent', () => {
  assert.match(source, /physicsIgnore = true/)
  for (const feature of ['shock-lower-spring-seat-lip', 'shock-rod-seal', 'shock-preload-collar-notch', 'shock-progressive-bump-stop', 'shock-dust-boot-rib', 'shock-helical-spring']) {
    assert.match(source, new RegExp(feature))
  }
})

test('runtime installs shock v9 after generic interface safety and before physics', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const safety = runtime.indexOf("import('./parts6/interface-physics-safety-v1.js?v=parts-6-20260909-realism-v1')")
  const shock = runtime.indexOf("import('./parts6/shock-fidelity-v9.js?v=parts-6-20260909-realism-v1')")
  const physics = runtime.indexOf("import('./physics-v2.js')")
  assert.ok(safety >= 0)
  assert.ok(shock > safety)
  assert.ok(physics > shock)
})
