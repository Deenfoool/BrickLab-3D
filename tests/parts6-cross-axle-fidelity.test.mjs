import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const source = await readFile(new URL('parts6/cross-axle-fidelity-v12.js', root), 'utf8')

test('cross axle v12 replaces every numeric axle family with one molded keyed profile', () => {
  assert.match(source, /PARTS6_CROSS_AXLE_FIDELITY_VERSION = 'parts-6-cross-axle-fidelity-v12'/)
  assert.match(source, /\^axle-\\d\+\$/)
  assert.match(source, /moldedCrossShape/)
  assert.match(source, /cross-axle-molded-shaft/)
})

test('cross axle v12 preserves measured nominal interface and adds real manufacturing finish', () => {
  assert.match(source, /REAL_TECHNIC_NOMINAL/)
  assert.match(source, /nominalTipWidthMm: N\.axleTipRadius \* 2 \* N\.studMm/)
  assert.match(source, /rootChamfered: true/)
  assert.match(source, /endChamfered: true/)
  assert.match(source, /cross-axle-end-gate-witness/)
  assert.match(source, /cross-axle-longitudinal-mold-seam/)
})

test('cross axle v12 cannot change axle mechanics or collision envelope', () => {
  assert.doesNotMatch(source, /mechanics\s*:/)
  assert.doesNotMatch(source, /connectors\s*:/)
  assert.match(source, /parts6-v12-legacy-axle-collider-proxy/)
  assert.match(source, /proxy\.visible = false/)
  assert.match(source, /child\.raycast = \(\) => \{\}/)
  assert.match(source, /existing nominal explicit cylinder-x axle proxy remains authoritative/)
  assert.match(source, /physicsIgnore = true/)
})

test('runtime installs cross axle v12 after structural v11 and before physics', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const structural = runtime.indexOf("import('./parts6/structural-shell-fidelity-v11.js?v=parts-6-20260909-realism-v1')")
  const axle = runtime.indexOf("import('./parts6/cross-axle-fidelity-v12.js?v=parts-6-20260909-realism-v1')")
  const physics = runtime.indexOf("import('./physics-v2.js')")
  assert.ok(structural >= 0)
  assert.ok(axle > structural)
  assert.ok(physics > axle)
})
