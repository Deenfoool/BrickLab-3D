// One canonical versioned URL per module. Production index.html is the only import-map
// source of truth; browser QA pages load that exact map through their classic loader.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { posix as path } from 'node:path'

const root = new URL('../', import.meta.url)
const tag = process.argv[2] ?? 'parts-6-20260911-ldraw-fast-v1'
if (!/^(?:runtime|connect|connector|physics|parts)-\d+-[a-z0-9-]+$/.test(tag)) throw new Error('Invalid runtime tag')
const id = tag.match(/^(?:runtime|connect|connector|physics|parts)-\d+/)[0].toUpperCase()
const files = (await readdir(root)).filter(name => name.endsWith('.js')).sort()
for (const dir of ['audio', 'assets/audio', 'connectors-v4', 'ldraw']) {
  for (const name of await readdir(new URL(dir + '/', root))) if (name.endsWith('.js')) files.push(`${dir}/${name}`)
}
const versioned = Object.fromEntries(files.map(name => [`./${name}`, `./${name}?v=${tag}`]))

// Some historical modules used explicit query strings in relative imports. Discover
// only URLs that resolve to a file owned by this canonical runtime graph and redirect
// them to the current build. This is especially important for LDraw: bootstrap,
// catalog and predictive preload must share one prototype/text cache instance.
const legacyAliases = {}
for (const importer of files) {
  const source = await readFile(new URL(importer, root), 'utf8')
  const importerDir = path.dirname(importer)
  for (const match of source.matchAll(/["'](\.\.?\/[^"']+\.js\?v=[^"']+)["']/g)) {
    const requested = match[1]
    const [pathname, query] = requested.split('?')
    const resolved = path.normalize(path.join(importerDir, pathname))
    const canonical = versioned[`./${resolved}`]
    if (canonical && query) legacyAliases[`./${resolved}?${query}`] = canonical
  }
}

// Legacy import specifiers remain stable, but LDraw structural snapping is routed
// through the V4 compatibility bridges. Native/procedural connector validation and
// structural welding still use their established V3 implementations.
const connectorAliases = {
  './connections.js': `./connectors-v4/connections-bridge-v4.js?v=${tag}`,
  './snapping.js': `./connectors-v4/snapping-bridge-v4.js?v=${tag}`,
  './connector-validation.js': `./connector-validation-v3.js?v=${tag}`,
  './structural-auto-weld-v2.js': `./connector-physics-v3.js?v=${tag}`,
}

const imports = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
  'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  ...versioned,
  ...legacyAliases,
  './tests/axle-fixtures.js': `./tests/axle-fixtures.js?v=${tag}`,
  ...connectorAliases,
}

let html = await readFile(new URL('index.html', root), 'utf8')
const replaced = html.replace(/(<script type="importmap">)[\s\S]*?(<\/script>)/, `$1\n${JSON.stringify({ imports }, null, 2)}\n    $2`)
if (replaced === html) throw new Error('index.html production import map was not found')
html = replaced.replace(/bootstrap\.js\?v=[^"]+/g, `bootstrap.js?v=${tag}`)
await writeFile(new URL('index.html', root), html)

// physics-error-ui.js derives its BUILD_TAG from import.meta.url, and browser QA
// pages load the production map with tests/production-importmap-loader.js. Keeping
// those consumers dynamic prevents a future cache generation from drifting.
for (const file of ['physics-error-ui.js','tests/production-importmap-loader.js','tests/time-scale-browser.html','tests/axle-browser.html','audio-qa.html']) {
  await readFile(new URL(file, root), 'utf8')
}

console.log(`${id}: ${files.length} canonical module URLs + ${Object.keys(legacyAliases).length} legacy redirects (${tag}); LDraw shares one runtime cache; QA delegates to production map`)
