import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir, access } from 'node:fs/promises'
import { posix as path } from 'node:path'

const root = new URL('../', import.meta.url)

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

test('all Connector V4 modules and their real historical imports collapse to one generation', async () => {
  const { imports } = await productionImports()
  const canonical = imports['./app.js']?.match(/\?v=(.+)$/)?.[1]
  assert.ok(canonical)
  const dir=new URL('../connectors-v4/',import.meta.url)
  const names=(await readdir(dir)).filter(name=>name.endsWith('.js'))
  for(const name of names){
    const specifier=`./connectors-v4/${name}`
    const target=`${specifier}?v=${canonical}`
    assert.equal(imports[specifier],target,`${name} uses canonical V4 generation`)

    const source=await readFile(new URL(name,dir),'utf8')
    for(const match of source.matchAll(/["'](\.\.?\/[^"']+\.js\?v=[^"']+)["']/g)){
      const requested=match[1]
      const [pathname,query]=requested.split('?')
      const resolved=path.normalize(path.join('connectors-v4',pathname))
      const historical=`./${resolved}?${query}`
      const historicalTarget=imports[historical]
      assert.ok(historicalTarget,`${name} historical import ${historical} is explicitly redirected`)
      const canonicalSpecifier=`./${resolved}`
      assert.equal(historicalTarget,imports[canonicalSpecifier],`${historical} resolves to canonical generation`)
    }
  }
})

test('all LDraw JavaScript modules share canonical runtime caches while catalog metadata uses the persistent wrapper', async () => {
  const { imports } = await productionImports()
  const canonical = imports['./app.js']?.match(/\?v=(.+)$/)?.[1]
  assert.ok(canonical)
  const dir=new URL('../ldraw/',import.meta.url)
  const names=(await readdir(dir)).filter(name=>name.endsWith('.js'))
  const wrapperSpecifier='./ldraw/runtime-metadata-cache-v1.js'
  for(const name of names){
    const specifier=`./ldraw/${name}`
    assert.equal(imports[specifier],`${specifier}?v=${canonical}`,`${name} uses canonical LDraw generation`)
    const source=await readFile(new URL(name,dir),'utf8')
    for(const match of source.matchAll(/["'](\.\.?\/[^"']+\.js\?v=[^"']+)["']/g)){
      const requested=match[1]
      const [pathname,query]=requested.split('?')
      const resolved=path.normalize(path.join('ldraw',pathname))
      const canonicalSpecifier=`./${resolved}`
      if (!imports[canonicalSpecifier]) continue
      const historical=`./${resolved}?${query}`
      const historicalTarget=imports[historical]
      if(historical==='./ldraw/runtime-v3.js?v=ldraw-catalog-20260910-v3'){
        assert.equal(historicalTarget,imports[wrapperSpecifier],`${historical} uses persistent parsed-metadata wrapper`)
      }else{
        assert.equal(historicalTarget,imports[canonicalSpecifier],`${historical} resolves to the same LDraw module instance`)
      }
    }
  }
  const wrapperSource=await readFile(new URL('runtime-metadata-cache-v1.js',dir),'utf8')
  assert.match(wrapperSource,/from ['"]\.\/runtime-v3\.js['"]/,'persistent metadata wrapper consumes canonical runtime-v3')
  assert.match(wrapperSource,/export \* from ['"]\.\/runtime-v3\.js['"]/,'persistent metadata wrapper re-exports canonical runtime-v3')
  assert.equal(imports['./ldraw/runtime-v3.js?v=ldraw-catalog-20260910-v3'],imports[wrapperSpecifier],'catalog metadata path uses persistent wrapper')
  assert.equal(imports['./ldraw/runtime-v3.js?v=ldraw-20260910-v3'],imports['./ldraw/runtime-v3.js'],'bootstrap/runtime historical path still shares runtime-v3 caches')
})
