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
  assert.equal(imports.length, 4)
  for (const item of imports) {
    assert.equal(item.tag, TAG, `${item.specifier} uses PARTS-6 tag`)
    await access(new URL(item.specifier.replace(/^\.\//, ''), root))
  }
})

test('PARTS-6 is the final visual owner before physics', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const detail = runtime.indexOf("import('./parts5/detail-refinement-v3.js?v=parts-5-20260909-visual-v2')")
  const realism = runtime.indexOf(`import('./parts6/realism-refinement-v1.js?v=${TAG}')`)
  const precision = runtime.indexOf(`import('./parts6/precision-refinement-v2.js?v=${TAG}')`)
  const mechanical = runtime.indexOf(`import('./parts6/mechanical-realism-v1.js?v=${TAG}')`)
  const fidelity = runtime.indexOf(`import('./parts6/connector-fidelity-v1.js?v=${TAG}')`)
  const physics = runtime.indexOf("import('./physics-v2.js')")
  assert.ok(detail >= 0)
  assert.ok(realism > detail)
  assert.ok(precision > realism)
  assert.ok(mechanical > precision)
  assert.ok(fidelity > mechanical)
  assert.ok(physics > fidelity)
})

test('PARTS-6 changes visual factories without replacing mechanics metadata', async () => {
  const realism = await readFile(new URL('parts6/realism-refinement-v1.js', root), 'utf8')
  const precision = await readFile(new URL('parts6/precision-refinement-v2.js', root), 'utf8')
  const mechanical = await readFile(new URL('parts6/mechanical-realism-v1.js', root), 'utf8')
  const fidelity = await readFile(new URL('parts6/connector-fidelity-v1.js', root), 'utf8')
  for (const source of [realism, precision, mechanical, fidelity]) {
    assert.doesNotMatch(source, /mechanics\s*:/)
    assert.doesNotMatch(source, /connectors\s*:/)
  }
  assert.match(realism, /patchPart\(PARTS/)
  assert.match(precision, /patchPart\(PARTS/)
  assert.match(mechanical, /patchPart\(PARTS/)
  assert.match(fidelity, /wrapFactory/)
})

test('PARTS-6 build metadata and version default agree', async () => {
  const badge = await readFile(new URL('physics-error-ui.js', root), 'utf8')
  const versioner = await readFile(new URL('scripts/version-runtime.mjs', root), 'utf8')
  assert.match(badge, /const BUILD_ID = 'PARTS-6'/)
  assert.match(badge, new RegExp(`const BUILD_TAG = '${TAG}'`))
  assert.match(versioner, new RegExp(`process\\.argv\\[2\\] \\?\\? '${TAG}'`))
})

test('visual QA page loads all PARTS-6 final owners', async () => {
  const qa = await readFile(new URL('tests/parts5-visual-qa.js', root), 'utf8')
  const html = await readFile(new URL('tests/parts5-visual-qa.html', root), 'utf8')
  assert.match(qa, /parts6\/realism-refinement-v1/)
  assert.match(qa, /parts6\/precision-refinement-v2/)
  assert.match(qa, /parts6\/mechanical-realism-v1/)
  assert.match(qa, /parts6\/connector-fidelity-v1/)
  assert.match(qa, /technic-frame-5x7/)
  assert.match(qa, /steering-base/)
  assert.match(html, /PARTS-6 REALISM QA/)
})
