const PROJECT_KEY = 'bricklab.project.v2'
const BENCH_BACKUP_KEY = 'bricklab.powertrain.backup.v1'
const MODES = ['forward', 'neutral', 'reverse']

function api() { return window.BrickLabControls }
function readProject() { try { return JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null') } catch { return null } }

function transmissionEntries() {
  const controls = api()
  if (!controls) return []
  const runtime = controls.getRuntimeEntries().filter(([, state]) => state.type === 'transmission')
  if (runtime.length) return runtime.map(([id, state]) => ({ id, mode: state.mode, runtime: true }))
  return controls.getObjects().map(object => {
    const config = controls.getConfig(object.userData.instanceId)
    return config?.type === 'transmission' ? { id: object.userData.instanceId, mode: config.transmission.initialMode, runtime: false } : null
  }).filter(Boolean)
}

function currentMasterMode() {
  const entries = transmissionEntries()
  if (!entries.length) return 'forward'
  const first = entries[0].mode
  return entries.every(item => item.mode === first) ? first : 'mixed'
}

function syncButtons() {
  const mode = currentMasterMode()
  document.querySelectorAll('[data-transmission-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.transmissionMode === mode)
  })
  document.getElementById('transmissionControl')?.classList.toggle('mixed', mode === 'mixed')
  decorateTelemetry()
}

function setMasterMode(next) {
  if (!MODES.includes(next) || !api()) return
  const runtime = api().getRuntimeEntries().filter(([, state]) => state.type === 'transmission')
  if (runtime.length) {
    api().setAllTransmissions(next)
  } else {
    for (const object of api().getObjects()) {
      const config = api().getConfig(object.userData.instanceId)
      if (config?.type === 'transmission') api().updateConfig(object.userData.instanceId, { transmission: { initialMode: next } })
    }
  }
  syncButtons()
}

async function toggleBench() {
  const project = readProject()
  const backup = localStorage.getItem(BENCH_BACKUP_KEY)
  const showingBench = project?.name === 'FNR Powertrain Bench' && backup

  if (showingBench) {
    localStorage.setItem(PROJECT_KEY, backup)
    localStorage.removeItem(BENCH_BACKUP_KEY)
    location.reload()
    return
  }

  if (project?.parts?.length) localStorage.setItem(BENCH_BACKUP_KEY, JSON.stringify(project))
  try {
    const response = await fetch('./examples/powertrain-bench.bricklab', { cache: 'no-store' })
    if (!response.ok) throw new Error(`Powertrain bench HTTP ${response.status}`)
    const bench = await response.json()
    localStorage.setItem(PROJECT_KEY, JSON.stringify(bench))
    location.reload()
  } catch (error) {
    console.error('Could not load FNR Powertrain Bench', error)
  }
}

function installControls() {
  const actions = document.querySelector('.top-actions')
  const shortcutButton = document.getElementById('shortcutsBtn')
  if (!actions || !shortcutButton || !api()) return requestAnimationFrame(installControls)
  if (document.getElementById('transmissionControl')) return

  const project = readProject()
  const showingBench = project?.name === 'FNR Powertrain Bench' && localStorage.getItem(BENCH_BACKUP_KEY)
  const control = document.createElement('div')
  control.id = 'transmissionControl'
  control.className = 'transmission-control'
  control.title = 'Master F/N/R control for all F/N/R Gearbox parts. Individual bindings live in Properties.'
  control.innerHTML = `
    <span class="transmission-icon"><i data-lucide="git-branch"></i></span>
    <div class="transmission-modes" role="group" aria-label="Transmission mode">
      <button type="button" data-transmission-mode="forward" aria-label="Forward">F</button>
      <button type="button" data-transmission-mode="neutral" aria-label="Neutral">N</button>
      <button type="button" data-transmission-mode="reverse" aria-label="Reverse">R</button>
    </div>
    <button type="button" class="transmission-bench" data-powertrain-bench title="${showingBench ? 'Restore build from before powertrain bench' : 'Load F/N/R Powertrain Bench'}" aria-label="Powertrain bench"><i data-lucide="${showingBench ? 'history' : 'wrench'}"></i></button>`

  actions.insertBefore(control, shortcutButton)
  control.querySelectorAll('[data-transmission-mode]').forEach(button => { button.onclick = () => setMasterMode(button.dataset.transmissionMode) })
  control.querySelector('[data-powertrain-bench]').onclick = toggleBench
  syncButtons()
  window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
}

function decorateTelemetry() {
  const panel = document.getElementById('drivetrainTelemetry')
  if (!panel || !api()) return
  const gearboxes = api().getObjects().filter(object => api().getConfig(object.userData.instanceId)?.type === 'transmission')
  const differentials = api().getObjects().filter(object => object.userData.partId === 'open-differential')
  const summary = panel.querySelector('.telemetry-summary')
  const physicalMeshCount = Number(summary?.querySelector('span:nth-child(3) b')?.textContent || 0)
  const gearSection = [...panel.querySelectorAll('.telemetry-section')].find(section => section.querySelector('label')?.textContent?.trim() === 'GEARS')
  if (!gearSection) return

  const rows = [...gearSection.querySelectorAll('.telemetry-gear')]
  rows.forEach((row, index) => row.classList.toggle('semantic-hidden', index >= physicalMeshCount))

  let badge = gearSection.querySelector('.powertrain-badge')
  if (!gearboxes.length && !differentials.length) {
    badge?.remove()
    return
  }

  const mode = currentMasterMode()
  const modeLabel = mode === 'forward' ? 'F' : mode === 'neutral' ? 'N' : mode === 'reverse' ? 'R' : 'MIX'
  const modeClass = mode === 'neutral' ? 'neutral' : mode === 'reverse' ? 'reverse' : mode === 'mixed' ? 'mixed' : ''
  const html = `${gearboxes.length ? `<span>GEARBOX <b class="${modeClass}">${modeLabel}</b>${gearboxes.length > 1 ? ` ×${gearboxes.length}` : ''}</span>` : ''}${differentials.length ? `<span>DIFF <b>OPEN</b>${differentials.length > 1 ? ` ×${differentials.length}` : ''}</span>` : ''}`

  if (!badge) {
    badge = document.createElement('div')
    badge.className = 'powertrain-badge'
    gearSection.append(badge)
  }
  if (badge.innerHTML !== html) badge.innerHTML = html
}

installControls()
let queued = false
new MutationObserver(() => {
  if (queued) return
  queued = true
  requestAnimationFrame(() => { queued = false; syncButtons() })
}).observe(document.body, { childList: true, subtree: true })

window.addEventListener('bricklab:control-runtime-change', syncButtons)
window.addEventListener('bricklab:controls-runtime-reset', syncButtons)
window.addEventListener('bricklab:control-config-change', syncButtons)
window.addEventListener('bricklab:set-transmission', event => setMasterMode(event.detail?.mode))
