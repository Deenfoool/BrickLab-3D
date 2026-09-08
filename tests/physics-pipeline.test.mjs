import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PHYSICS_PHASES, PHYSICS_PIPELINE_VERSION, runPhysicsMicrostep } from '../physics-pipeline-v1.js'

test('physics microstep has one explicit subsystem order', () => {
  assert.deepEqual(PHYSICS_PHASES, [
    'clear-accumulators', 'motor', 'suspension', 'vehicle-controls', 'drivetrain',
    'tires', 'scenario', 'rapier-step', 'validation', 'metrics', 'vehicle-performance',
  ])

  const calls = []
  const body = { resetForces(wake) { calls.push(`force:${wake}`) } }
  const session = {
    world: { timestep: 0, step() { calls.push('world') } },
    simulationTime: 0,
    components: [{ body }],
    resetCustomTorques() { calls.push('torque-reset') },
    applyMotorTorques() { calls.push('motor') },
    updateSuspensionV2() { calls.push('suspension') },
    updateVehicleControlsV1() { calls.push('vehicle') },
    applyGearCouplingTorques() { calls.push('drivetrain') },
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
    'phase', 'torque-reset', 'force:false', 'motor', 'suspension', 'vehicle',
    'drivetrain', 'tires', 'scenario', 'world', 'validate', 'metrics', 'performance',
  ])
})
