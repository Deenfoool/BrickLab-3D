import { PhysicsSession } from './physics.js'
import { SURFACES } from './physical-parts.js'

const KEY = 'bricklab.physics.v2.surface'
const VALID = new Set(['auto', ...Object.keys(SURFACES)])
const read = () => { const value = localStorage.getItem(KEY) || 'auto'; return VALID.has(value) ? value : 'auto' }

const originalTires = PhysicsSession.prototype.applyTireForcesV2
PhysicsSession.prototype.applyTireForcesV2 = function applySelectedSurface(...args) {
  const selected = read()
  if (selected === 'auto') return originalTires.apply(this, args)
  const original = this.scenarioData
  this.scenarioData = original ? { ...original, surface: selected } : { surface: selected, __surfaceOnly: true }
  const result = originalTires.apply(this, args)
  this.scenarioData = original
  this.surfaceOverride = selected
  return result
}

function injectSurfaceControl() {
  const menu = document.getElementById('physicsV2Menu')
  if (!menu || menu.querySelector('[data-pv2-surface]')) return
  const note = menu.querySelector('.pv2-note')
  const label = document.createElement('label')
  label.innerHTML = `SURFACE<select data-pv2-surface><option value="auto">AUTO · TEST DEFAULT</option><option value="concrete">CONCRETE</option><option value="asphalt">ASPHALT</option><option value="dirt">DIRT</option><option value="gravel">GRAVEL</option><option value="mud">MUD</option><option value="ice">ICE</option></select>`
  menu.insertBefore(label, note || null)
  const select = label.querySelector('select')
  select.value = read()
  select.onchange = () => {
    localStorage.setItem(KEY, select.value)
    const activeTest = document.body.dataset.bricklabTest
    const build = document.querySelector('.mode[data-mode="build"]')
    const simulate = document.querySelector('.mode[data-mode="simulate"]')
    if (activeTest) document.querySelector('.mode[data-mode="test"]')?.click()
    else if (simulate?.classList.contains('active')) { build?.click(); requestAnimationFrame(() => simulate.click()) }
  }
}

new MutationObserver(injectSurfaceControl).observe(document.body, { childList: true, subtree: true })
injectSurfaceControl()
window.BrickLabPhysicsV2Surface = { get: read, surfaces: SURFACES }
