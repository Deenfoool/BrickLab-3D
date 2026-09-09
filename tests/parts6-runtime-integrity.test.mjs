import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const TAG = 'parts-6-20260909-realism-v1'
const FINAL_MODULES = [
  'realism-refinement-v1',
  'precision-refinement-v2',
  'mechanical-realism-v1',
  'nominal-dimension-fidelity-v1',
  'hero-mechanical-fidelity-v2',
  'fine-mechanical-detail-v3',
  'core-molded-fidelity-v4',
  'suspension-arm-fidelity-v7',
  'steering-carrier-fidelity-v8',
  'bent-liftarm-fidelity-v6',
  'hero-micro-detail-v5',
  'connector-fidelity-v1',
  'interface-fit-refinement-v2',
  'interface-physics-safety-v1',
  'shaft-hardware-fidelity-v10',
  'shock-fidelity-v9',
  'steering-carrier-port-dedup-v8',
  'rack-gear-fidelity-v1',
]

function parts6Imports(source) {
  return [...source.matchAll(/import\(['"](\.\/parts6\/[^?'"\)]+)(?:\?v=([^'"\)]+))?['"]\)/g)]
    .map(match => ({ specifier: match[1], tag: match[2] ?? null }))
}

async function source(name) {
  return readFile(new URL(`parts6/${name}.js`, root), 'utf8')
}

test('PARTS-6 runtime imports every final owner exactly once with one cache tag', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const imports = parts6Imports(runtime)
  assert.equal(imports.length, FINAL_MODULES.length)
  assert.deepEqual(imports.map(item => item.specifier.replace('./parts6/', '').replace('.js', '')), FINAL_MODULES)
  for (const item of imports) {
    assert.equal(item.tag, TAG, `${item.specifier} uses PARTS-6 tag`)
    await access(new URL(item.specifier.replace(/^\.\//, ''), root))
  }
})

test('PARTS-6 visual ownership stays before physics and preserves intended final-owner order', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  let cursor = runtime.indexOf("import('./parts5/detail-refinement-v3.js?v=parts-5-20260909-visual-v2')")
  assert.ok(cursor >= 0)
  for (const name of FINAL_MODULES) {
    const next = runtime.indexOf(`import('./parts6/${name}.js?v=${TAG}')`)
    assert.ok(next > cursor, `${name} is ordered after previous owner`)
    cursor = next
  }
  assert.ok(runtime.indexOf("import('./physics-v2.js')") > cursor)
})

test('visual fidelity modules do not replace connector or mechanics metadata', async () => {
  for (const name of FINAL_MODULES) {
    const text = await source(name)
    assert.doesNotMatch(text, /mechanics\s*:/, `${name} must not author mechanics`)
    assert.doesNotMatch(text, /connectors\s*:/, `${name} must not author connectors`)
  }
})

test('highest-risk realism owners expose their required geometry and physics guards', async () => {
  const nominal = await source('nominal-dimension-fidelity-v1')
  const hero = await source('hero-mechanical-fidelity-v2')
  const core = await source('core-molded-fidelity-v4')
  const suspension = await source('suspension-arm-fidelity-v7')
  const carrier = await source('steering-carrier-fidelity-v8')
  const bent = await source('bent-liftarm-fidelity-v6')
  const hardware = await source('shaft-hardware-fidelity-v10')
  const shock = await source('shock-fidelity-v9')
  const dedup = await source('steering-carrier-port-dedup-v8')
  const rack = await source('rack-gear-fidelity-v1')

  assert.match(nominal, /studMm: 8/)
  assert.match(nominal, /pinHoleRadius: 2\.4 \/ 8/)
  assert.match(nominal, /axleTipRadius: 4\.78 \/ 16/)

  assert.match(hero, /createWheelHero/)
  assert.match(hero, /createBevelGearHero/)
  assert.match(hero, /createDifferentialHero/)
  assert.match(core, /pinLobeGeometry/)
  assert.match(core, /technic-brick-underside-tube/)
  assert.match(core, /spur-root-face-relief/)

  assert.match(suspension, /PARTS6_SUSPENSION_ARM_FIDELITY_VERSION = 'parts-6-suspension-arm-fidelity-v7'/)
  assert.match(suspension, /PARTS-5 explicit suspension-arm compound collider/)
  assert.match(carrier, /PARTS6_STEERING_CARRIER_FIDELITY_VERSION = 'parts-6-steering-carrier-fidelity-v8'/)
  assert.match(carrier, /parts-6-frozen-pre-v8-bounds-v1/)
  assert.match(carrier, /trueFlangeOpenings: 6/)
  assert.match(bent, /PARTS6_BENT_LIFTARM_FIDELITY_VERSION = 'parts-6-bent-liftarm-fidelity-v6'/)
  assert.match(bent, /PARTS-5 explicit bent-liftarm collider profiles remain authoritative/)

  assert.match(hardware, /PARTS6_SHAFT_HARDWARE_FIDELITY_VERSION = 'parts-6-shaft-hardware-fidelity-v10'/)
  assert.match(hardware, /parts6-v10-legacy-collider-proxy/)
  assert.match(hardware, /pin-elastic-lobe/)
  assert.match(hardware, /coupler-through-cross-bore/)
  assert.match(hardware, /perpendicular-connector-axle-barrel/)

  assert.match(shock, /PARTS6_SHOCK_FIDELITY_VERSION = 'parts-6-shock-fidelity-v9'/)
  assert.match(shock, /parts-6-frozen-pre-v9-shock-bounds-v1/)
  assert.match(shock, /shock-helical-spring/)
  assert.match(shock, /shock-rod-seal/)

  assert.match(dedup, /PARTS6_STEERING_CARRIER_PORT_DEDUP_VERSION = 'parts-6-steering-carrier-port-dedup-v8'/)
  assert.match(dedup, /nominal-cross-axle-stub/)
  assert.match(dedup, /hub inboard bearing axle remains canonical/)

  assert.match(rack, /GEAR_MODULE_STUD/)
  assert.match(rack, /GEAR_PRESSURE_ANGLE_DEG/)
  assert.match(rack, /freezeLegacyBoundsCollider/)
})

test('PARTS-6 build metadata and root cache tag agree', async () => {
  const badge = await readFile(new URL('physics-error-ui.js', root), 'utf8')
  const versioner = await readFile(new URL('scripts/version-runtime.mjs', root), 'utf8')
  const html = await readFile(new URL('index.html', root), 'utf8')
  const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
  assert.match(badge, /const BUILD_ID = 'PARTS-6'/)
  assert.match(badge, new RegExp(`const BUILD_TAG = '${TAG}'`))
  assert.match(versioner, new RegExp(`process\\.argv\\[2\\] \\?\\? '${TAG}'`))
  assert.match(html, new RegExp(`bootstrap\\.js\\?v=${TAG}`))
  assert.match(html, new RegExp(`runtime-extensions\\.js\\?v=${TAG}`))
  assert.match(bootstrap, /BUILD: PARTS-6/)
})

test('visual and assembled-fit QA cover final steering/shock/small-hardware owners', async () => {
  const visual = await readFile(new URL('tests/parts5-visual-qa.js', root), 'utf8')
  const fit = await readFile(new URL('tests/parts6-fit-qa.js', root), 'utf8')
  const shockQa = await readFile(new URL('tests/parts6-shock-qa.js', root), 'utf8')
  const visualHtml = await readFile(new URL('tests/parts5-visual-qa.html', root), 'utf8')
  const fitHtml = await readFile(new URL('tests/parts6-fit-qa.html', root), 'utf8')
  const shockHtml = await readFile(new URL('tests/parts6-shock-qa.html', root), 'utf8')

  for (const marker of ['steering-carrier-fidelity-v8', 'steering-carrier-port-dedup-v8']) {
    assert.match(visual, new RegExp(marker))
    assert.match(fit, new RegExp(marker))
  }
  assert.match(visual, /shaft-hardware-fidelity-v10/)
  assert.match(visual, /shaftHardwareFidelity/)
  assert.match(visual, /steeringCarrierFidelity/)
  assert.match(visual, /steeringCarrierPortDedup/)
  assert.match(fit, /steeringHubWheel/)
  assert.match(fit, /tieRodKnuckle/)
  assert.match(shockQa, /shock-fidelity-v9/)
  assert.match(shockQa, /BrickLabParts6ShockQA/)
  assert.match(shockQa, /shockFidelity/)
  assert.match(visualHtml, /PARTS-6 REALISM QA/)
  assert.match(fitHtml, /PARTS-6 FIT QA/)
  assert.match(shockHtml, /PARTS-6 SHOCK V9 QA/)
})
