import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const source = await readFile(new URL('parts6/structural-shell-fidelity-v11.js', root), 'utf8')

test('structural shell v11 upgrades Technic bricks and the 5x7 frame', () => {
  assert.match(source, /PARTS6_STRUCTURAL_SHELL_FIDELITY_VERSION = 'parts-6-structural-shell-fidelity-v11'/)
  assert.match(source, /\^technic-brick-1x\\d\+\$/)
  assert.match(source, /technic-frame-5x7/)
  assert.match(source, /createTechnicBrick/)
  assert.match(source, /createFrame/)
})

test('Technic bricks are hollow molded shells with actual side bores and underside tubes', () => {
  assert.match(source, /technic-brick-side-shell/)
  assert.match(source, /technic-brick-top-deck/)
  assert.match(source, /new RoundedBoxGeometry\(width, 0\.20, depth/)
  assert.match(source, /topDeck\.position\.set\(0, 1\.10, 0\)/)
  assert.match(source, /technic-brick-end-wall/)
  assert.match(source, /technic-brick-underside-tube-v11/)
  assert.match(source, /technic-brick-underside-web-v11/)
  assert.match(source, /technic-brick-side-hole-bore-liner/)
  assert.match(source, /openUnderside: true/)
  assert.match(source, /studDeckContinuous: true/)
})

test('5x7 frame keeps a real center opening and true connector-aligned perimeter bores', () => {
  assert.match(source, /technic-frame-main-shell-v11/)
  assert.match(source, /frameShape\.holes\.push\(roundedRect/)
  assert.match(source, /frameShape\.holes\.push\(circleHole\(port\.position\[0\], port\.position\[1\], N\.pinHoleRadius\)\)/)
  assert.match(source, /technic-frame-hole-bore-liner/)
  assert.match(source, /technic-frame-inner-lip-v11/)
  assert.match(source, /technic-frame-corner-gusset-v11/)
  assert.match(source, /truePerimeterBores: holes\.length/)
})

test('structural v11 stays visual-only and preserves pre-v11 physics source exactly', () => {
  assert.doesNotMatch(source, /mechanics\s*:/)
  assert.doesNotMatch(source, /connectors\s*:/)
  assert.match(source, /parts6-v11-legacy-structural-collider-proxy/)
  assert.match(source, /proxy\.visible = false/)
  assert.match(source, /child\.raycast = \(\) => \{\}/)
  assert.match(source, /physicsIgnore = true/)
  assert.match(source, /complete pre-v11 render trees remain invisible non-ignored collider\/bounds proxies/)
})

test('runtime installs structural shell v11 after core molded v4 and before physics', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const core = runtime.indexOf("import('./parts6/core-molded-fidelity-v4.js?v=parts-6-20260909-realism-v1')")
  const structural = runtime.indexOf("import('./parts6/structural-shell-fidelity-v11.js?v=parts-6-20260909-realism-v1')")
  const physics = runtime.indexOf("import('./physics-v2.js')")
  assert.ok(core >= 0)
  assert.ok(structural > core)
  assert.ok(physics > structural)
})
