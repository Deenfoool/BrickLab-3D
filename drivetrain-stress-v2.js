import { PhysicsSession } from './physics.js'

const KEY = 'bricklab.physics.v2.failure-mode'
const MODES = new Set(['off', 'warn', 'break'])
const readMode = () => { const value = localStorage.getItem(KEY) || 'warn'; return MODES.has(value) ? value : 'warn' }

const oldBuildCouplers = PhysicsSession.prototype.buildGearCouplers
PhysicsSession.prototype.buildGearCouplers = function buildBoundedCouplers(...args) {
  const result = oldBuildCouplers.apply(this, args)
  for (const coupling of this.gearCouplers ?? []) {
    const limit = coupling.id?.startsWith('gear:') ? 0.060 : coupling.id?.startsWith('transmission:') ? 0.080 : coupling.id?.startsWith('differential:') ? 0.075 : 0.060
    coupling.maxTorqueA = Math.min(Number.isFinite(coupling.maxTorqueA) ? coupling.maxTorqueA : limit, limit)
    coupling.maxTorqueB = Math.min(Number.isFinite(coupling.maxTorqueB) ? coupling.maxTorqueB : limit, limit)
    coupling.failureLimitNm = Math.max(.0001, Math.min(coupling.maxTorqueA, coupling.maxTorqueB))
    coupling.overstressTime = 0
    coupling.failed = false
    coupling.slipping = false
    coupling.stressRatio = 0
  }
  return result
}

const oldApply = PhysicsSession.prototype.applyGearCouplingTorques
PhysicsSession.prototype.applyGearCouplingTorques = function applyStressAwareCouplers(...args) {
  const result = oldApply.apply(this, args)
  const mode = readMode(), dt = 1 / (this.quality?.hz ?? 120)
  for (const coupling of this.gearCouplers ?? []) {
    const limit = Math.max(.0001, coupling.failureLimitNm ?? Math.min(coupling.maxTorqueA ?? .06, coupling.maxTorqueB ?? .06))
    const request = coupling.requestedTorque ?? 0
    coupling.stressRatio = request / limit
    coupling.slipping = !coupling.failed && request > limit * 1.01
    coupling.overstressTime = coupling.stressRatio > 1.15 ? (coupling.overstressTime ?? 0) + dt : Math.max(0, (coupling.overstressTime ?? 0) - dt * 2)
    if (mode === 'break' && coupling.overstressTime > .30) {
      coupling.failed = true
      coupling.slipping = false
      coupling.transferTorque = 0
    }
  }
  return result
}

const oldMount = PhysicsSession.prototype.mountTelemetry
PhysicsSession.prototype.mountTelemetry = function mountStressTelemetry(...args) {
  const result = oldMount.apply(this, args)
  const panel = document.getElementById('drivetrainTelemetry')
  if (!panel || !this.gearCouplers?.length || panel.querySelector('[data-stress-v2]')) return result
  const section = document.createElement('div')
  section.className = 'telemetry-section drivetrain-stress-v2'
  section.dataset.stressV2 = 'true'
  section.innerHTML = `<label>DRIVETRAIN STRESS · REQUEST · TRANSFER · LIMIT</label>${this.gearCouplers.slice(0,8).map((c,i)=>`<div class="stress-row" data-stress-id="${c.id}"><span>${c.id.startsWith('gear:')?'GEAR':c.id.startsWith('transmission:')?'BOX':c.id.startsWith('differential:')?'DIFF':'LINK'} ${i+1}</span><b data-stress-request>0</b><b data-stress-transfer>0</b><small data-stress-limit>${(c.failureLimitNm??0).toFixed(3)}</small></div>`).join('')}`
  panel.append(section)
  return result
}

const oldUpdate = PhysicsSession.prototype.updateTelemetryReadings
PhysicsSession.prototype.updateTelemetryReadings = function updateStressTelemetry(...args) {
  const result = oldUpdate.apply(this, args)
  for (const coupling of this.gearCouplers ?? []) {
    const row = document.querySelector(`[data-stress-id="${CSS.escape(coupling.id)}"]`)
    if (!row) continue
    row.querySelector('[data-stress-request]').textContent = `${(coupling.requestedTorque ?? 0).toFixed(3)}`
    row.querySelector('[data-stress-transfer]').textContent = coupling.failed ? 'FAILED' : `${(coupling.transferTorque ?? 0).toFixed(3)}`
    row.classList.toggle('stress-slip', coupling.slipping)
    row.classList.toggle('stress-failed', coupling.failed)
    row.title = `${Math.round((coupling.stressRatio ?? 0) * 100)}% stress · ${(coupling.lossTorque ?? 0).toFixed(4)} N·m loss`
  }
  return result
}

function injectControl() {
  const menu = document.getElementById('physicsV2Menu')
  if (!menu || menu.querySelector('[data-pv2-failure]')) return
  const note = menu.querySelector('.pv2-note')
  const label = document.createElement('label')
  label.innerHTML = `OVERLOAD<select data-pv2-failure><option value="off">OFF</option><option value="warn">WARN / SLIP</option><option value="break">BREAK</option></select>`
  menu.insertBefore(label, note || null)
  const select = label.querySelector('select')
  select.value = readMode()
  select.onchange = () => { localStorage.setItem(KEY, select.value) }
}
new MutationObserver(injectControl).observe(document.body, { childList: true, subtree: true })
injectControl()
