import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const TAG = 'parts-6-20260909-realism-v1'

function parts6Imports(source) {
  return [...source.matchAll(/import\(['"](\.\/parts6\/[^?'"\)]+)(?:\?v=([^'"\)]+))?['"]\)/g)]
    .map(match => ({ specifier: match[1], tag: match[2] ?? null }))
}

test('PARTS-6 realism modules exist and use one package tag', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const imports = parts6Imports(runtime)
  assert.equal(imports.length, 7)
  for (const item of imports) {
    assert.equal(item.tag, TAG, `${item.specifier} uses PARTS-6 tag`)
    await access(new URL(item.specifier.replace(/^\.\//, ''), root))
  }
})

test('PARTS-6 final visual ownership is ordered before physics', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const detail = runtime.indexOf("import('./parts5/detail-refinement-v3.js?v=parts-5-20260909-visual-v2')")
  const realism = runtime.indexOf(`import('./parts6/realism-refinement-v1.js?v=${TAG}')`)
  const precision = runtime.indexOf(`import('./parts6/precision-refinement-v2.js?v=${TAG}')`)
  const mechanical = runtime.indexOf(`import('./parts6/mechanical-realism-v1.js?v=${TAG}')`)
  const nominal = runtime.indexOf(`import('./parts6/nominal-dimension-fidelity-v1.js?v=${TAG}')`)
  const fidelity = runtime.indexOf(`import('./parts6/connector-fidelity-v1.js?v=${TAG}')`)
  const interfaceFit = runtime.indexOf(`import('./parts6/interface-fit-refinement-v2.js?v=${TAG}')`)
  const interfaceSafety = runtime.indexOf(`import('./parts6/interface-physics-safety-v1.js?v=${TAG}')`)
  const physics = runtime.indexOf("import('./physics-v2.js')")
  assert.ok(detail >= 0)
  assert.ok(realism > detail)
  assert.ok(precision > realism)
  assert.ok(mechanical > precision)
  assert.ok(nominal > mechanical)
  assert.ok(fidelity > nominal)
  assert.ok(interfaceFit > fidelity)
  assert.ok(interfaceSafety > interfaceFit)
  assert.ok(physics > interfaceSafety)
})

test('PARTS-6 visual layers do not replace connector or mechanics metadata', async () => {
  const files = [
    'parts6/realism-refinement-v1.js',
    'parts6/precision-refinement-v2.js',
    'parts6/mechanical-realism-v1.js',
    'parts6/nominal-dimension-fidelity-v1.js',
    'parts6/connector-fidelity-v1.js',
    'parts6/interface-fit-refinement-v2.js',
    'parts6/interface-physics-safety-v1.js',
  ]
  const sources = await Promise.all(files.map(file => readFile(new URL(file, root), 'utf8')))
  for (const source of sources) {
    assert.doesNotMatch(source, /mechanics\s*:/)
    assert.doesNotMatch(source, /connectors\s*:/)
  }
  assert.match(sources[0], /patchPart\(PARTS/)
  assert.match(sources[1], /patchPart\(PARTS/)
  assert.match(sources[2], /patchPart\(PARTS/)
  assert.match(sources[3], /REAL_TECHNIC_NOMINAL/)
  assert.match(sources[4], /PARTS6_CONNECTOR_FIDELITY_VERSION = 'parts-6-connector-fidelity-v3'/)
  assert.match(sources[4], /one visual owner per mating port/)
  assert.match(sources[5], /wrapPart/)
  assert.match(sources[6], /markInterfaceTree/)
})

test('nominal and interface-fit layers share one Technic sizing source', async () => {
  const nominal = await readFile(new URL('parts6/nominal-dimension-fidelity-v1.js', root), 'utf8')
  const fit = await readFile(new URL('parts6/interface-fit-refinement-v2.js', root), 'utf8')
  const fidelity = await readFile(new URL('parts6/connector-fidelity-v1.js', root), 'utf8')
  const safety = await readFile(new URL('parts6/interface-physics-safety-v1.js', root), 'utf8')
  assert.match(nominal, /studMm: 8/)
  assert.match(nominal, /pinHoleRadius: 2\.4 \/ 8/)
  assert.match(nominal, /axleTipRadius: 4\.78 \/ 16/)
  assert.match(fit, /REAL_TECHNIC_NOMINAL/)
  assert.match(fidelity, /REAL_TECHNIC_NOMINAL/)
  assert.match(fit, /connector\.axis/)
  assert.match(fit, /physicsIgnore = true/)
  assert.match(safety, /parts6InterfaceFeature/)
  assert.match(safety, /physicsIgnore = true/)
})

test('PARTS-6 build metadata, root cache tag and version default agree', async () => {
  const badge = await readFile(new URL('physics-error-ui.js', root), 'utf8')
  const versioner = await readFile(new URL('scripts/version-runtime.mjs', root), 'utf8')
  const html = await readFile(new URL('index.html', root), 'utf8')
  const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
  assert.match(badge, /const BUILD_ID = 'PARTS-6'/)
  assert.match(badge, new RegExp(`const BUILD_TAG = '${TAG}'`))
  assert.match(versioner, new RegExp(`process\\.argv\\[2\\] \\?\\? '${TAG}'`))
  assert.match(html, new RegExp(`bootstrap\\.js\\?v=${TAG}`))
  assert.match(html, new RegExp(`runtime-extensions\\.js\\?v=${TAG}`))
  assert.doesNotMatch(html, /parts-5-20260909-visual-v2/)
  assert.match(bootstrap, /BUILD: PARTS-6/)
})

test('visual QA page loads all PARTS-6 final owners', async () => {
  const qa = await readFile(new URL('tests/parts5-visual-qa.js', root), 'utf8')
  const html = await readFile(new URL('tests/parts5-visual-qa.html', root), 'utf8')
  assert.match(qa, /parts6\/realism-refinement-v1/)
  assert.match(qa, /parts6\/precision-refinement-v2/)
  assert.match(qa, /parts6\/mechanical-realism-v1/)
  assert.match(qa, /parts6\/nominal-dimension-fidelity-v1/)
  assert.match(qa, /parts6\/connector-fidelity-v1/)
  assert.match(qa, /parts6\/interface-fit-refinement-v2/)
  assert.match(qa, /technic-frame-5x7/)
  assert.match(qa, /steering-base/)
  assert.match(qa, /rpm-sensor/)
  assert.match(html, /PARTS-6 REALISM QA/)
  assert.match(html, /Nominal interfaces/)
})
