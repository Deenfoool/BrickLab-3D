// The only clock and world.step() owner. No prototype patches or DOM timers.
export const STEP_OWNER = 'simulation-time-authoritative-v4'
export const TIME_SCALES = Object.freeze([0.5, 1, 2, 3])
export const MAX_REAL_FRAME = 0.25
export const normalizeTimeScale = value => TIME_SCALES.includes(Number(value)) ? Number(value) : 1
export const isTestSession = session => Boolean(session?.isTestSession || session?.scenarioData || (session?.scenario && session.scenario !== 'flat'))

export function resetPhysicsClock(session, now = performance.now() / 1000) {
  session.physicsLastTime = now
  session.physicsAccumulator = 0
  session.realElapsedTime = 0
  session.requestedSimulationElapsed = 0
  session.actualSimulationElapsed = 0
  session.droppedSimulationTime = 0
  session.lastPhysicsSteps = 0
  session.simulationTime = 0
  session.testElapsed = 0
  session.physicsStabilityMetrics = { peakLinearSpeed: 0, peakAngularRpm: 0 }
}

function advanceTestPhase(session, dt) {
  const scenario = session.scenarioData
  if (!scenario) return
  const settle = scenario.warmupSeconds ?? 0.5
  const countdown = scenario.countdownSeconds ?? 3
  if (session.simulationTime < settle) {
    scenario.phase = 'SETTLE'
    scenario.countdown = countdown
  } else if (session.simulationTime < settle + countdown) {
    scenario.phase = 'COUNTDOWN'
    scenario.countdown = Math.max(1, Math.ceil(settle + countdown - session.simulationTime))
  } else {
    scenario.phase = 'RUN'
    scenario.countdown = 0
    session.testElapsed += dt
  }
  scenario.elapsed = session.testElapsed
}

function runPhysicsStep(session, dt) {
  // Set dt before any force/controller reads it; Rapier integrates this same dt.
  session.world.timestep = dt
  session.simulationTime += dt
  advanceTestPhase(session, dt)
  session.resetCustomTorques()
  // Clearing an accumulator must not wake a body that Rapier already put to sleep.
  // Real motors/contacts/scenario forces explicitly wake bodies when they act.
  for (const component of session.components) component.body.resetForces?.(false)
  session.applyMotorTorques(dt)
  session.updateSuspensionV2?.(dt)
  session.applyGearCouplingTorques(dt)
  session.applyTireForcesV2?.(dt)
  session.applyScenarioForcesV2?.(dt)
  session.world.step()
  // Stability layer never clamps finite velocities; it only rejects NaN/Infinity
  // and records peaks so regressions are visible in tests/diagnostics.
  session.validatePhysicsState?.()
  session.updateVehicleMetrics(dt)
}

export function stepPhysicsSession(session, now = performance.now() / 1000) {
  if (!session.world) return
  if (!session.running) {
    session.physicsLastTime = now
    session.lastPhysicsSteps = 0
    return
  }
  const realFrame = Math.max(0, now - (session.physicsLastTime ?? now))
  session.physicsLastTime = now
  const scale = isTestSession(session) ? 1 : normalizeTimeScale(window.__bricklabRequestedTimeScale ?? 1)
  const dt = 1 / (session.quality?.hz ?? 60)
  session.timeScale = scale
  session.realElapsedTime = (session.realElapsedTime ?? 0) + realFrame
  session.requestedSimulationElapsed = (session.requestedSimulationElapsed ?? 0) + realFrame * scale
  // Long stalls/background gaps are explicitly accounted for, never hidden in
  // the effective scale. Ordinary frames down to 4 FPS are integrated in full.
  const acceptedFrame = Math.min(realFrame, MAX_REAL_FRAME)
  session.droppedSimulationTime = (session.droppedSimulationTime ?? 0) + (realFrame - acceptedFrame) * scale
  session.physicsAccumulator = (session.physicsAccumulator ?? 0) + acceptedFrame * scale
  const maxSteps = Math.max(
    Math.ceil((session.quality?.maxSubsteps ?? 4) * Math.max(1, scale)),
    Math.ceil(MAX_REAL_FRAME * scale / dt),
  )
  let steps = 0
  while (session.physicsAccumulator + dt * 1e-9 >= dt && steps < maxSteps) {
    runPhysicsStep(session, dt)
    session.physicsAccumulator = Math.max(0, session.physicsAccumulator - dt)
    steps += 1
  }
  session.lastPhysicsSteps = steps
  session.actualSimulationElapsed = session.simulationTime
  session.effectiveTimeScale = session.realElapsedTime > 0 ? session.simulationTime / session.realElapsedTime : scale
  if (steps) {
    session.syncObjects()
    session.updateTelemetryReadings()
  }
}

export function getTimeDiagnostics(session, step) {
  const requestedScale = normalizeTimeScale(window.__bricklabRequestedTimeScale ?? 1)
  const appliedScale = isTestSession(session) ? 1 : requestedScale
  const realElapsed = session?.realElapsedTime ?? 0
  const simulationElapsed = session?.simulationTime ?? 0
  const physicsHz = session?.quality?.hz ?? 120
  return {
    requestedScale, appliedScale, realElapsed, simulationElapsed,
    effectiveScale: realElapsed > 0 ? simulationElapsed / realElapsed : appliedScale,
    physicsHz, baseDt: 1 / physicsHz,
    accumulator: session?.physicsAccumulator ?? 0,
    lastSubsteps: session?.lastPhysicsSteps ?? 0,
    activeStepOwner: (session?.step ?? step)?.__bricklabOwner ?? 'unknown',
    worldTimestep: session?.world?.timestep ?? null,
    scenario: session?.scenario ?? null,
    test: isTestSession(session), running: Boolean(session?.running),
    requestedSimulationElapsed: session?.requestedSimulationElapsed ?? 0,
    droppedSimulationTime: session?.droppedSimulationTime ?? 0,
    stability: session?.physicsStabilityMetrics ?? null,
  }
}
