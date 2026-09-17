import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('production runtime mounts the Technic semantic layer before editor mechanics are consumed', async () => {
  const architecture = await text('architecture/runtime-v1.js')
  assert.match(architecture, /technic\/runtime-v1\.js\?v=technic-family-20260917-differential-bevel-v1/)
})

test('Architecture and Connector V4 physics use the same Technic-aware drivetrain analyzer', async () => {
  const [architecture, guard, drivetrain] = await Promise.all([
    text('architecture/runtime-v1.js'),
    text('connectors-v4/physics-guard-v4.js'),
    text('technic/drivetrain-v1.js'),
  ])
  assert.match(architecture, /analyzeTechnicAwareDrivetrain/)
  assert.match(guard, /analyzeTechnicAwareDrivetrain/)
  assert.match(guard, /technic-family-20260917-differential-bevel-v1/)
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

test('rack-pinion BUILD snap remains placement-only and never fabricates a connector graph edge', async () => {
  const [bridge, rack] = await Promise.all([
    text('connectors-v4/snapping-bridge-v4.js'),
    text('technic/rack-pinion-v1.js'),
  ])
  assert.match(bridge, /findRackPinionSnapCandidateV1/)
  assert.match(bridge, /applyRackPinionSnapV1/)
  assert.match(bridge, /candidate\?\.kind === 'rack-pinion-mesh'/)
  assert.match(rack, /kind:'rack-pinion-mesh'/)
  assert.match(rack, /placementOnly:true/)
  assert.doesNotMatch(rack, /createConnection|commitActiveCandidate|connectionGraph/)
})

test('rack-pinion Kinematics extension is additive and does not become a SIMULATE owner', async () => {
  const [rackRuntime, guard, ownership] = await Promise.all([
    text('kinematics/rack-pinion-runtime-v1.js'),
    text('connectors-v4/physics-guard-v4.js'),
    text('physics-ownership-v1.js'),
  ])
  assert.match(rackRuntime, /bricklab:kinematicsenter/)
  assert.match(rackRuntime, /bricklab:kinematicsexit/)
  assert.doesNotMatch(rackRuntime, /PhysicsSession|installConnectorPhysicsV4|Rapier/)
  assert.match(guard, /installConnectorPhysicsV4/)
  assert.doesNotMatch(guard, /rack-pinion-runtime-v1/)
  assert.match(ownership, /PhysicsSession/)
})
