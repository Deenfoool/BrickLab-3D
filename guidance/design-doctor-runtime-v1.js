import { createDesignDoctorScanner, DESIGN_DOCTOR_ENGINE_VERSION } from './design-doctor-engine-v1.js?v=design-doctor-20260912-v1'

export const DESIGN_DOCTOR_RUNTIME_VERSION = 'design-doctor-runtime-v1.0.1'

const subsystems = globalThis.BrickLabSubsystems
if (!subsystems?.editor?.ready?.()) throw new Error('Design Doctor requires the bound editor subsystem')

function ensureStylesheet() {
  if (!globalThis.document?.head || document.querySelector('link[data-bricklab-design-doctor]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = './guidance/design-doctor-v1.css?v=design-doctor-20260912-v2'
  link.dataset.bricklabDesignDoctor = 'v1'
  document.head.append(link)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[char])
}

function makeToolbarButton() {
  const toolbar = document.querySelector('.viewport-toolbar')
  if (!toolbar) throw new Error('Design Doctor could not find the viewport toolbar')
  const existing = toolbar.querySelector('[data-design-doctor]')
  if (existing) return existing

  const divider = document.createElement('span')
  divider.className = 'divider design-doctor-divider'
  divider.dataset.designDoctorOwned = 'true'
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'tool design-doctor-tool'
  button.dataset.designDoctor = 'true'
  button.title = 'Design Doctor — scan build diagnostics'
  button.innerHTML = '<i data-lucide="scan-search"></i><span>Doctor</span>'
  const deleteButton = toolbar.querySelector('#deleteBtn')
  if (deleteButton) {
    toolbar.insertBefore(divider, deleteButton)
    toolbar.insertBefore(button, deleteButton)
  } else {
    toolbar.append(divider, button)
  }
  globalThis.lucide?.createIcons?.({ attrs:{ 'stroke-width':1.8, 'aria-hidden':'true' } })
  return button
}

function makeLayer() {
  const viewport = document.querySelector('#viewport')
  if (!viewport) throw new Error('Design Doctor requires the BrickLab viewport')
  viewport.classList.add('design-doctor-host')

  const layer = document.createElement('div')
  layer.className = 'design-doctor-layer'
  layer.hidden = true
  layer.innerHTML = `
    <div class="design-doctor-progress" aria-live="polite">
      <span class="design-doctor-progress-icon"><i data-lucide="scan-line"></i></span>
      <div><strong>Design Doctor</strong><small data-doctor-status>Ready to scan</small></div>
      <div class="design-doctor-meter"><i data-doctor-meter></i></div>
      <button type="button" data-doctor-close aria-label="Close Design Doctor"><i data-lucide="x"></i></button>
    </div>
    <div class="design-doctor-markers" data-doctor-markers></div>
    <div class="design-doctor-line" aria-hidden="true"></div>
    <section class="design-doctor-card" role="region" aria-label="Design Doctor issue"></section>
  `
  viewport.append(layer)
  globalThis.lucide?.createIcons?.({ attrs:{ 'stroke-width':1.8, 'aria-hidden':'true' } })
  return {
    viewport,
    layer,
    status:layer.querySelector('[data-doctor-status]'),
    meter:layer.querySelector('[data-doctor-meter]'),
    markers:layer.querySelector('[data-doctor-markers]'),
    line:layer.querySelector('.design-doctor-line'),
    card:layer.querySelector('.design-doctor-card'),
    close:layer.querySelector('[data-doctor-close]'),
  }
}

ensureStylesheet()
const toolbarButton = makeToolbarButton()
const ui = makeLayer()
const scanner = createDesignDoctorScanner({ subsystems })

let open = false
let scanning = false
let issues = []
let currentIndex = -1
let explainOpen = false
let raf = 0
let rescanTimer = 0
let scanToken = 0
const markerButtons = new Map()
let highlightedObject = null
let highlightBackup = null

const severityColor = Object.freeze({
  error:0xff5f6d,
  warning:0xf2b84b,
  info:0x5aa9ff,
})

const severityIntensity = Object.freeze({
  error:.34,
  warning:.24,
  info:.14,
})

function currentIssue() {
  return currentIndex >= 0 ? issues[currentIndex] ?? null : null
}

function restoreHighlight() {
  if (!highlightedObject || !highlightBackup) {
    highlightedObject = null
    highlightBackup = null
    return
  }
  for (const entry of highlightBackup) {
    entry.node.material = entry.array ? entry.originals : entry.originals[0]
    for (const material of entry.clones) {
      if (material && !entry.originals.includes(material)) material.dispose?.()
    }
  }
  highlightedObject = null
  highlightBackup = null
}

function highlightIssue(issue) {
  restoreHighlight()
  const object = issue?.object
  if (!object) return

  const entries = []
  object.traverse?.(node => {
    if (!node?.material) return
    const originals = Array.isArray(node.material) ? [...node.material] : [node.material]
    const clones = originals.map(material => material?.clone?.() ?? material)
    entries.push({ node, originals, array:Array.isArray(node.material), clones })
    node.material = Array.isArray(node.material) ? clones : clones[0]
  })
  if (!entries.length) return

  const color = severityColor[issue.severity] ?? severityColor.info
  const intensity = severityIntensity[issue.severity] ?? severityIntensity.info
  for (const entry of entries) {
    for (const material of entry.clones) {
      if (!material) continue
      if (material.emissive?.setHex) {
        material.emissive.setHex(color)
        if ('emissiveIntensity' in material) material.emissiveIntensity = intensity
      }
      material.needsUpdate = true
    }
  }
  highlightedObject = object
  highlightBackup = entries
}

function statusText(text) {
  if (ui.status) ui.status.textContent = text
}

function setProgress(fraction) {
  if (ui.meter) ui.meter.style.transform = `scaleX(${Math.max(0, Math.min(1, Number(fraction) || 0))})`
}

function summaryText(result) {
  const stats = result?.stats
  if (!stats) return 'Scan complete'
  return `${stats.errors} errors · ${stats.warnings} warnings · ${stats.info} info`
}

function issueDetailsMarkup(issue) {
  if (!explainOpen || !issue) return ''
  const detailRows = [
    ['Source', issue.source],
    ['Reason', issue.reason],
    ['Part', issue.partId],
    ['Instance', issue.instanceId],
    ['Connection', issue.connectionId],
    ['Connector', issue.connectorId],
  ].filter(([,value]) => value != null && value !== '')
  const extra = issue.details
    ? Object.entries(issue.details).map(([key,value]) => [key, typeof value === 'object' ? JSON.stringify(value) : value])
    : []
  return `<div class="design-doctor-explain">${[...detailRows, ...extra].map(([key,value]) => `
    <div><span>${escapeHtml(key)}</span><code>${escapeHtml(value)}</code></div>`).join('')}</div>`
}

function renderCard() {
  const issue = currentIssue()
  if (!open) return

  if (scanning) {
    ui.card.className = 'design-doctor-card is-scan'
    ui.card.innerHTML = `
      <small>Progressive scene scan</small>
      <h3>Checking construction…</h3>
      <p>Design Doctor scans quietly in the background. It will not move the camera or flash every part while checking.</p>
    `
    return
  }

  if (!issue) {
    ui.card.className = 'design-doctor-card is-ok'
    ui.card.innerHTML = `
      <small>Design Doctor · complete</small>
      <h3>No supported problems found</h3>
      <p>The current authoritative checks did not find an error or warning.</p>
      <div class="design-doctor-actions"><button type="button" data-doctor-rescan>Scan again</button></div>
    `
    ui.card.querySelector('[data-doctor-rescan]')?.addEventListener('click', () => void startScan())
    return
  }

  const indexText = `${currentIndex + 1} / ${issues.length}`
  ui.card.className = `design-doctor-card severity-${issue.severity}`
  ui.card.innerHTML = `
    <small>Design Doctor · ${escapeHtml(issue.severity)} · ${indexText}</small>
    <h3>${escapeHtml(issue.title)}</h3>
    <p>${escapeHtml(issue.message)}</p>
    ${issueDetailsMarkup(issue)}
    <div class="design-doctor-actions">
      <button type="button" class="primary" data-doctor-focus>Focus</button>
      <button type="button" data-doctor-explain>${explainOpen ? 'Hide details' : 'Explain'}</button>
      <button type="button" data-doctor-next>Next issue</button>
    </div>
    <div class="design-doctor-card-foot">${escapeHtml(issue.family)} · ${escapeHtml(issue.reason || issue.source)}</div>
  `
  ui.card.querySelector('[data-doctor-focus]')?.addEventListener('click', () => focusIssue(issue))
  ui.card.querySelector('[data-doctor-explain]')?.addEventListener('click', () => {
    explainOpen = !explainOpen
    renderCard()
  })
  ui.card.querySelector('[data-doctor-next]')?.addEventListener('click', nextIssue)
}

function rebuildMarkers() {
  ui.markers.innerHTML = ''
  markerButtons.clear()
  issues.forEach((issue, index) => {
    if (!issue.object) return
    const marker = document.createElement('button')
    marker.type = 'button'
    marker.className = `design-doctor-marker severity-${issue.severity}`
    marker.title = issue.title
    marker.setAttribute('aria-label', `${issue.severity}: ${issue.title}`)
    marker.innerHTML = '<span></span>'
    marker.addEventListener('click', event => {
      event.stopPropagation()
      showIssue(index)
    })
    ui.markers.append(marker)
    markerButtons.set(issue.id, marker)
  })
}

function lineToCard(point, cardX, cardY, cardWidth) {
  const endX = cardX >= point.x ? cardX : cardX + cardWidth
  const endY = cardY + 38
  const dx = endX - point.x
  const dy = endY - point.y
  const length = Math.hypot(dx, dy)
  ui.line.style.width = `${length}px`
  ui.line.style.transform = `translate3d(${point.x}px,${point.y}px,0) rotate(${Math.atan2(dy, dx)}rad)`
}

function positionUi() {
  if (!open || ui.layer.hidden) return
  const width = ui.viewport.clientWidth
  const height = ui.viewport.clientHeight
  if (!width || !height) {
    raf = requestAnimationFrame(positionUi)
    return
  }

  for (const issue of issues) {
    const marker = markerButtons.get(issue.id)
    if (!marker || !issue.object) continue
    const point = subsystems.editor.viewportPoint?.(issue.object, { offsetY:.5 })
    marker.hidden = !point?.visible
    if (point?.visible) marker.style.transform = `translate3d(${point.x}px,${point.y}px,0)`
    marker.classList.toggle('is-active', issue === currentIssue())
  }

  const issue = currentIssue()
  const point = issue?.object ? subsystems.editor.viewportPoint?.(issue.object, { offsetY:.62 }) : null
  const cardWidth = ui.card.offsetWidth || Math.min(340, width - 24)
  const cardHeight = ui.card.offsetHeight || 180
  const anchor = point?.visible ? point : { x:Math.max(28,width*.5), y:Math.max(104,height*.45) }
  const toRight = anchor.x < width * .58
  const proposedX = toRight ? anchor.x + 58 : anchor.x - cardWidth - 58
  const cardX = Math.max(10, Math.min(width-cardWidth-10, proposedX))
  const cardY = Math.max(96, Math.min(height-cardHeight-12, anchor.y-64))
  ui.card.style.transform = `translate3d(${cardX}px,${cardY}px,0)`

  if (issue && point?.visible) {
    ui.line.hidden = false
    lineToCard(point, cardX, cardY, cardWidth)
  } else {
    ui.line.hidden = true
  }
  raf = requestAnimationFrame(positionUi)
}

function focusIssue(issue) {
  if (!issue?.object) return false
  if (typeof subsystems.editor.focusObjects === 'function') {
    try {
      const result = subsystems.editor.focusObjects([issue.object])
      if (result !== false) return true
    } catch {}
  }

  const selected = subsystems.editor.selection?.() ?? []
  if (selected.includes(issue.object)) {
    globalThis.dispatchEvent?.(new KeyboardEvent('keydown', { key:'f', code:'KeyF', bubbles:true }))
    return true
  }

  const point = subsystems.editor.viewportPoint?.(issue.object, { offsetY:0 })
  const canvas = ui.viewport.querySelector('canvas')
  const rect = canvas?.getBoundingClientRect?.()
  if (point?.visible && rect?.width && rect?.height && typeof PointerEvent === 'function') {
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles:true, button:0, buttons:1,
      clientX:rect.left + point.x,
      clientY:rect.top + point.y,
    }))
    queueMicrotask(() => globalThis.dispatchEvent?.(new KeyboardEvent('keydown', { key:'f', code:'KeyF', bubbles:true })))
    return true
  }
  return false
}

function showIssue(index, { focus=false } = {}) {
  if (!issues.length) {
    currentIndex = -1
    restoreHighlight()
    renderCard()
    return
  }
  currentIndex = ((Number(index) || 0) % issues.length + issues.length) % issues.length
  explainOpen = false
  highlightIssue(currentIssue())
  renderCard()
  if (focus) focusIssue(currentIssue())
}

function nextIssue() {
  if (!issues.length) return
  showIssue(currentIndex + 1)
}

function clearScanVisuals() {
  markerButtons.clear()
  ui.markers.innerHTML = ''
  restoreHighlight()
  issues = []
  currentIndex = -1
  explainOpen = false
  ui.line.hidden = true
}

async function startScan() {
  if (subsystems.editor.mode?.() !== 'build') {
    statusText('Switch to BUILD mode to scan')
    return null
  }
  open = true
  scanning = true
  scanToken += 1
  const token = scanToken
  scanner.abort('restart')
  clearScanVisuals()
  toolbarButton.classList.add('active')
  ui.layer.hidden = false
  ui.layer.classList.add('is-visible')
  statusText('Starting quiet scan…')
  setProgress(0)
  renderCard()
  if (!raf) raf = requestAnimationFrame(positionUi)

  try {
    const result = await scanner.scan({
      onProgress:progress => {
        if (token !== scanToken) return
        setProgress(progress.fraction)
        if (progress.phase !== 'complete') statusText(`Scanning · ${progress.completed}/${progress.total} · ${progress.phase}`)
      },
    })
    if (token !== scanToken || result?.aborted) return result
    issues = result.issues
    scanning = false
    statusText(summaryText(result))
    setProgress(1)
    rebuildMarkers()
    if (issues.length) showIssue(0)
    else renderCard()
    globalThis.dispatchEvent?.(new CustomEvent('bricklab:designdoctorcomplete', {
      detail:{ version:DESIGN_DOCTOR_RUNTIME_VERSION, engineVersion:DESIGN_DOCTOR_ENGINE_VERSION, stats:result.stats },
    }))
    return result
  } catch (error) {
    if (token !== scanToken) return null
    scanning = false
    statusText(`Scan failed: ${error?.message || error}`)
    console.error('[BrickLab Design Doctor] Scan failed', error)
    return null
  }
}

function closeDoctor() {
  open = false
  scanning = false
  scanToken += 1
  scanner.abort('closed')
  clearTimeout(rescanTimer)
  rescanTimer = 0
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  clearScanVisuals()
  ui.layer.classList.remove('is-visible')
  ui.layer.hidden = true
  toolbarButton.classList.remove('active')
}

function scheduleRescan() {
  if (!open) return
  clearTimeout(rescanTimer)
  rescanTimer = setTimeout(() => void startScan(), 850)
}

function toggleDoctor() {
  if (open) closeDoctor()
  else void startScan()
}

toolbarButton.addEventListener('click', toggleDoctor)
ui.close.addEventListener('click', closeDoctor)

// Quiet mode: only authoritative model/graph mutations trigger an automatic refresh.
// Pointer-up is intentionally not observed; orbiting, selecting and ordinary clicks
// must never restart diagnostics or steal attention from the editor.
for (const name of [
  'bricklab:editorexternalmutation',
  'bricklab:smartassemblyinstalled',
  'bricklab:connectorv4graphchange',
  'bricklab:mechanicalintelligencechange',
]) globalThis.addEventListener?.(name, scheduleRescan)

const api = Object.freeze({
  version:DESIGN_DOCTOR_RUNTIME_VERSION,
  engineVersion:DESIGN_DOCTOR_ENGINE_VERSION,
  scan:startScan,
  close:closeDoctor,
  next:nextIssue,
  focus:() => focusIssue(currentIssue()),
  issues:() => [...issues],
  current:() => currentIssue(),
  status:() => Object.freeze({ open, scanning, issueCount:issues.length, currentIndex, quiet:true }),
  destroy() {
    closeDoctor()
    toolbarButton.remove()
    document.querySelector('[data-design-doctor-owned]')?.remove()
    ui.layer.remove()
  },
})

globalThis.BrickLabDesignDoctor = api
globalThis.dispatchEvent?.(new CustomEvent('bricklab:designdoctorready', {
  detail:{ version:DESIGN_DOCTOR_RUNTIME_VERSION, engineVersion:DESIGN_DOCTOR_ENGINE_VERSION, quiet:true },
}))
