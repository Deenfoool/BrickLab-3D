import { test } from 'node:test'
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const TAG = 'parts-4-20260908-driveline-v1'

function parts4Imports(source) {
  return [...source.matchAll(/import\(['"](\.\/parts4\/[^?'"\)]+)(?:\?v=([^'"\)]+))?['"]\)/g)]
    .map(match => ({ specifier: match[1], tag: match[2] ?? null }))
}

test('all production PARTS-4 dynamic imports exist and use one release tag', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
  const imports = [...parts4Imports(runtime), ...parts4Imports(bootstrap)]
  assert.ok(imports.length >= 6, 'PARTS-4 production modules are explicitly loaded')

  for (const item of imports) {
    assert.equal(item.tag, TAG, `${item.specifier} uses PARTS-4 cache tag`)
    await access(new URL(item.specifier.replace(/^\.\//, ''), root))
  }
})

test('production entrypoint and build badge agree on PARTS-4 tag', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8')
  const badge = await readFile(new URL('physics-error-ui.js', root), 'utf8')
  assert.match(html, new RegExp(`bootstrap\\.js\\?v=${TAG}`))
  assert.match(badge, /const BUILD_ID = 'PARTS-4'/)
  assert.match(badge, new RegExp(`const BUILD_TAG = '${TAG}'`))
})

test('PARTS-4 advances joint, coupling and steering ownership deliberately', async () => {
  const ownership = await readFile(new URL('physics-ownership-v1.js', root), 'utf8')
  const joints = await readFile(new URL('joint-stability-v4.js', root), 'utf8')
  assert.match(ownership, /const JOINT_OWNER = 'joint-stability-v5'/)
  assert.match(ownership, /const COUPLING_OWNER = 'articulated-driveline-physics-v1'/)
  assert.match(ownership, /const STEERING_OWNER = 'steering-suspension-physics-v1'/)
  assert.match(ownership, /updateVehicleControlsV1\?\.__bricklabOwner !== STEERING_OWNER/)
  assert.match(joints, /JOINT_STABILITY_VERSION = 'joint-stability-v5'/)
  assert.match(joints, /JointData\.spherical/)
  assert.match(joints, /JointData\.prismatic/)
  assert.match(joints, /createdSemanticBearings/)
  assert.match(joints, /createdPrismatic/)
})

test('slider connector types are validated and map to prismatic joints', async () => {
  const rules = await readFile(new URL('connector-rules-v3.js', root), 'utf8')
  const validation = await readFile(new URL('connector-validation-v3.js', root), 'utf8')
  assert.match(rules, /slider\|slider-rail.*kind: 'prismatic'/)
  assert.match(validation, /'slider', 'slider-rail'/)
  assert.match(validation, /steeringRack\.sliderConnectorId/)
  assert.match(validation, /shockBody\.railConnectorId/)
})

test('rack steering runtime is loaded after Vehicle System and catalog exposes Suspension', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const bootstrap = await readFile(new URL('bootstrap.js', root), 'utf8')
  const vehicle = runtime.indexOf("import('./vehicle-system-v1.js')")
  const rack = runtime.indexOf("import('./parts4/steering-suspension-physics-v1.js?v=parts-4-20260908-driveline-v1')")
  assert.ok(vehicle >= 0 && rack > vehicle)
  assert.match(bootstrap, /parts4\/catalog-parts-4\.js\?v=parts-4-20260908-driveline-v1/)
})

test('articulated coupling loads after the stress layer so it is the final ratio owner', async () => {
  const runtime = await readFile(new URL('runtime-extensions.js', root), 'utf8')
  const stress = runtime.indexOf("import('./drivetrain-stress-v2.js')")
  const articulation = runtime.indexOf("import('./parts4/articulated-driveline-physics-v1.js?v=parts-4-20260908-driveline-v1')")
  assert.ok(stress >= 0 && articulation > stress)
})

test('drivetrain source contains distinct spur and bevel mesh solvers', async () => {
  const drivetrain = await readFile(new URL('drivetrain.js', root), 'utf8')
  assert.match(drivetrain, /function spurGearMesh/)
  assert.match(drivetrain, /function bevelGearMesh/)
  assert.match(drivetrain, /kind: 'bevel'/)
  assert.match(drivetrain, /kind: definition\?\.mechanics\?\.articulatedCoupler \? 'articulated'/)
})
