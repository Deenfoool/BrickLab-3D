import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const TAG = 'parts-3-20260908-mechanical-v1'

function parts3Imports(source) {
  return [...source.matchAll(/import\(['"](\.\/parts3\/[^?'"\)]+)(?:\?v=([^'"\)]+))?['"]\)/g)]
    .map(match => ({ specifier: match[1], tag: match[2] ?? null }))
}

test('all production PARTS-3 dynamic imports exist and carry one release tag', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
  const imports = [...parts3Imports(runtime), ...parts3Imports(bootstrap)]
  assert.ok(imports.length >= 7, 'PARTS-3 production modules are explicitly loaded')

  for (const item of imports) {
    assert.equal(item.tag, TAG, `${item.specifier} uses the PARTS-3 cache tag`)
    await access(new URL(item.specifier.replace(/^\.\//, ''), root))
  }
})

test('production entrypoint and build badge agree on PARTS-3 tag', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')
  const badge = await readFile(new URL('physics-error-ui.js', root), 'utf8')
  assert.match(html, new RegExp(`bootstrap\\.js\\?v=${TAG}`))
  assert.match(badge, /const BUILD_ID = 'PARTS-3'/)
  assert.match(badge, new RegExp(`const BUILD_TAG = '${TAG}'`))
})
