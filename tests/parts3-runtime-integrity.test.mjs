import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const TAG = 'parts-3-20260908-mechanical-v1'

function parts3Imports(source) {
  return [...source.matchAll(/import\(['"](\.\/parts3\/[^?'"\)]+)(?:\?v=([^'"\)]+))?['"]\)/g)]
    .map(match => ({ specifier: match[1], tag: match[2] ?? null }))
}

test('all retained PARTS-3 dynamic imports exist and carry the PARTS-3 package tag', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
  const imports = [...parts3Imports(runtime), ...parts3Imports(bootstrap)]
  assert.ok(imports.length >= 9, 'PARTS-3 package modules are explicitly retained')

  for (const item of imports) {
    assert.equal(item.tag, TAG, `${item.specifier} uses the PARTS-3 package cache tag`)
    await access(new URL(item.specifier.replace(/^\.\//, ''), root))
  }
})

test('PARTS-3 package tag does not pin the newer production build id', async () => {
  const badge = await readFile(new URL('physics-error-ui.js', root), 'utf8')
  assert.match(badge, /const BUILD_ID = 'PARTS-\d+'/)
  assert.match(badge, /const BUILD_TAG = 'parts-\d+-[a-z0-9-]+'/)
})

test('authoritative wheel collider consumes mechanics width instead of a fixed legacy half-width', async () => {
  const collider = await readFile(new URL('collider-clearance-v3.js', root), 'utf8')
  assert.match(collider, /Number\(wheel\?\.width\)/)
  assert.match(collider, /halfWidthMeters/)
  assert.doesNotMatch(collider, /\.34\s*\*\s*STUD\s*\*\s*Math\.abs\(relative\.scale\.x/)
  assert.match(collider, /radius\+width-aware cylinder proxies/)
})
