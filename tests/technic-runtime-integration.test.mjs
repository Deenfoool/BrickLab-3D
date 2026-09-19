import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('production runtime mounts the Technic semantic layer before editor mechanics are consumed', async () => {
  const architecture = await text('architecture/runtime-v1.js')
  assert.match(architecture, /technic\/runtime-v1\.js\?v=technic-family-20260917-differential-bevel-v1/)
})

test('Architecture keeps the Technic-aware drivetrain analyzer as a read-only diagnostic', async () => {
  const [architecture, drivetrain] = await Promise.all([
    text('architecture/runtime-v1.js'),
    text('technic/drivetrain-v1.js'),
  ])
  assert.match(architecture, /analyzeTechnicAwareDrivetrain/)
  assert.match(drivetrain, /connectorWorldFrameV4/)
  assert.match(drivetrain, /analyzeLegacyDrivetrain/)
  assert.match(drivetrain, /if \(!needsEnhancedAnalysis\(objects\)\) return base/)
})

test('BrickLabTechnic publishes capabilities, upstream Shadow vocabulary and rack detection from one runtime API', async () => {
  const runtime = await text('technic/runtime-v1.js')
  assert.match(runtime, /TECHNIC_MECHANISM_CAPABILITIES/)
  assert.match(runtime, /technicCapabilityV1/)
  assert.match(runtime, /TECHNIC_SHADOW_GROUPS/)
  assert.match(runtime, /classifyTechnicShadowGroupV1/)
  assert.match(runtime, /detectRackPinionMeshesV1/)
  assert.match(runtime, /upstreamShadowVersion/)
  assert.match(runtime, /rackPinionDetectVersion/)
})

test('canonical runtime version generator includes the complete Technic directory', async () => {
  const generator = await text('scripts/version-runtime.mjs')
  assert.match(generator, /['"]technic['"]/)
  assert.match(generator, /for \(const dir of \[/)
  assert.match(generator, /legacyAliases/)
})

test('native rack-pinion motion compiles independently of the Rapier owner', async () => {
  const discovery=await text('mechanics-next/transmission/discovery.js')
  assert.match(discovery,/rack-pinion/)
  assert.match(discovery,/linearMotions/)
  assert.doesNotMatch(discovery,/PhysicsSession/)
})
