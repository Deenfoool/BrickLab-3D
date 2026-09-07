const MODE_KEY = 'bricklab.transmission.mode.v1'
const MODES = ['forward', 'neutral', 'reverse']

function readMode() {
  const saved = localStorage.getItem(MODE_KEY)
  return MODES.includes(saved) ? saved : 'forward'
}

let mode = readMode()
window.__bricklabTransmissionMode = mode

function setMode(next, { restart = true } = {}) {
  if (!MODES.includes(next)) return
  mode = next
  window.__bricklabTransmissionMode = next
  localStorage.setItem(MODE_KEY, next)

  document.querySelectorAll('[data-transmission-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.transmissionMode === next)
  })
  const label = document.querySelector('[data-transmission-label]')
  if (label) label.textContent = next === 'forward' ? 'F' : next === 'neutral' ? 'N' : 'R'

  if (!restart) return
  const inHillClimb = document.body.dataset.bricklabTest === 'hill-climb'
  if (inHillClimb) {
    document.querySelector('.mode[data-mode="test"]')?.click()
    return
  }

  const simulate = document.querySelector('.mode[data-mode="simulate"]')
  if (simulate?.classList.contains('active')) document.getElementById('simReset')?.click()
}

function installControls() {
  const actions = document.querySelector('.top-actions')
  const shortcutButton = document.getElementById('shortcutsBtn')
  if (!actions || !shortcutButton) {
    requestAnimationFrame(installControls)
    return
  }
  if (document.getElementById('transmissionControl')) return

  const control = document.createElement('div')
  control.id = 'transmissionControl'
  control.className = 'transmission-control'
  control.title = 'F/N/R gearbox mode. Applies to F/N/R Gearbox parts.'
  control.innerHTML = `
    <span class="transmission-icon"><i data-lucide="git-branch"></i></span>
    <div class="transmission-modes" role="group" aria-label="Transmission mode">
      <button type="button" data-transmission-mode="forward" aria-label="Forward">F</button>
      <button type="button" data-transmission-mode="neutral" aria-label="Neutral">N</button>
      <button type="button" data-transmission-mode="reverse" aria-label="Reverse">R</button>
    </div>
  `

  actions.insertBefore(control, shortcutButton)
  control.querySelectorAll('[data-transmission-mode]').forEach(button => {
    button.onclick = () => setMode(button.dataset.transmissionMode)
  })
  setMode(mode, { restart: false })
  window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
}

installControls()

window.addEventListener('bricklab:set-transmission', event => {
  setMode(event.detail?.mode)
})
