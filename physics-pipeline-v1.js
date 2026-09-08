export const PHYSICS_PIPELINE_VERSION = 'physics-pipeline-v2'

export const PHYSICS_PHASES = Object.freeze([
  'clear-accumulators',
  'motor',
  'suspension',
  'vehicle-controls',
  'vehicle-drive',
  'drivetrain',
  'tires',
  'scenario',
  'rapier-step',
  'validation',
  'metrics',
  'vehicle-performance',
])

function call(session, name, ...args) {
  const fn = session?.[name]
  if (typeof fn === 'function') return fn.apply(session, args)
  return undefined
}

/**
 * Authoritative order of one fixed physics microstep.
 * The clock owns WHEN a step happens; this pipeline owns WHAT happens inside it.
 * Subsystems remain replaceable, but they cannot silently reorder integration.
 */
export function runPhysicsMicrostep(session, dt, { advanceTestPhase } = {}) {
  if (!session?.world || !(dt > 0)) return

  session.world.timestep = dt
  session.simulationTime = (session.simulationTime ?? 0) + dt
  advanceTestPhase?.(session, dt)

  call(session, 'resetCustomTorques')
  // Clearing force accumulators is bookkeeping and must not wake sleeping bodies.
  for (const component of session.components ?? []) component.body.resetForces?.(false)

  call(session, 'applyMotorTorques', dt)
  call(session, 'updateSuspensionV2', dt)
  call(session, 'updateVehicleControlsV1', dt)
  call(session, 'updateVehicleDriveV2', dt)
  call(session, 'applyGearCouplingTorques', dt)
  call(session, 'applyTireForcesV2', dt)
  call(session, 'applyScenarioForcesV2', dt)

  session.world.step()
  call(session, 'validatePhysicsState')
  call(session, 'updateVehicleMetrics', dt)
  call(session, 'updateVehiclePerformanceV1', dt)

  session.physicsPipelineMetrics ??= { steps: 0, version: PHYSICS_PIPELINE_VERSION }
  session.physicsPipelineMetrics.steps += 1
  session.physicsPipelineMetrics.lastDt = dt
}

globalThis.BrickLabPhysicsPipeline = Object.freeze({
  version: PHYSICS_PIPELINE_VERSION,
  phases: PHYSICS_PHASES,
})
