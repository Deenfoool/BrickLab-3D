const MODE_KEY = 'bricklab.transmission.mode.v1'
const PROJECT_KEY = 'bricklab.project.v2'
const MODES = ['forward', 'neutral', 'reverse']

function readMode() {
  const saved = localStorage.getItem(MODE_KEY)
  return MODES.includes(saved) ? saved : 'forward'
}

function readProjectParts() {
  try {
    const project = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null')
    return Array.isArray(project?.parts) ? project.parts : []
  } catch {
    return []
  }
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
  decorateTelemetry()

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

function decorateTelemetry() {
  const panel = document.getElementById('drivetrainTelemetry')
  if (!panel) return

  const parts = readProjectParts()
  const gearboxCount = parts.filter(part => part.partId === 'gearbox-fnr').length
  const differentialCount = parts.filter(part => part.partId === 'open-differential').length
  const summary = panel.querySelector('.telemetry-summary')
  const physicalMeshCount = Number(summary?.querySelector('span:nth-child(3) b')?.textContent || 0)
  const gearSection = [...panel.querySelectorAll('.telemetry-section')]
    .find(section => section.querySelector('label')?.textContent?.trim() === 'GEARS')

  if (gearSection) {
    const rows = [...gearSection.querySelectorAll('.telemetry-gear')]
    rows.forEach((row, index) => row.classList.toggle('semantic-hidden', index >= physicalMeshCount))

    gearSection.querySelector('.powertrain-badge')?.remove()
    if (gearboxCount || differentialCount) {
      const badge = document.createElement('div')
      badge.className = 'powertrain-badge'
      const modeLabel = mode === 'forward' ? 'F' : mode === 'neutral' ? 'N' : 'R'
      const modeClass = mode === 'neutral' ? 'neutral' : mode === 'reverse' ? 'reverse' : ''
      badge.innerHTML = `
        ${gearboxCount ? `<span>GEARBOX <b class="${modeClass}">${modeLabel}</b>${gearboxCount > 1 ? ` ×${gearboxCount}` : ''}</span>` : ''}
        ${differentialCount ? `<span>DIFF <b>OPEN</b>${differentialCount > 1 ? ` ×${differentialCount}` : ''}</span>` : ''}
      `
      gearSection.append(badge)
    }
  }
}

installControls()

let decorateQueued = false
new MutationObserver(() => {
  if (decorateQueued) return
  decorateQueued = true
  requestAnimationFrame(() => {
    decorateQueued = false
    decorateTelemetry()
  })
}).observe(document.body, { childList: true, subtree: true })

window.addEventListener('bricklab:set-transmission', event => {
  setMode(event.detail?.mode)
})
