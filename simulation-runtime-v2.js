import { TIME_SCALES, normalizeTimeScale, isTestSession, getTimeDiagnostics } from './simulation-time.js'
import { PhysicsSession } from './physics.js'

const TIME_SCALE_KEY = 'bricklab.sim.timeScale.v1'

function readTimeScale() {
  try { return normalizeTimeScale(localStorage.getItem(TIME_SCALE_KEY) ?? 1) }
  catch { return 1 }
}

let preferredTimeScale = readTimeScale()
window.__bricklabRequestedTimeScale = preferredTimeScale

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

window.__bricklabTimeDebug = () => getTimeDiagnostics(currentSession(), PhysicsSession.prototype.step)

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
  const drives=session.mechanicsNextBootstrap
    ?(session.mechanicsNextPhysics?.motorTelemetry?.()??[])
    :(session.motorDrives??[])
  for (const drive of drives) {
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
  const test = isTestSession(session) || (!session && Boolean(document.body.dataset.bricklabTest))
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
