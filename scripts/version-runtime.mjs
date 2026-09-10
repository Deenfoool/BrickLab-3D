// One canonical versioned URL per module, shared by static and dynamic imports.
import { readdir, readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const tag = process.argv[2] ?? 'parts-6-20260910-audio-v1'
if (!/^(?:runtime|connect|connector|physics|parts)-\d+-[a-z0-9-]+$/.test(tag)) throw new Error('Invalid runtime tag')
const id = tag.match(/^(?:runtime|connect|connector|physics|parts)-\d+/)[0].toUpperCase()
const files = (await readdir(root)).filter(name => name.endsWith('.js')).sort()
for (const dir of ['audio', 'assets/audio', 'connectors-v4']) {
  for (const name of await readdir(new URL(dir + '/', root))) if (name.endsWith('.js')) files.push(`${dir}/${name}`)
}
const versioned = Object.fromEntries(files.map(name => [`./${name}`, `./${name}?v=${tag}`]))

// V4 was introduced in several cache generations before the runtime became
// authoritative. Some modules still contain those historical query strings. Map
// every historical V4 URL to this build's one canonical module URL so the browser
// cannot instantiate two schema/matcher/runtime generations in the same page.
const legacyV4Tags = [
  'connector-v4-20260910-v1',
  'connector-v4-20260910-v3',
  'connector-v4-20260910-v5',
  'connector-v4-20260910-v6',
]
const v4Files = files.filter(name => name.startsWith('connectors-v4/'))
const legacyV4Aliases = Object.fromEntries(v4Files.flatMap(name => legacyV4Tags.map(oldTag => [
  `./${name}?v=${oldTag}`,
  `./${name}?v=${tag}`,
])))

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
  ...legacyV4Aliases,
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

const qa = new URL('audio-qa.html', root)
let qaHtml = await readFile(qa, 'utf8')
const map = `<script type="importmap">${JSON.stringify({ imports })}</script>`
qaHtml = qaHtml.replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
qaHtml = qaHtml.replace('<script type="module"', map + '\n<script type="module"')
qaHtml = qaHtml.replace(/src="\.\/audio\/qa\.js(?:\?v=[^"]+)?/, `src="./audio/qa.js?v=${tag}`)
await writeFile(qa, qaHtml)
