import { PhysicsSession } from './physics.js'

const ALLOWED_SCALES = [0.5, 1, 2, 3]
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0))

function normalizeScale(value) {
  const number = Number(value)
  return ALLOWED_SCALES.includes(number) ? number : 1
}

function isTestSession(session) {
  return Boolean(session?.scenarioData) || Boolean(session?.scenario && session.scenario !== 'flat') || Boolean(document.body.dataset.bricklabTest)
}

function updateTestPhase(session, dt) {
  if (!session.scenarioData) return
  const settle = session.scenarioData.warmupSeconds || 0.5
  const countdown = session.scenarioData.countdownSeconds || 3
  if (session.simulationTime < settle) {
    session.scenarioData.phase = 'SETTLE'
    session.scenarioData.countdown = countdown
  } else if (session.simulationTime < settle + countdown) {
    session.scenarioData.phase = 'COUNTDOWN'
    session.scenarioData.countdown = Math.max(1, Math.ceil(settle + countdown - session.simulationTime))
  } else {
    session.scenarioData.phase = 'RUN'
    session.scenarioData.countdown = 0
    session.testElapsed += dt
  }
}

function physicsMicroStep(session, dt) {
  session.simulationTime += dt
  updateTestPhase(session, dt)

  session.resetCustomTorques()
  for (const component of session.components) component.body.resetForces?.(true)
  session.applyMotorTorques(dt)
  session.applyGearCouplingTorques()
  session.applyTireForcesV2()
  session.applyScenarioForcesV2(dt)

  session.world.timestep = dt
  session.world.step()
  session.updateVehicleMetrics(dt)
}

// This is the final owner of PhysicsSession.step().
// The real-time accumulator always runs at 1x. Time scale changes the amount of
// PHYSICAL time integrated during each nominal physics tick. For 2x/3x we split
// that physical duration into microsteps no larger than the normal base dt, so
// Rapier keeps the same integration stability while the world actually advances
// two or three times faster. At 0.5x the physical dt is halved, so free fall,
// motors, collisions and every other dynamic process visibly run in slow motion.
PhysicsSession.prototype.step = function stepWithPhysicalTimeScaleV3() {
  if (!this.world || !this.running) return

  const baseDt = 1 / this.quality.hz
  const now = performance.now() / 1000
  const previous = this.physicsLastTime || now
  const realFrame = clamp(now - previous, 0, 0.05)
  this.physicsLastTime = now

  const requested = normalizeScale(window.__bricklabRequestedTimeScale ?? 1)
  const scale = isTestSession(this) ? 1 : requested
  this.timeScale = scale
  window.__bricklabAppliedPhysicalTimeScale = scale
  window.__bricklabTimeIntegrator = 'physical-dt-v3'

  this.realElapsedTime = (this.realElapsedTime ?? 0) + realFrame
  this.physicsAccumulator = (this.physicsAccumulator || 0) + realFrame

  const maxNominalSteps = Math.max(1, this.quality.maxSubsteps || 1)
  const hardAccumulatorLimit = baseDt * maxNominalSteps * 2
  if (this.physicsAccumulator > hardAccumulatorLimit) this.physicsAccumulator = hardAccumulatorLimit

  let nominalSteps = 0
  let microStepsTotal = 0

  while (this.physicsAccumulator >= baseDt && nominalSteps < maxNominalSteps) {
    const simulatedSlice = baseDt * scale
    const microSteps = scale > 1 ? Math.ceil(scale) : 1
    const microDt = simulatedSlice / microSteps

    for (let i = 0; i < microSteps; i += 1) {
      physicsMicroStep(this, microDt)
      microStepsTotal += 1
    }

    this.physicsAccumulator -= baseDt
    nominalSteps += 1
  }

  this.lastPhysicsSteps = nominalSteps
  this.lastPhysicsMicroSteps = microStepsTotal
  this.actualSimulationElapsed = this.simulationTime ?? 0
  this.effectiveTimeScale = this.realElapsedTime > 0
    ? this.actualSimulationElapsed / this.realElapsedTime
    : scale

  if (nominalSteps) {
    this.syncObjects()
    this.updateTelemetryReadings()
  }
}

window.__bricklabTimeIntegrator = 'physical-dt-v3'
