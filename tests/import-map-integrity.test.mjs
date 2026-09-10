import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, access } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const legacyV4Tags = [
  'connector-v4-20260910-v1',
  'connector-v4-20260910-v3',
  'connector-v4-20260910-v5',
  'connector-v4-20260910-v6',
]

function localTarget(target) {
  if (typeof target !== 'string' || !target.startsWith('./')) return null
  return target.split('?')[0].replace(/^\.\//, '')
}

async function productionImports() {
  const html = await readFile(new URL('index.html', root), 'utf8')
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)
  assert.ok(match, 'index.html contains an import map')
  return { html, imports:JSON.parse(match[1]).imports }
}

test('production import map has no dangling local JavaScript targets', async () => {
  const { imports } = await productionImports()
  for (const target of Object.values(imports)) {
    const file = localTarget(target)
    if (!file || file.startsWith('tests/')) continue
    await access(new URL(file, root))
  }
})

test('every root JavaScript module has one canonical cache-busted mapping', async () => {
  const { html, imports } = await productionImports()
  const canonical = imports['./app.js']?.match(/\?v=(.+)$/)?.[1]
  const entry = html.match(/src="\.\/bootstrap\.js\?v=([^"]+)/)?.[1]
  assert.ok(canonical, 'canonical import-map cache-bust tag exists')
  assert.equal(entry,canonical,'bootstrap entry uses the canonical runtime tag')

  const aliases = {
    'connections.js': 'connectors-v4/connections-bridge-v4.js',
    'snapping.js': 'connectors-v4/snapping-bridge-v4.js',
    'connector-validation.js': 'connector-validation-v3.js',
    'structural-auto-weld-v2.js': 'connector-physics-v3.js',
  }
  const modules = (await readdir(root)).filter(name => name.endsWith('.js'))
  for (const name of modules) {
    assert.equal(
      imports[`./${name}`],
      `./${aliases[name] ?? name}?v=${canonical}`,
      `${name} has canonical import-map URL`,
    )
  }
})

test('all Connector V4 modules and historical URLs collapse to the same generation', async () => {
  const { imports } = await productionImports()
  const canonical = imports['./app.js']?.match(/\?v=(.+)$/)?.[1]
  assert.ok(canonical)
  const names=(await readdir(new URL('../connectors-v4/',import.meta.url))).filter(name=>name.endsWith('.js'))
  for(const name of names){
    const specifier=`./connectors-v4/${name}`
    const target=`${specifier}?v=${canonical}`
    assert.equal(imports[specifier],target,`${name} uses canonical V4 generation`)
    for(const oldTag of legacyV4Tags){
      assert.equal(imports[`${specifier}?v=${oldTag}`],target,`${name} ${oldTag} aliases to canonical generation`)
    }
  }
})
