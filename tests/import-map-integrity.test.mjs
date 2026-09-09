import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, access } from 'node:fs/promises'

const root = new URL('../', import.meta.url)

function localTarget(target) {
  if (typeof target !== 'string' || !target.startsWith('./')) return null
  return target.split('?')[0].replace(/^\.\//, '')
}

test('production import map has no dangling local JavaScript targets', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)
  assert.ok(match, 'index.html contains an import map')
  const { imports } = JSON.parse(match[1])

  for (const [specifier, target] of Object.entries(imports)) {
    const file = localTarget(target)
    if (!file || file.startsWith('tests/')) continue
    await access(new URL(file, root))
  }
})

test('every root JavaScript module has one canonical cache-busted mapping', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')
  const { imports } = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1])
  const entry = html.match(/src="\.\/bootstrap\.js\?v=([^"]+)/)?.[1]
  assert.ok(entry, 'bootstrap cache-bust tag exists')

  const aliases = {
    'connections.js': 'connections-v3.js',
    'snapping.js': 'snapping-v3.js',
    'connector-validation.js': 'connector-validation-v3.js',
    'structural-auto-weld-v2.js': 'connector-physics-v3.js',
  }
  const modules = (await readdir(root)).filter(name => name.endsWith('.js'))
  for (const name of modules) {
    assert.equal(
      imports[`./${name}`],
      `./${aliases[name] ?? name}?v=${entry}`,
      `${name} has canonical import-map URL`,
    )
  }
})
