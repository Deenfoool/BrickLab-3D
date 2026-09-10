export const PROJECT_BRIDGE_VERSION_V4 = 'connector-project-bridge-v4.1.0'

function runtime() { return globalThis.BrickLabConnectorV4 ?? null }

function showToast(text) {
  const el = document.querySelector('#toast')
  if (!el) return
  el.textContent = text
  el.classList.add('show')
  clearTimeout(showToast.timer)
  showToast.timer = setTimeout(() => el.classList.remove('show'), 2400)
}

function currentProjectSnapshot() {
  try {
    const raw = localStorage.getItem('bricklab.project.v2') || localStorage.getItem('bricklab.project.v1')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function filenameFor(project) {
  const name = String(project?.name || 'bricklab').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${name || 'bricklab'}.bricklab`
}

function downloadProject(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type:'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filenameFor(project)
  a.style.display = 'none'
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function installExportBridge() {
  const button = document.querySelector('#exportBtn')
  if (!button || button.dataset.connectorV4ExportBridge === '1') return
  button.dataset.connectorV4ExportBridge = '1'
  button.addEventListener('click', event => {
    const v4 = runtime()
    if (!v4?.enrichProject) return
    const base = currentProjectSnapshot()
    if (!base) return
    event.preventDefault()
    event.stopImmediatePropagation()
    try {
      const enriched = v4.enrichProject(base)
      downloadProject(enriched)
      showToast(`Project exported · V4 links ${enriched.connectionsV4?.length ?? 0}`)
      window.dispatchEvent(new CustomEvent('bricklab:connectorv4projectexport', {
        detail:{ version:PROJECT_BRIDGE_VERSION_V4, connections:enriched.connectionsV4?.length ?? 0 },
      }))
    } catch (error) {
      console.warn('[BrickLab Connector V4] Enhanced project export failed; retrying legacy export is intentionally blocked to avoid losing V4 links.', error)
      showToast('V4 project export failed — no incomplete file was written')
    }
  }, true)
}

function installImportBridge() {
  const input = document.querySelector('#importFile')
  if (!input || input.dataset.connectorV4ImportBridge === '1') return
  input.dataset.connectorV4ImportBridge = '1'
  input.addEventListener('change', event => {
    const file = event.target?.files?.[0]
    if (!file) return
    const parsed = file.text().then(text => JSON.parse(text))
    // app.js owns authoritative part/project validation. Restore V4 records only
    // after its async change handler has had a turn to apply the base project.
    setTimeout(async () => {
      try {
        const data = await parsed
        const v4 = runtime()
        if (!v4?.restoreConnections) return
        const result = v4.restoreConnections(Array.isArray(data?.connectionsV4) ? data.connectionsV4 : [], { replace:true })
        window.dispatchEvent(new CustomEvent('bricklab:connectorv4projectimport', {
          detail:{ version:PROJECT_BRIDGE_VERSION_V4, ...result },
        }))
        if (result.rejected) console.warn('[BrickLab Connector V4] Some imported V4 links were rejected.', result)
      } catch (error) {
        console.warn('[BrickLab Connector V4] V4 extension data was not imported.', error)
      }
    }, 0)
  }, true)
}

function installNewProjectBridge() {
  const button = document.querySelector('#newBtn')
  if (!button || button.dataset.connectorV4NewBridge === '1') return
  button.dataset.connectorV4NewBridge = '1'
  button.addEventListener('click', () => runtime()?.clearGraph?.(), true)
}

window.addEventListener('bricklab:connectorv4commit', event => {
  const family = event.detail?.family === 'technic-axle-keyed-hole' ? 'Axle ↔ axle hole' : 'V4 connector'
  showToast(`${family} · Connector V4`)
})

window.addEventListener('bricklab:connectorv4physicsblocked', event => {
  const count = Number(event.detail?.count) || 0
  showToast(`Simulation blocked: ${count} V4 connection${count === 1 ? '' : 's'} await physics certification`)
})

installExportBridge()
installImportBridge()
installNewProjectBridge()
