import * as THREE from 'three'
import { PhysicsSession } from './physics.js'
import { findPart } from './parts.js'

const TIME_SCALE_KEY = 'bricklab.sim.timeScale.v1'
const TIME_SCALES = [0.5, 1, 2, 3]
const TAU = Math.PI * 2

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0))
const rpmToRad = rpm => rpm * TAU / 60
const vec = value => ({ x: value.x, y: value.y, z: value.z })

function bodyRotation(body) {
  const q = body.rotation()
  return new THREE.Quaternion(q.x, q.y, q.z, q.w)
}

function normalizeTimeScale(value) {
  const number = Number(value)
  return TIME_SCALES.includes(number) ? number : 1
}

function readTimeScale() {
  try { return normalizeTimeScale(localStorage.getItem(TIME_SCALE_KEY) ?? 1) }
  catch { return 1 }
}

let preferredTimeScale = readTimeScale()
window.__bricklabRequestedTimeScale = preferredTimeScale

function isTestSession(session) {
  return Boolean(session?.scenarioData) || Boolean(session?.scenario && session.scenario !== 'flat') || Boolean(document.body.dataset.bricklabTest)
}

function currentSession() {
  return window.__bricklabPhysicsSession ?? null
}

function setTimeScale(value, { persist = true } = {}) {
  const requested = normalizeTimeScale(value)
  preferredTimeScale = requested
  window.__bricklabRequestedTimeScale = requested
  if (persist) {
    try { localStorage.setItem(TIME_SCALE_KEY, String(requested)) } catch {}
  }

  const session = currentSession()
  const applied = session && isTestSession(session) ? 1 : requested
  if (session) session.timeScale = applied
  window.dispatchEvent(new CustomEvent('bricklab:timescalechange', {
    detail: { requested, applied },
  }))
  return applied
}

function syncDriveCommand(drive) {
  const controls = window.BrickLabControls
  const state = controls?.getRuntime?.(drive.controlId ?? drive.id)
  if (!state || state.type !== 'motor') return

  const userCommand = state.rpm * state.direction
  drive.commandRpm = userCommand
  drive.targetRpm = userCommand * (drive.controlAxisSign ?? 1)
  drive.nominalRpm = Math.abs(userCommand)
  drive.controlRunning = Boolean(state.running && state.direction && state.rpm > 0)
}

function motorVoltage(session, drive) {
  if (Number.isFinite(drive.voltage)) return drive.voltage
  const object = session.objects?.find(object => object.userData?.instanceId === (drive.controlId ?? drive.id))
  const voltage = findPart(object?.userData?.partId)?.mechanics?.motor?.voltage ?? 9
  drive.voltage = voltage
  return voltage
}

// Final motor controller: runtime RPM is a real command/setpoint.
PhysicsSession.prototype.applyMotorTorques = function applyCommandRpmMotorTorques(dt) {
  const testBlocked = this.scenarioData && this.scenarioData.phase !== 'RUN'

  for (const drive of this.motorDrives ?? []) {
    syncDriveCommand(drive)

    const actualRpm = this.relativeMotorRpm(drive)
    const targetRpm = Number(drive.targetRpm) || 0
    const commandAbs = Math.abs(targetRpm)
    const targetSign = Math.sign(targetRpm)
    const running = drive.controlRunning !== false && commandAbs > 0.01

    drive.actualRpm = actualRpm
    drive.setpointErrorRpm = targetRpm - actualRpm

    if (testBlocked || !running) {
      drive.torque = 0
      drive.availableTorqueNm = 0
      drive.load = 0
      drive.current = 0
      drive.powerW = 0
      drive.inputPowerW = 0
      drive.efficiency = 0
      drive.stallTime = 0
      drive.stalled = false
      continue
    }

    const actualAlongCommand = actualRpm * targetSign
    const speedRatio = Math.max(0, actualAlongCommand) / Math.max(commandAbs, 1)
    const stallTorque = Math.max(0, Number(drive.stallTorque) || 0)
    const motoringLimit = stallTorque * clamp(1 - speedRatio, 0, 1)
    const errorRpm = targetRpm - actualRpm
    const errorScale = Math.max(commandAbs * 0.08, 4)
    const controller = clamp(Math.abs(errorRpm) / errorScale, 0, 1)
    const overspeed = actualAlongCommand > commandAbs && Math.sign(actualRpm) === targetSign
    const torqueLimit = overspeed ? stallTorque * 0.38 : motoringLimit
    const torqueMagnitude = torqueLimit * controller
    const torqueSign = Math.sign(errorRpm)

    if (torqueMagnitude > 0 && torqueSign) {
      const axis = drive.localAxisA.clone().applyQuaternion(bodyRotation(drive.bodyA)).normalize()
      const torqueVector = axis.multiplyScalar(torqueMagnitude * torqueSign)
      drive.bodyB.addTorque(vec(torqueVector), true)
      drive.bodyA.addTorque(vec(torqueVector.clone().multiplyScalar(-1)), true)
    }

    drive.availableTorqueNm = torqueLimit
    drive.torque = torqueMagnitude
    drive.load = stallTorque > 0 ? clamp(torqueMagnitude / stallTorque, 0, 1) : 0
    drive.current = (drive.freeCurrent ?? 0.15) + ((drive.stallCurrent ?? 2.2) - (drive.freeCurrent ?? 0.15)) * drive.load
    drive.powerW = Math.abs(torqueMagnitude * rpmToRad(actualRpm))
    drive.inputPowerW = motorVoltage(this, drive) * drive.current
    drive.efficiency = drive.inputPowerW > 0 ? clamp(drive.powerW / drive.inputPowerW, 0, 1) : 0

    const stalled = commandAbs > 10 && Math.abs(actualRpm) < commandAbs * 0.12 && drive.load > 0.82
    drive.stallTime = stalled ? (drive.stallTime ?? 0) + dt : 0
    drive.stalled = drive.stallTime > 0.65
  }
}

// Time scaling lives at the source of truth: the physics loop itself. It reads a
// global command every frame, so the UI cannot become detached from the active
// session. Rapier's dt stays fixed; only the amount of simulated time accumulated
// per real second changes. TEST remains deterministic at 1x.
PhysicsSession.prototype.step = function stepWithAuthoritativeTimeScale() {
  if (!this.world || !this.running) return

  const dt = 1 / this.quality.hz
  const now = performance.now() / 1000
  const previous = this.physicsLastTime || now
  const realFrame = clamp(now - previous, 0, 0.1)
  this.physicsLastTime = now

  const lockedToTest = isTestSession(this)
  const requested = normalizeTimeScale(window.__bricklabRequestedTimeScale ?? preferredTimeScale)
  const scale = lockedToTest ? 1 : requested
  this.timeScale = scale

  this.realElapsedTime = (this.realElapsedTime ?? 0) + realFrame
  const scaledFrame = realFrame * scale
  this.requestedSimulationElapsed = (this.requestedSimulationElapsed ?? 0) + scaledFrame
  this.physicsAccumulator = (this.physicsAccumulator || 0) + scaledFrame

  // At accelerated time we must permit proportionally more fixed physics steps.
  // Otherwise low render FPS silently clamps 2x/3x back toward 1x.
  const baseMax = Math.max(1, this.quality.maxSubsteps || 1)
  const maxSteps = Math.max(baseMax, Math.ceil(baseMax * Math.max(1, scale)))
  const hardAccumulatorLimit = dt * maxSteps * 2
  if (this.physicsAccumulator > hardAccumulatorLimit) this.physicsAccumulator = hardAccumulatorLimit

  let steps = 0
  while (this.physicsAccumulator >= dt && steps < maxSteps) {
    this.simulationTime += dt

    if (this.scenarioData) {
      const settle = this.scenarioData.warmupSeconds || 0.5
      const countdown = this.scenarioData.countdownSeconds || 3
      if (this.simulationTime < settle) {
        this.scenarioData.phase = 'SETTLE'
        this.scenarioData.countdown = countdown
      } else if (this.simulationTime < settle + countdown) {
        this.scenarioData.phase = 'COUNTDOWN'
        this.scenarioData.countdown = Math.max(1, Math.ceil(settle + countdown - this.simulationTime))
      } else {
        this.scenarioData.phase = 'RUN'
        this.scenarioData.countdown = 0
        this.testElapsed += dt
      }
    }

    this.resetCustomTorques()
    for (const component of this.components) component.body.resetForces?.(true)
    this.applyMotorTorques(dt)
    this.applyGearCouplingTorques()
    this.applyTireForcesV2()
    this.applyScenarioForcesV2(dt)
    this.world.timestep = dt
    this.world.step()
    this.updateVehicleMetrics(dt)

    this.physicsAccumulator -= dt
    steps += 1
  }

  this.lastPhysicsSteps = steps
  this.actualSimulationElapsed = this.simulationTime ?? 0
  this.effectiveTimeScale = this.realElapsedTime > 0
    ? this.actualSimulationElapsed / this.realElapsedTime
    : scale

  if (steps) {
    this.syncObjects()
    this.updateTelemetryReadings()
  }
}

function lang() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru' ? 'ru' : 'en'
}

function installStyles() {
  if (document.getElementById('bricklabSimulationRuntimeStyles')) return
  const style = document.createElement('style')
  style.id = 'bricklabSimulationRuntimeStyles'
  style.textContent = `
    .sim-time-scale{display:inline-flex;align-items:center;gap:4px;padding-left:7px;border-left:1px solid rgba(255,255,255,.09)}
    .sim-time-scale>span{font-size:9px;font-weight:800;letter-spacing:.08em;opacity:.58;margin-right:2px}
    .sim-time-scale button{height:25px;min-width:34px;padding:0 7px;border:1px solid rgba(255,255,255,.1);border-radius:6px;background:#171b1f;color:#aeb6bd;font:700 10px/1 inherit;cursor:pointer}
    .sim-time-scale button:hover:not(:disabled){border-color:#4b6657;color:#d9fbe7}
    .sim-time-scale button.active{background:#173022;border-color:#3f7656;color:#74e6a6}
    .sim-time-scale button:disabled{cursor:not-allowed;opacity:.32}
    .sim-time-scale.test-locked button[data-time-scale="1"]{opacity:1}
    .sim-time-lock{font-size:9px;color:#f4c86a;white-space:nowrap}
    .sim-time-readout{font-size:9px;color:#9eabb5;white-space:nowrap;font-variant-numeric:tabular-nums;margin-left:3px}
    .control-runtime-motor output{min-width:155px;text-align:right}
    @media(max-width:900px){.sim-time-scale>span,.sim-time-lock,.sim-time-readout{display:none}.sim-time-scale button{min-width:31px;padding:0 5px}.control-runtime-motor output{min-width:110px}}
  `
  document.head.append(style)
}

function installTimeScaleUi() {
  installStyles()
  const controls = document.getElementById('simControls')
  const state = document.getElementById('simState')
  if (!controls || !state) return requestAnimationFrame(installTimeScaleUi)
  if (document.getElementById('simTimeScale')) return

  const group = document.createElement('div')
  group.id = 'simTimeScale'
  group.className = 'sim-time-scale'
  group.innerHTML = `<span>TIME</span>${TIME_SCALES.map(scale => `<button type="button" data-time-scale="${scale}">${scale}×</button>`).join('')}<small class="sim-time-lock" hidden></small><small class="sim-time-readout" data-time-readout>REAL 0.0 · SIM 0.0</small>`
  controls.insertBefore(group, state)

  group.addEventListener('click', event => {
    const button = event.target.closest('[data-time-scale]')
    if (!button || button.disabled) return
    setTimeScale(Number(button.dataset.timeScale))
    refreshRuntimeUi()
  })

  refreshRuntimeUi()
}

function refreshMotorDeck() {
  const session = currentSession()
  if (!session) return
  for (const drive of session.motorDrives ?? []) {
    const id = drive.controlId ?? drive.id
    const row = document.querySelector(`[data-control-id="${CSS.escape(id)}"]`)
    const output = row?.querySelector('[data-runtime-rpm-label]')
    if (!output) continue
    const state = window.BrickLabControls?.getRuntime?.(id)
    const setRpm = state?.type === 'motor' ? state.rpm * state.direction : (drive.commandRpm ?? 0)
    const actual = Number(drive.actualRpm) || 0
    const load = Math.round((Number(drive.load) || 0) * 100)
    output.textContent = lang() === 'ru'
      ? `ЗАД ${Math.round(setRpm)} · ФАКТ ${Math.round(actual)} об/мин · ${load}%`
      : `SET ${Math.round(setRpm)} · ACT ${Math.round(actual)} RPM · ${load}%`
  }
}

function refreshRuntimeUi() {
  const group = document.getElementById('simTimeScale')
  if (!group) return
  const session = currentSession()
  const test = isTestSession(session)
  const requested = normalizeTimeScale(window.__bricklabRequestedTimeScale ?? preferredTimeScale)
  const applied = test ? 1 : requested

  group.classList.toggle('test-locked', test)
  group.querySelectorAll('[data-time-scale]').forEach(button => {
    const value = Number(button.dataset.timeScale)
    button.classList.toggle('active', value === applied)
    button.disabled = test && value !== 1
  })

  const lock = group.querySelector('.sim-time-lock')
  if (lock) {
    lock.hidden = !test
    lock.textContent = lang() === 'ru' ? 'ТЕСТ · 1×' : 'TEST · 1×'
  }

  const readout = group.querySelector('[data-time-readout]')
  if (readout) {
    const real = Number(session?.realElapsedTime) || 0
    const sim = Number(session?.actualSimulationElapsed ?? session?.simulationTime) || 0
    const effective = real > 0 ? sim / real : applied
    readout.textContent = `REAL ${real.toFixed(1)} · SIM ${sim.toFixed(1)} · ${effective.toFixed(2)}×`
    readout.title = `Requested ${applied}× · effective ${effective.toFixed(2)}× · last ${session?.lastPhysicsSteps ?? 0} fixed steps`
  }

  if (session) session.timeScale = applied
  refreshMotorDeck()
}

installTimeScaleUi()
window.addEventListener('bricklab:timescalechange', refreshRuntimeUi)
window.addEventListener('bricklab:controls-runtime-reset', refreshRuntimeUi)
window.addEventListener('bricklab:control-runtime-change', refreshRuntimeUi)
setInterval(refreshRuntimeUi, 100)

window.BrickLabSimulationTime = {
  scales: [...TIME_SCALES],
  getPreferred: () => preferredTimeScale,
  getApplied: () => isTestSession(currentSession()) ? 1 : normalizeTimeScale(window.__bricklabRequestedTimeScale ?? preferredTimeScale),
  set: setTimeScale,
}
