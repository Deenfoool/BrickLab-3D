// One canonical versioned URL per module, shared by static and dynamic imports.
import { readdir, readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const tag = process.argv[2] ?? 'physics-11-20260908-vehicle-v1'
if (!/^(?:runtime|connect|physics)-\d+-[a-z0-9-]+$/.test(tag)) throw new Error('Invalid runtime tag')
const id = tag.match(/^(?:runtime|connect|physics)-\d+/)[0].toUpperCase()
const files = (await readdir(root)).filter(name => name.endsWith('.js')).sort()
const versioned = Object.fromEntries(files.map(name => [`./${name}`, `./${name}?v=${tag}`]))

// Keep old call sites stable while Connector System v3 is authoritative.
// app.js and several mechanics modules can continue importing the legacy specifiers.
const connectorAliases = {
  './connections.js': `./connections-v3.js?v=${tag}`,
  './snapping.js': `./snapping-v3.js?v=${tag}`,
  './connector-validation.js': `./connector-validation-v3.js?v=${tag}`,
  './structural-auto-weld-v2.js': `./connector-physics-v3.js?v=${tag}`,
}

const imports = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js',
  'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/',
  ...versioned,
  './tests/axle-fixtures.js': `./tests/axle-fixtures.js?v=${tag}`,
  ...connectorAliases,
}

let html = await readFile(new URL('index.html', root), 'utf8')
html = html.replace(/(<script type="importmap">)[\s\S]*?(<\/script>)/, `$1\n${JSON.stringify({ imports }, null, 2)}\n    $2`)
html = html.replace(/bootstrap\.js\?v=[^"]+/g, `bootstrap.js?v=${tag}`)
await writeFile(new URL('index.html', root), html)

let badge = await readFile(new URL('physics-error-ui.js', root), 'utf8')
badge = badge
  .replace(/const BUILD_ID = '[^']+'/, `const BUILD_ID = '${id}'`)
  .replace(/const BUILD_TAG = '[^']+'/, `const BUILD_TAG = '${tag}'`)
await writeFile(new URL('physics-error-ui.js', root), badge)
console.log(`${id}: ${files.length} canonical module URLs (${tag})`)

const acceptance = new URL('tests/time-scale-browser.html', root)
let testHtml = await readFile(acceptance, 'utf8')
testHtml = testHtml.replace(/(<script type="importmap">)[\s\S]*?(<\/script>)/, `$1\n${JSON.stringify({ imports }, null, 2)}\n$2`)
testHtml = testHtml.replace(/time-scale-browser\.js(?:\?v=[^"]+)?/, `time-scale-browser.js?v=${tag}`)
await writeFile(acceptance, testHtml)

const axleAcceptance = new URL('tests/axle-browser.html', root)
let axleHtml = await readFile(axleAcceptance, 'utf8')
axleHtml = axleHtml.replace(/(<script type="importmap">)[\s\S]*?(<\/script>)/, `$1\n${JSON.stringify({ imports }, null, 2)}\n$2`)
axleHtml = axleHtml.replace(/axle-browser\.js(?:\?v=[^"]+)?/, `axle-browser.js?v=${tag}`)
await writeFile(axleAcceptance, axleHtml)
