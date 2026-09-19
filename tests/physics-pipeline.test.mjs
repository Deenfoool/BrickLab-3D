import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PHYSICS_PHASES, PHYSICS_PIPELINE_VERSION, runPhysicsMicrostep } from '../physics-pipeline-v1.js'

const root = new URL('../', import.meta.url)
const text = path => readFile(new URL(path, root), 'utf8')

test('physics microstep has one explicit subsystem order', () => {
  assert.deepEqual(PHYSICS_PHASES, [
    'clear-accumulators', 'vehicle-controls', 'vehicle-drive', 'mechanics-next',
    'tires', 'scenario', 'rapier-step', 'mechanics-next-projection', 'validation', 'metrics', 'vehicle-performance',
  ])

  const calls = []
  const body = { resetForces(wake) { calls.push(`force:${wake}`) } }
  const session = {
    world: { timestep: 0, step() { calls.push('world') } },
    simulationTime: 0,
    components: [{ body }],
    resetCustomTorques() { calls.push('torque-reset') },
    mechanicsNextPhysics:{ beforeStep() { calls.push('mechanics-next') }, afterStep() { calls.push('native-projection') } },
    updateVehicleControlsV1() { calls.push('vehicle') },
    updateVehicleDriveV2() { calls.push('drive') },
    applyTireForcesV2() { calls.push('tires') },
    applyScenarioForcesV2() { calls.push('scenario') },
    validatePhysicsState() { calls.push('validate') },
    updateVehicleMetrics() { calls.push('metrics') },
    updateVehiclePerformanceV1() { calls.push('performance') },
  }

  runPhysicsMicrostep(session, 1 / 120, { advanceTestPhase() { calls.push('phase') } })
  assert.equal(session.world.timestep, 1 / 120)
  assert.equal(session.simulationTime, 1 / 120)
  assert.equal(session.physicsPipelineMetrics.version, PHYSICS_PIPELINE_VERSION)
  assert.deepEqual(calls, [
    'phase', 'torque-reset', 'force:false', 'vehicle', 'drive',
    'mechanics-next', 'tires', 'scenario', 'world', 'native-projection', 'validate', 'metrics', 'performance',
  ])
})

test('transparent physics middleware preserves non-mechanical ownership metadata', async () => {
  const [diagnostics, controls, testlab] = await Promise.all([
    text('physics-stage-diagnostics.js'),
    text('mechanism-controls-core.js'),
    text('testlab/runtime-v2.js'),
  ])
  assert.match(diagnostics,/original\?\.__bricklabOwner/,'stage diagnostics preserves createJoint/chassis owner metadata')
  assert.match(diagnostics,/wrapper\.__bricklabOwner = original\.__bricklabOwner/)
  assert.doesNotMatch(controls,/prototype\.applyMotorTorques|prototype\.applyGearCouplingTorques/)
  assert.match(testlab,/originalTireForces\.__bricklabOwner/,'TEST Lab preserves outer tire owner metadata')
  assert.match(testlab,/applyTireForcesV2\.__bricklabOwner = originalTireForces\.__bricklabOwner/)
})
