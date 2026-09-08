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
  assert.ok(imports.length >= 3, 'PARTS-4 production modules are explicitly loaded')

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

test('PARTS-4 advances the single authoritative joint owner to spherical-capable v5', async () => {
  const ownership = await readFile(new URL('physics-ownership-v1.js', root), 'utf8')
  const joints = await readFile(new URL('joint-stability-v4.js', root), 'utf8')
  assert.match(ownership, /const JOINT_OWNER = 'joint-stability-v5'/)
  assert.match(joints, /JOINT_STABILITY_VERSION = 'joint-stability-v5'/)
  assert.match(joints, /JointData\.spherical/)
})

test('drivetrain source contains distinct spur and bevel mesh solvers', async () => {
  const drivetrain = await readFile(new URL('drivetrain.js', root), 'utf8')
  assert.match(drivetrain, /function spurGearMesh/)
  assert.match(drivetrain, /function bevelGearMesh/)
  assert.match(drivetrain, /kind: 'bevel'/)
  assert.match(drivetrain, /kind: definition\?\.mechanics\?\.articulatedCoupler \? 'articulated'/)
})
