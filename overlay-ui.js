const PARTS_STATE_KEY = 'bricklab.ui.parts-overlay.v1'
const PROPERTIES_STATE_KEY = 'bricklab.ui.properties-overlay.v1'
const MOBILE_QUERY = '(max-width: 800px)'

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

  const state = {
    parts: readState(PARTS_STATE_KEY, !isMobile()),
    properties: readState(PROPERTIES_STATE_KEY, !isMobile()),
  }

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
    close.onclick = () => setOpen(target, false)
    title.append(close)
  }

  addCloseButton(partsPanel, 'parts')
  addCloseButton(propertiesPanel, 'properties')

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
    syncScrim()
  }

  function setOpen(target, open, { persist = true } = {}) {
    if (!(target in state)) return
    state[target] = Boolean(open)

    // On narrow screens these are drawers: keeping both open just obscures the scene.
    if (isMobile() && state[target]) {
      const other = target === 'parts' ? 'properties' : 'parts'
      state[other] = false
      if (persist) writeState(other === 'parts' ? PARTS_STATE_KEY : PROPERTIES_STATE_KEY, false)
    }

    if (persist) writeState(target === 'parts' ? PARTS_STATE_KEY : PROPERTIES_STATE_KEY, state[target])
    syncControls()
  }

  controls.querySelectorAll('[data-overlay-toggle]').forEach(button => {
    button.onclick = () => {
      const target = button.dataset.overlayToggle
      setOpen(target, !state[target])
    }
  })

  scrim.onclick = () => {
    setOpen('parts', false)
    setOpen('properties', false)
  }

  window.matchMedia(MOBILE_QUERY).addEventListener?.('change', event => {
    if (event.matches && state.parts && state.properties) {
      state.properties = false
    }
    syncControls()
  })

  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isMobile()) return
    if (!state.parts && !state.properties) return
    setOpen('parts', false)
    setOpen('properties', false)
  })

  syncControls()
  window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
}

installOverlayUi()
