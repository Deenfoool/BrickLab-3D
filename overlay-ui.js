const PARTS_STATE_KEY = 'bricklab.ui.parts-overlay.v1'
const PROPERTIES_STATE_KEY = 'bricklab.ui.properties-overlay.v1'
const LAYOUT_KEY = 'bricklab.ui.overlay-layout.v2'
const MOBILE_QUERY = '(max-width: 800px)'
const MIN_PANEL_WIDTH = 230
const MAX_PANEL_WIDTH = 430
const EDGE_GAP = 8

const isMobile = () => window.matchMedia(MOBILE_QUERY).matches

function readState(key, fallback) {
  const value = localStorage.getItem(key)
  if (value === 'open') return true
  if (value === 'closed') return false
  return fallback
}

function writeState(key, open) {
  localStorage.setItem(key, open ? 'open' : 'closed')
}

function readLayout() {
  try {
    const value = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function writeLayout(layout) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
}

function installOverlayUi() {
  const shell = document.querySelector('.shell')
  const partsPanel = document.querySelector('.parts-panel')
  const propertiesPanel = document.querySelector('.inspector-panel')
  const topActions = document.querySelector('.top-actions')
  const shortcutsButton = document.getElementById('shortcutsBtn')

  if (!shell || !partsPanel || !propertiesPanel || !topActions) {
    requestAnimationFrame(installOverlayUi)
    return
  }
  if (document.getElementById('overlayPanelToggles')) return

  const panels = { parts: partsPanel, properties: propertiesPanel }
  const state = {
    parts: readState(PARTS_STATE_KEY, !isMobile()),
    properties: readState(PROPERTIES_STATE_KEY, !isMobile()),
  }
  let layout = readLayout()
  let activePanel = null

  const scrim = document.createElement('button')
  scrim.type = 'button'
  scrim.className = 'overlay-drawer-scrim'
  scrim.setAttribute('aria-label', 'Close floating panels')
  shell.append(scrim)

  const controls = document.createElement('div')
  controls.id = 'overlayPanelToggles'
  controls.className = 'overlay-panel-toggles'
  controls.innerHTML = `
    <button type="button" class="overlay-toggle" data-overlay-toggle="parts" title="Show or hide Parts" aria-label="Toggle Parts panel" aria-expanded="false">
      <i data-lucide="boxes"></i><span class="panel-dot"></span>
    </button>
    <button type="button" class="overlay-toggle" data-overlay-toggle="properties" title="Show or hide Properties" aria-label="Toggle Properties panel" aria-expanded="false">
      <i data-lucide="sliders-horizontal"></i><span class="panel-dot"></span>
    </button>
    <button type="button" class="overlay-toggle overlay-reset" data-overlay-reset title="Reset floating panel layout" aria-label="Reset floating panel layout">
      <i data-lucide="rotate-ccw"></i>
    </button>
  `
  topActions.insertBefore(controls, shortcutsButton || topActions.firstChild)

  function addCloseButton(panel, target) {
    const title = panel.querySelector('.panel-title')
    if (!title || title.querySelector('.panel-float-close')) return
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'panel-float-close'
    close.title = `Hide ${target === 'parts' ? 'Parts' : 'Properties'}`
    close.setAttribute('aria-label', close.title)
    close.innerHTML = '<i data-lucide="x"></i>'
    close.onclick = event => {
      event.stopPropagation()
      setOpen(target, false)
    }
    title.append(close)
  }

  function addResizeHandle(panel, target) {
    if (panel.querySelector('.panel-resize-handle')) return
    const handle = document.createElement('div')
    handle.className = 'panel-resize-handle'
    handle.dataset.resizePanel = target
    handle.setAttribute('aria-hidden', 'true')
    panel.append(handle)
  }

  addCloseButton(partsPanel, 'parts')
  addCloseButton(propertiesPanel, 'properties')
  addResizeHandle(partsPanel, 'parts')
  addResizeHandle(propertiesPanel, 'properties')

  function stateKey(target) {
    return target === 'parts' ? PARTS_STATE_KEY : PROPERTIES_STATE_KEY
  }

  function hasCustomLayout() {
    return Boolean(layout.parts || layout.properties)
  }

  function syncCustomLayoutClass() {
    document.body.classList.toggle('overlay-layout-custom', !isMobile() && hasCustomLayout())
  }

  function clampPlacement(panel, placement) {
    const shellRect = shell.getBoundingClientRect()
    const topbarHeight = document.querySelector('.topbar')?.getBoundingClientRect().height || 64
    const width = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, Number(placement.width) || panel.getBoundingClientRect().width || 286))
    const height = panel.getBoundingClientRect().height || Math.min(720, shellRect.height - topbarHeight - 22)
    const maxX = Math.max(EDGE_GAP, shellRect.width - width - EDGE_GAP)
    const minY = topbarHeight + EDGE_GAP
    const maxY = Math.max(minY, shellRect.height - height - EDGE_GAP)
    return {
      x: Math.max(EDGE_GAP, Math.min(maxX, Number(placement.x) || EDGE_GAP)),
      y: Math.max(minY, Math.min(maxY, Number(placement.y) || minY)),
      width,
    }
  }

  function clearPanelPlacement(panel) {
    panel.style.removeProperty('left')
    panel.style.removeProperty('right')
    panel.style.removeProperty('top')
    panel.style.removeProperty('width')
    panel.classList.remove('overlay-positioned')
  }

  function applySavedPlacement(target) {
    const panel = panels[target]
    if (!panel) return
    if (isMobile() || !layout[target]) {
      clearPanelPlacement(panel)
      return
    }
    const placement = clampPlacement(panel, layout[target])
    layout[target] = placement
    panel.style.left = `${placement.x}px`
    panel.style.right = 'auto'
    panel.style.top = `${placement.y}px`
    panel.style.width = `${placement.width}px`
    panel.classList.add('overlay-positioned')
  }

  function saveCurrentPlacement(target) {
    if (isMobile()) return
    const panel = panels[target]
    const shellRect = shell.getBoundingClientRect()
    const rect = panel.getBoundingClientRect()
    layout[target] = clampPlacement(panel, {
      x: rect.left - shellRect.left,
      y: rect.top - shellRect.top,
      width: rect.width,
    })
    writeLayout(layout)
    syncCustomLayoutClass()
  }

  function bringToFront(target) {
    activePanel = target
    Object.entries(panels).forEach(([key, panel]) => {
      panel.style.zIndex = key === target ? '24' : '20'
    })
  }

  function syncScrim() {
    const visible = isMobile() && (state.parts || state.properties)
    scrim.classList.toggle('active', visible)
    scrim.tabIndex = visible ? 0 : -1
  }

  function syncControls() {
    document.body.classList.toggle('parts-overlay-open', state.parts)
    document.body.classList.toggle('properties-overlay-open', state.properties)
    controls.querySelectorAll('[data-overlay-toggle]').forEach(button => {
      const key = button.dataset.overlayToggle
      const open = Boolean(state[key])
      button.classList.toggle('active', open)
      button.setAttribute('aria-expanded', String(open))
    })
    syncCustomLayoutClass()
    syncScrim()
  }

  function setOpen(target, open, { persist = true } = {}) {
    if (!(target in state)) return
    state[target] = Boolean(open)
    if (isMobile() && state[target]) {
      const other = target === 'parts' ? 'properties' : 'parts'
      state[other] = false
      if (persist) writeState(stateKey(other), false)
    }
    if (persist) writeState(stateKey(target), state[target])
    if (state[target]) bringToFront(target)
    syncControls()
  }

  function resetLayout() {
    layout = {}
    localStorage.removeItem(LAYOUT_KEY)
    Object.values(panels).forEach(clearPanelPlacement)
    activePanel = null
    Object.values(panels).forEach(panel => panel.style.removeProperty('z-index'))
    syncCustomLayoutClass()
  }

  function startDrag(target, event) {
    if (isMobile() || event.button !== 0) return
    if (event.target.closest('button,input,select,textarea,a,[contenteditable="true"]')) return
    const panel = panels[target]
    const shellRect = shell.getBoundingClientRect()
    const rect = panel.getBoundingClientRect()
    const start = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: rect.left - shellRect.left,
      y: rect.top - shellRect.top,
      width: rect.width,
    }
    bringToFront(target)
    panel.classList.add('panel-dragging','overlay-positioned')
    panel.style.left = `${start.x}px`
    panel.style.right = 'auto'
    panel.style.top = `${start.y}px`
    panel.style.width = `${start.width}px`
    event.currentTarget.setPointerCapture?.(event.pointerId)

    const move = moveEvent => {
      const placement = clampPlacement(panel, {
        x: start.x + moveEvent.clientX - start.pointerX,
        y: start.y + moveEvent.clientY - start.pointerY,
        width: start.width,
      })
      panel.style.left = `${placement.x}px`
      panel.style.top = `${placement.y}px`
    }
    const end = () => {
      panel.classList.remove('panel-dragging')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      saveCurrentPlacement(target)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
    window.addEventListener('pointercancel', end, { once: true })
  }

  function startResize(target, event) {
    if (isMobile() || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const panel = panels[target]
    const shellRect = shell.getBoundingClientRect()
    const rect = panel.getBoundingClientRect()
    const start = {
      pointerX: event.clientX,
      x: rect.left - shellRect.left,
      y: rect.top - shellRect.top,
      width: rect.width,
      right: rect.right - shellRect.left,
    }
    bringToFront(target)
    panel.classList.add('panel-resizing','overlay-positioned')
    panel.style.left = `${start.x}px`
    panel.style.right = 'auto'
    panel.style.top = `${start.y}px`

    const move = moveEvent => {
      const delta = moveEvent.clientX - start.pointerX
      let width = target === 'parts' ? start.width + delta : start.width - delta
      width = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width))
      let x = target === 'parts' ? start.x : start.right - width
      const placement = clampPlacement(panel, { x, y: start.y, width })
      if (target === 'properties') {
        placement.x = Math.max(EDGE_GAP, Math.min(start.right - placement.width, shellRect.width - placement.width - EDGE_GAP))
      }
      panel.style.left = `${placement.x}px`
      panel.style.width = `${placement.width}px`
    }
    const end = () => {
      panel.classList.remove('panel-resizing')
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      saveCurrentPlacement(target)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end, { once: true })
    window.addEventListener('pointercancel', end, { once: true })
  }

  Object.entries(panels).forEach(([target, panel]) => {
    const title = panel.querySelector('.panel-title')
    title?.addEventListener('pointerdown', event => startDrag(target, event))
    panel.querySelector('.panel-resize-handle')?.addEventListener('pointerdown', event => startResize(target, event))
    panel.addEventListener('pointerdown', () => {
      if (!isMobile()) bringToFront(target)
    })
  })

  controls.querySelectorAll('[data-overlay-toggle]').forEach(button => {
    button.onclick = () => {
      const target = button.dataset.overlayToggle
      setOpen(target, !state[target])
    }
  })
  controls.querySelector('[data-overlay-reset]').onclick = resetLayout

  scrim.onclick = () => {
    setOpen('parts', false)
    setOpen('properties', false)
  }

  const media = window.matchMedia(MOBILE_QUERY)
  media.addEventListener?.('change', event => {
    if (event.matches && state.parts && state.properties) state.properties = false
    if (event.matches) {
      Object.values(panels).forEach(clearPanelPlacement)
    } else {
      applySavedPlacement('parts')
      applySavedPlacement('properties')
    }
    syncControls()
  })

  window.addEventListener('resize', () => {
    if (isMobile()) return
    requestAnimationFrame(() => {
      Object.keys(panels).forEach(target => {
        if (!layout[target]) return
        applySavedPlacement(target)
      })
    })
  })

  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isMobile()) return
    if (!state.parts && !state.properties) return
    setOpen('parts', false)
    setOpen('properties', false)
  })

  applySavedPlacement('parts')
  applySavedPlacement('properties')
  syncControls()
  window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
}

installOverlayUi()
