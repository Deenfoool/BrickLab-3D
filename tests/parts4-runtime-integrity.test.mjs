import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const TAG = 'parts-4-20260908-driveline-v1'

function parts4Imports(source) {
  return [...source.matchAll(/import\(['"](\.\/parts4\/[^?'"\)]+)(?:\?v=([^'"\)]+))?['"]\)/g)]
    .map(match => ({ specifier: match[1], tag: match[2] ?? null }))
}

test('all retained PARTS-4 dynamic imports exist and use one package tag', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
  const imports = [...parts4Imports(runtime), ...parts4Imports(bootstrap)]
  assert.ok(imports.length >= 6, 'PARTS-4 package modules are explicitly retained')

  for (const item of imports) {
    assert.equal(item.tag, TAG, `${item.specifier} uses PARTS-4 package cache tag`)
    await access(new URL(item.specifier.replace(/^\.\//, ''), root))
  }
})

test('PARTS-4 package tag does not pin the newer production build id', async () => {
  const badge = await readFile(new URL('physics-error-ui.js', root), 'utf8')
  assert.match(badge, /const BUILD_ID = 'PARTS-\d+'/)
  assert.match(badge, /const BUILD_TAG = new URL\(import\.meta\.url\)\.searchParams\.get\('v'\) \|\| 'unversioned-runtime'/)
})

test('PARTS-4 mechanical writers are replaced by native physics ownership', async () => {
  const ownership = await readFile(new URL('physics-ownership-v1.js', root), 'utf8')
  const native = await readFile(new URL('mechanics-next/physics/rapier-adapter.js', root), 'utf8')
  assert.match(ownership, /retired legacy writer re-entered production/)
  assert.match(ownership, /physics-ownership-v7/)
  assert.match(native, /JointData\.spherical/)
  assert.match(native, /JointData\.prismatic/)
  assert.match(native, /JointData\.revolute/)
})

test('slider connector types are validated and map to prismatic joints', async () => {
  const rules = await readFile(new URL('connector-rules-v3.js', root), 'utf8')
  const validation = await readFile(new URL('connector-validation-v3.js', root), 'utf8')
  assert.match(rules, /slider\|slider-rail.*kind: 'prismatic'/)
  assert.match(validation, /'slider', 'slider-rail'/)
  assert.match(validation, /steeringRack\.sliderConnectorId/)
  assert.match(validation, /shockBody\.railConnectorId/)
})

test('native rack steering uses Vehicle System input and catalog still exposes Suspension', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
  const vehicle = runtime.indexOf("import('./vehicle-system-v1.js')")
  assert.ok(vehicle >= 0)
  assert.doesNotMatch(runtime,/steering-suspension-physics-v1/)
  const bridge = await readFile(new URL('mechanics-next/physics/steering-bridge.js', root), 'utf8')
  assert.match(bridge,/rackBindings/)
  assert.match(bootstrap, /parts4\/catalog-parts-4\.js\?v=parts-4-20260908-driveline-v1/)
})

test('native couplings replace legacy stress and articulated torque writers', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  assert.doesNotMatch(runtime,/drivetrain-stress-v2|articulated-driveline-physics-v1/)
  const coupling = await readFile(new URL('mechanics-next/physics/coupling-runtime.js', root), 'utf8')
  assert.match(coupling,/controlledTransmission/)
  assert.match(coupling,/instantaneousRatio/)
})

test('drivetrain source retains distinct spur and bevel mesh adapters', async () => {
  const drivetrain = await readFile(new URL('drivetrain.js', root), 'utf8')
  assert.match(drivetrain, /function spurGearMesh/)
  assert.match(drivetrain, /function bevelGearMesh/)
  assert.match(drivetrain, /evaluateSpurMesh/)
  assert.match(drivetrain, /evaluateBevelMesh/)
  assert.match(drivetrain, /kind: 'bevel'/)
  assert.match(drivetrain, /kind: definition\?\.mechanics\?\.articulatedCoupler \? 'articulated'/)
})
