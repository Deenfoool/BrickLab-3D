import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const TAG = 'parts-5-20260909-visual-v1'

function parts5Imports(source) {
  return [...source.matchAll(/import\(['"](\.\/parts5\/[^?'"\)]+)(?:\?v=([^'"\)]+))?['"]\)/g)]
    .map(match => ({ specifier: match[1], tag: match[2] ?? null }))
}

test('PARTS-5 production modules exist and use one package tag', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
  const imports = [...parts5Imports(runtime), ...parts5Imports(bootstrap)]
  assert.ok(imports.length >= 3)
  for (const item of imports) {
    assert.equal(item.tag, TAG, `${item.specifier} uses PARTS-5 cache tag`)
    await access(new URL(item.specifier.replace(/^\.\//, ''), root))
  }
})

test('PARTS-5 refinement v2 is the final visual owner after legacy wrappers and v1', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const legacyVisual = runtime.indexOf("import('./part-visual-v3.js')")
  const legacyWheelMaterial = runtime.indexOf("import('./parts3/parts-3-wheel-materials.js?v=parts-3-20260908-mechanical-v1')")
  const parts5v1 = runtime.indexOf("import('./parts5/visual-overhaul-v1.js?v=parts-5-20260909-visual-v1')")
  const parts5v2 = runtime.indexOf("import('./parts5/visual-refinement-v2.js?v=parts-5-20260909-visual-v1')")
  const physics = runtime.indexOf("import('./physics-v2.js')")
  assert.ok(legacyVisual >= 0 && legacyWheelMaterial > legacyVisual)
  assert.ok(parts5v1 > legacyWheelMaterial)
  assert.ok(parts5v2 > parts5v1)
  assert.ok(physics > parts5v2)
})

test('editor snap and drivetrain detection consume the same gear mesh math', async () => {
  const snapping = await readFile(new URL('snapping-v3.js', root), 'utf8')
  const drivetrain = await readFile(new URL('drivetrain.js', root), 'utf8')
  const math = await readFile(new URL('parts5/gear-mesh-math-v1.js', root), 'utf8')
  assert.match(snapping, /solveSpurSnap/)
  assert.match(snapping, /solveBevelSnap/)
  assert.match(drivetrain, /evaluateSpurMesh/)
  assert.match(drivetrain, /evaluateBevelMesh/)
  assert.match(math, /targetDistance = a\.pitchRadius \+ b\.pitchRadius/)
  assert.match(math, /apexA = a\.center\.clone\(\)\.addScaledVector/)
})

test('gear mesh placement explicitly blocks a fake connector/joint', async () => {
  const snapping = await readFile(new URL('snapping-v3.js', root), 'utf8')
  const connections = await readFile(new URL('connections-v3.js', root), 'utf8')
  assert.match(snapping, /kind: 'gear-mesh'/)
  assert.match(snapping, /placementOnly: true/)
  assert.match(snapping, /suppressNextConnectionForEndpoint/)
  assert.match(connections, /placementSuppressions/)
  assert.match(connections, /consumePlacementSuppression/)
})

test('visual overhaul cannot grow authoritative wheel/gear colliders from tread or teeth bounds', async () => {
  const visuals = await readFile(new URL('parts5/visual-overhaul-v1.js', root), 'utf8')
  const refinement = await readFile(new URL('parts5/visual-refinement-v2.js', root), 'utf8')
  const collider = await readFile(new URL('collider-clearance-v3.js', root), 'utf8')
  assert.match(visuals, /physicsIgnore = true/)
  assert.match(refinement, /physicsIgnore = true/)
  assert.match(collider, /if \(wheel\)/)
  assert.match(collider, /wheelColliderDimensions\(wheel, relative\.scale\)/)
  assert.match(collider, /if \(gear\)/)
  assert.match(collider, /gear\.pitchRadius/)
  assert.doesNotMatch(collider, /if \(wheel\)[\s\S]{0,600}buildColliderProfile/)
})

test('refinement v2 contains the intended high-quality geometry systems', async () => {
  const source = await readFile(new URL('parts5/visual-refinement-v2.js', root), 'utf8')
  assert.match(source, /function involuteGearOutline/)
  assert.match(source, /function smoothTyreProfile/)
  assert.match(source, /function taperedSpokeGeometry/)
  assert.match(source, /new THREE\.InstancedMesh\(geometry, material, instances\)/)
  assert.match(source, /new THREE\.TubeGeometry/)
  assert.match(source, /createSteeringKnuckleRefined/)
  assert.match(source, /createSteeringRackRefined/)
  assert.match(source, /createShockRodRefined/)
  assert.match(source, /createBushRefined/)
  assert.match(source, /createAxleCouplerRefined/)
})

test('visual QA gallery loads refinement v2 and exposes steering/suspension models', async () => {
  await access(new URL('tests/parts5-visual-qa.html', root))
  await access(new URL('tests/parts5-visual-qa.js', root))
  const qa = await readFile(new URL('tests/parts5-visual-qa.js', root), 'utf8')
  assert.match(qa, /visual-refinement-v2/)
  assert.match(qa, /wheel-tractor/)
  assert.match(qa, /gear-40/)
  assert.match(qa, /gear-12/)
  assert.match(qa, /bevel-gear-20/)
  assert.match(qa, /wheel-hub/)
  assert.match(qa, /steering-knuckle/)
  assert.match(qa, /steering-rack-7/)
  assert.match(qa, /shock-rod-5/)
})

test('build metadata has advanced to PARTS-5 even before merge', async () => {
  const badge = await readFile(new URL('physics-error-ui.js', root), 'utf8')
  const versioner = await readFile(new URL('scripts/version-runtime.mjs', root), 'utf8')
  assert.match(badge, /const BUILD_ID = 'PARTS-5'/)
  assert.match(badge, new RegExp(`const BUILD_TAG = '${TAG}'`))
  assert.match(versioner, new RegExp(`process\\.argv\\[2\\] \\?\\? '${TAG}'`))
})
