import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const retiredFiles = [
  'connections.js',
  'snapping.js',
  'connector-validation.js',
  'structural-auto-weld-v2.js',
  'main-menu.js',
  'main-menu.css',
  'menu/main-menu-v2.js',
  'menu/main-menu-v2.css',
  'menu/main-menu-v3.js',
  'menu/main-menu-v3.css',
  'menu/project-preloader.js',
  'ldraw/catalog-v1.js',
  'ldraw/catalog-v1.css',
  'ldraw/catalog-v2.js',
  'ldraw/runtime-v1.js',
  'ldraw/runtime-v2.js',
  'testlab.js',
  'obstacle-test-patch.js',
  'test-scenarios-v2.js',
  'torque-test-patch.js',
  'powertrain-physics-v2.js',
]

function localTarget(target) {
  return String(target || '').split('?')[0]
}

async function productionImports() {
  const html = await readFile(new URL('index.html', root), 'utf8')
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)
  assert.ok(match, 'index.html contains the production import map')
  return JSON.parse(match[1]).imports
}

test('retired duplicate and unreachable files stay out of the repository', async () => {
  for (const file of retiredFiles) {
    await assert.rejects(access(new URL(file, root)), { code:'ENOENT' }, `${file} is retired`)
  }
})

test('retired public specifiers resolve to current authoritative implementations', async () => {
  const imports = await productionImports()
  const aliases = {
    './connections.js':'./connectors-v4/connections-bridge-v4.js',
    './snapping.js':'./connectors-v4/snapping-bridge-v4.js',
    './connector-validation.js':'./connector-validation-v3.js',
    './structural-auto-weld-v2.js':'./connector-physics-v3.js',
    './main-menu.js':'./menu/main-menu-v5.js',
    './testlab.js':'./testlab-v2.js',
    './ldraw/catalog-v1.js':'./ldraw/catalog-v3.js',
    './ldraw/catalog-v2.js':'./ldraw/catalog-v3.js',
    './ldraw/runtime-v1.js':'./ldraw/runtime-v3.js',
    './ldraw/runtime-v2.js':'./ldraw/runtime-v3.js',
    './ldraw/runtime-v2.js?v=ldraw-20260910-v2':'./ldraw/runtime-v3.js',
    './powertrain-physics-v2.js':'./physics-stability-v3.js',
  }

  for (const [specifier, target] of Object.entries(aliases)) {
    assert.equal(localTarget(imports[specifier]), target, `${specifier} resolves to ${target}`)
  }
})

test('unreachable TEST patch specifiers stay out of the production import map', async () => {
  const imports = await productionImports()
  for (const specifier of [
    './obstacle-test-patch.js',
    './test-scenarios-v2.js',
    './torque-test-patch.js',
  ]) {
    assert.equal(imports[specifier], undefined, `${specifier} has no production import-map entry`)
  }
})

test('transient drivetrain coupling layer stays retired', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const stability = await readFile(new URL('physics-stability-v3.js', root), 'utf8')
  assert.doesNotMatch(runtime, /powertrain-physics-v2\.js/, 'runtime does not install a provisional coupling owner')
  assert.match(stability, /inertia-aware-coupling-v3/, 'Physics Stability exposes the authoritative coupling owner')
  assert.match(stability, /PhysicsSession\.prototype\.applyGearCouplingTorques\s*=/, 'Physics Stability installs the final coupling solver')
})

test('dynamically loaded drivetrain stylesheet remains available', async () => {
  await access(new URL('drivetrain.css', root))
  const physics = await readFile(new URL('physics.js', root), 'utf8')
  assert.match(physics, /stylesheet\.href\s*=\s*['"]\.\/drivetrain\.css['"]/, 'physics telemetry dynamically loads drivetrain.css')
})

test('live LDraw catalog stylesheet remains available', async () => {
  await access(new URL('ldraw/catalog-v2.css', root))
  const catalog = await readFile(new URL('ldraw/catalog-v3.js', root), 'utf8')
  assert.match(catalog, /new URL\(['"]\.\/catalog-v2\.css\?v=ldraw-catalog-20260910-v3['"],import\.meta\.url\)/, 'catalog-v3 keeps its live stylesheet dependency')
})

test('the live menu, TEST Lab, physics and LDraw generations remain present', async () => {
  for (const file of [
    'menu/main-menu-v5.js',
    'menu/main-menu-v4.js',
    'menu/main-menu-v4.css',
    'menu/project-preloader-v4.js',
    'testlab-v2.js',
    'physics-v2.js',
    'physics-stability-v3.js',
    'test-world-visuals-v2.js',
    'ldraw/catalog-v3.js',
    'ldraw/catalog-v2.css',
    'ldraw/runtime-v3.js',
  ]) {
    await access(new URL(file, root))
  }
})
