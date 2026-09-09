import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const source = await readFile(new URL('parts6/shaft-hardware-fidelity-v10.js', root), 'utf8')

test('shaft hardware v10 rebuilds the small mechanical hardware family', () => {
  assert.match(source, /PARTS6_SHAFT_HARDWARE_FIDELITY_VERSION = 'parts-6-shaft-hardware-fidelity-v10'/)
  for (const id of [
    'pin', 'pin-half', 'pin-long', 'pin-frictionless', 'axle-pin',
    'bush', 'half-bush', 'axle-coupler',
    'connector-triple', 'connector-perpendicular', 'connector-angle',
  ]) assert.match(source, new RegExp(`'${id}'`))
})

test('pins have true split lobes, lead-ins and friction family separation', () => {
  assert.match(source, /pin-elastic-lobe/)
  assert.match(source, /pin-lead-in-lobe/)
  assert.match(source, /pin-friction-ridge/)
  assert.match(source, /pin-center-collar/)
  assert.match(source, /split-frictionless-pin/)
  assert.match(source, /trueElasticSlots: true/)
  assert.match(source, /taperedLeadIn: true/)
})

test('bushes, coupler and compact connectors use actual open bore geometry', () => {
  assert.match(source, /crossBoreShape/)
  assert.match(source, /bush-cross-bore-shell/)
  assert.match(source, /coupler-through-cross-bore/)
  assert.match(source, /triple-connector-bored-eye/)
  assert.match(source, /perpendicular-connector-axle-barrel/)
  assert.match(source, /perpendicular-connector-pin-bore/)
  assert.match(source, /angle-connector-bored-eye/)
  assert.match(source, /trueThroughCrossBore: true/)
})

test('shaft hardware v10 does not take semantic ownership', () => {
  assert.doesNotMatch(source, /mechanics\s*:/)
  assert.doesNotMatch(source, /connectors\s*:/)
  assert.match(source, /REAL_TECHNIC_NOMINAL/)
})

test('v10 preserves the exact previous collider/bounds source with an invisible non-raycast proxy', () => {
  assert.match(source, /parts6-v10-legacy-collider-proxy/)
  assert.match(source, /proxy\.visible = false/)
  assert.match(source, /child\.raycast = \(\) => \{\}/)
  assert.match(source, /parts6LegacyColliderProxy/)
  assert.match(source, /every new visible v10 mesh is collider-independent/)
  assert.match(source, /physicsIgnore = true/)
})

test('runtime makes shaft hardware v10 final after generic interface safety and before physics', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const safety = runtime.indexOf("import('./parts6/interface-physics-safety-v1.js?v=parts-6-20260909-realism-v1')")
  const hardware = runtime.indexOf("import('./parts6/shaft-hardware-fidelity-v10.js?v=parts-6-20260909-realism-v1')")
  const shock = runtime.indexOf("import('./parts6/shock-fidelity-v9.js?v=parts-6-20260909-realism-v1')")
  const physics = runtime.indexOf("import('./physics-v2.js')")
  assert.ok(safety >= 0)
  assert.ok(hardware > safety)
  assert.ok(shock > hardware)
  assert.ok(physics > shock)
})
