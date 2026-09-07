const PROJECT_KEY = 'bricklab.project.v2'
let bindingCapture = null
const heldDirections = new Map()
let deckInstalled = false

const TEXT = {
  en: {
    control: 'CONTROL', motor: 'MOTOR', gearbox: 'GEARBOX', baseSpeed: 'Base speed', maxSpeed: 'Runtime max', step: 'Speed step', autoStart: 'Auto-start in simulation', initialDirection: 'Initial direction', initialMode: 'Initial mode', keys: 'Key bindings', forward: 'Forward', reverse: 'Reverse', stop: 'Stop', toggle: 'Toggle motor', speedUp: 'Speed +', speedDown: 'Speed −', neutral: 'Neutral', next: 'Next mode', previous: 'Previous mode', unbound: 'Unbound', pressKey: 'Press key…', note: 'Click a key field, then press a physical keyboard key. Backspace/Delete clears it; Esc cancels.', deck: 'MECHANISM CONTROLS', deckHint: 'Build speed is the starting value. Runtime changes are temporary for this run.', rpm: 'RPM', noControls: 'No controllable mechanisms in this build.', importFailed: 'Could not import BrickLab project',
  },
  ru: {
    control: 'УПРАВЛЕНИЕ', motor: 'МОТОР', gearbox: 'КОРОБКА', baseSpeed: 'Базовая скорость', maxSpeed: 'Макс. в симуляции', step: 'Шаг скорости', autoStart: 'Автозапуск в симуляции', initialDirection: 'Начальное направление', initialMode: 'Начальный режим', keys: 'Привязка клавиш', forward: 'Вперёд', reverse: 'Назад', stop: 'Стоп', toggle: 'Вкл / выкл мотор', speedUp: 'Скорость +', speedDown: 'Скорость −', neutral: 'Нейтраль', next: 'Следующий режим', previous: 'Предыдущий режим', unbound: 'Не задано', pressKey: 'Нажми клавишу…', note: 'Нажми на поле клавиши, затем физическую клавишу. Backspace/Delete очищает, Esc отменяет.', deck: 'УПРАВЛЕНИЕ МЕХАНИЗМАМИ', deckHint: 'Скорость из BUILD — стартовая. Изменения здесь действуют только в текущем запуске.', rpm: 'об/мин', noControls: 'В сборке нет управляемых механизмов.', importFailed: 'Не удалось импортировать проект BrickLab',
  },
}

function lang() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru' ? 'ru' : 'en'
}
function t(key) { return TEXT[lang()][key] ?? TEXT.en[key] ?? key }
function api() { return window.BrickLabControls }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch])) }

function prettyKey(code) {
  if (!code) return t('unbound')
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit\d$/.test(code)) return code.slice(5)
  const map = { Space:'Space', ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→', ShiftLeft:'L Shift', ShiftRight:'R Shift', ControlLeft:'L Ctrl', ControlRight:'R Ctrl', AltLeft:'L Alt', AltRight:'R Alt', Enter:'Enter', Escape:'Esc', Backspace:'Backspace', Delete:'Delete', Equal:'=', Minus:'−', BracketLeft:'[', BracketRight:']' }
  return map[code] ?? code.replace(/Left$|Right$/g, '')
}

function selectedObject() {
  const controls = api()
  const idText = document.getElementById('selectedId')?.textContent?.trim() || ''
  const prefix = idText.split('·')[0].trim()
  if (!controls || !prefix) return null
  return controls.getObjects().find(object => object.userData.instanceId.startsWith(prefix)) ?? null
}

function bindingRows(config) {
  const labels = config.type === 'motor'
    ? [['forward', t('forward')], ['reverse', t('reverse')], ['stop', t('stop')], ['toggle', t('toggle')], ['speedUp', t('speedUp')], ['speedDown', t('speedDown')]]
    : [['forward', t('forward')], ['neutral', t('neutral')], ['reverse', t('reverse')], ['next', t('next')], ['previous', t('previous')]]
  return labels.map(([action, label]) => `<div class="control-binding-row"><span>${label}</span><button type="button" class="control-key-btn" data-bind-action="${action}">${escapeHtml(prettyKey(config.bindings?.[action]))}</button></div>`).join('')
}

function renderControlProperties() {
  const section = document.getElementById('mechanismControlSection')
  const body = document.getElementById('mechanismControlBody')
  if (!section || !body || !api()) return
  const object = selectedObject()
  const config = object ? api().getConfig(object.userData.instanceId) : null
  if (!object || !config) {
    section.classList.add('hidden')
    body.innerHTML = ''
    return
  }
  section.classList.remove('hidden')
  section.dataset.controlId = object.userData.instanceId
  section.querySelector('h3 span:first-child').textContent = t('control')
  section.querySelector('.control-config-badge').textContent = config.type === 'motor' ? t('motor') : t('gearbox')

  if (config.type === 'motor') {
    body.innerHTML = `
      <div class="control-field"><label>${t('baseSpeed')}</label><div class="control-speed-line"><input type="range" min="0" max="${config.motor.maxRpm}" step="1" value="${config.motor.baseRpm}" data-control-base-range><input type="number" min="0" max="${config.motor.maxRpm}" step="1" value="${config.motor.baseRpm}" data-control-base-number></div></div>
      <div class="control-inline-grid"><div class="control-field"><label>${t('maxSpeed')}</label><input class="control-mini-number" type="number" min="10" max="2000" step="10" value="${config.motor.maxRpm}" data-control-max></div><div class="control-field"><label>${t('step')}</label><input class="control-mini-number" type="number" min="1" max="250" step="1" value="${config.motor.stepRpm}" data-control-step></div></div>
      <label class="control-toggle-row"><span>${t('autoStart')}</span><input type="checkbox" data-control-autostart ${config.motor.autoStart ? 'checked' : ''}></label>
      <div class="control-field"><label>${t('initialDirection')}</label><div class="control-segment"><button type="button" data-initial-dir="1" class="${config.motor.initialDirection === 1 ? 'active' : ''}">F</button><button type="button" disabled>•</button><button type="button" data-initial-dir="-1" class="${config.motor.initialDirection === -1 ? 'active' : ''}">R</button></div></div>
      <div class="control-subtitle">${t('keys')}</div><div class="control-bindings">${bindingRows(config)}</div><div class="control-note">${t('note')}</div>`
  } else {
    body.innerHTML = `
      <div class="control-field"><label>${t('initialMode')}</label><div class="control-segment"><button type="button" data-initial-mode="forward" class="${config.transmission.initialMode === 'forward' ? 'active' : ''}">F</button><button type="button" data-initial-mode="neutral" class="${config.transmission.initialMode === 'neutral' ? 'active' : ''}">N</button><button type="button" data-initial-mode="reverse" class="${config.transmission.initialMode === 'reverse' ? 'active' : ''}">R</button></div></div>
      <div class="control-subtitle">${t('keys')}</div><div class="control-bindings">${bindingRows(config)}</div><div class="control-note">${t('note')}</div>`
  }
}

function updateSelectedConfig(patch) {
  const section = document.getElementById('mechanismControlSection')
  const id = section?.dataset.controlId
  if (!id || !api()) return
  api().updateConfig(id, patch)
  renderControlProperties()
}

function installProperties() {
  const inspector = document.getElementById('inspector')
  const mechanics = document.getElementById('mechanicsSection')
  if (!inspector || !mechanics) return requestAnimationFrame(installProperties)
  if (document.getElementById('mechanismControlSection')) return

  const section = document.createElement('section')
  section.id = 'mechanismControlSection'
  section.className = 'control-config-section hidden'
  section.innerHTML = `<h3><span>${t('control')}</span><span class="control-config-badge">CONTROL</span></h3><div id="mechanismControlBody"></div>`
  mechanics.insertAdjacentElement('afterend', section)

  section.addEventListener('input', event => {
    const id = section.dataset.controlId
    const config = api()?.getConfig(id)
    if (!id || !config || config.type !== 'motor') return
    if (event.target.matches('[data-control-base-range]')) {
      section.querySelector('[data-control-base-number]').value = event.target.value
    } else if (event.target.matches('[data-control-base-number]')) {
      section.querySelector('[data-control-base-range]').value = event.target.value
    }
  })

  section.addEventListener('change', event => {
    const target = event.target
    if (target.matches('[data-control-base-range],[data-control-base-number]')) updateSelectedConfig({ motor: { baseRpm: Number(target.value) } })
    else if (target.matches('[data-control-max]')) updateSelectedConfig({ motor: { maxRpm: Number(target.value) } })
    else if (target.matches('[data-control-step]')) updateSelectedConfig({ motor: { stepRpm: Number(target.value) } })
    else if (target.matches('[data-control-autostart]')) updateSelectedConfig({ motor: { autoStart: target.checked } })
  })

  section.addEventListener('click', event => {
    const button = event.target.closest('button')
    if (!button) return
    if (button.dataset.initialDir) updateSelectedConfig({ motor: { initialDirection: Number(button.dataset.initialDir) } })
    else if (button.dataset.initialMode) updateSelectedConfig({ transmission: { initialMode: button.dataset.initialMode } })
    else if (button.dataset.bindAction) {
      bindingCapture = { id: section.dataset.controlId, action: button.dataset.bindAction, button }
      button.classList.add('capture')
      button.textContent = t('pressKey')
    }
  })

  const selectedId = document.getElementById('selectedId')
  if (selectedId) new MutationObserver(renderControlProperties).observe(selectedId, { childList: true, characterData: true, subtree: true })
  new MutationObserver(renderControlProperties).observe(inspector, { attributes: true, attributeFilter: ['class'] })
  renderControlProperties()
}

function activeRuntimeMode() {
  const active = document.querySelector('.mode.active')?.dataset.mode
  return active === 'simulate' || active === 'test'
}

function runtimeKeys(config) {
  return Object.entries(config.bindings ?? {}).filter(([, code]) => code).map(([action, code]) => `<kbd>${escapeHtml(prettyKey(code))}:${escapeHtml(t(action))}</kbd>`).join('')
}

function renderDeck() {
  const deck = document.getElementById('mechanismControlDeck')
  const list = document.getElementById('mechanismControlRuntimeList')
  if (!deck || !list || !api()) return
  const active = activeRuntimeMode()
  const entries = api().getRuntimeEntries()
  deck.classList.toggle('hidden', !active || !entries.length)
  if (!active || !entries.length) { list.innerHTML = ''; return }

  document.querySelector('#mechanismControlDeck .control-deck-head strong').textContent = t('deck')
  document.querySelector('#mechanismControlDeck .control-deck-head small').textContent = t('deckHint')

  list.innerHTML = entries.map(([id, state]) => {
    const object = api().getObject(id)
    const config = api().getConfig(id)
    const name = object?.userData?.partId === 'motor' ? (lang() === 'ru' ? 'Лабораторный мотор' : 'Lab Motor') : object?.userData?.partId === 'gearbox-fnr' ? (lang() === 'ru' ? 'Коробка F/N/R' : 'F/N/R Gearbox') : object?.userData?.partId ?? 'Mechanism'
    if (state.type === 'motor') return `<div class="control-runtime-row" data-control-id="${id}"><div class="control-runtime-name"><strong>${escapeHtml(name)}</strong><small>${id.slice(0,8)}</small><div class="control-runtime-keys">${runtimeKeys(config)}</div></div><div class="control-runtime-motor"><input type="range" min="0" max="${config.motor.maxRpm}" step="1" value="${state.rpm}" data-runtime-rpm><output data-runtime-rpm-label>${Math.round(state.rpm)} ${t('rpm')}</output></div><div class="control-runtime-actions"><button type="button" data-runtime-dir="-1">R</button><button type="button" class="stop" data-runtime-dir="0">■</button><button type="button" data-runtime-dir="1">F</button></div></div>`
    return `<div class="control-runtime-row" data-control-id="${id}"><div class="control-runtime-name"><strong>${escapeHtml(name)}</strong><small>${id.slice(0,8)}</small><div class="control-runtime-keys">${runtimeKeys(config)}</div></div><div></div><div class="control-runtime-mode"><button type="button" data-runtime-mode="forward">F</button><button type="button" data-runtime-mode="neutral">N</button><button type="button" data-runtime-mode="reverse">R</button></div></div>`
  }).join('')
  for (const [id] of entries) updateRuntimeRow(id)
}

function updateRuntimeRow(id) {
  const row = document.querySelector(`[data-control-id="${CSS.escape(id)}"]`)
  const state = api()?.getRuntime(id)
  if (!row || !state) return
  if (state.type === 'motor') {
    const range = row.querySelector('[data-runtime-rpm]')
    const output = row.querySelector('[data-runtime-rpm-label]')
    if (range && document.activeElement !== range) range.value = state.rpm
    if (output) output.textContent = `${Math.round(state.rpm)} ${t('rpm')}`
    row.querySelectorAll('[data-runtime-dir]').forEach(button => button.classList.toggle('active', Number(button.dataset.runtimeDir) === state.direction))
  } else {
    row.querySelectorAll('[data-runtime-mode]').forEach(button => button.classList.toggle('active', button.dataset.runtimeMode === state.mode))
  }
}

function installDeck() {
  if (deckInstalled) return
  const viewport = document.querySelector('.viewport-wrap')
  if (!viewport) return requestAnimationFrame(installDeck)
  deckInstalled = true
  const deck = document.createElement('div')
  deck.id = 'mechanismControlDeck'
  deck.className = 'mechanism-control-deck hidden'
  deck.innerHTML = `<div class="control-deck-head"><strong>${t('deck')}</strong><small>${t('deckHint')}</small></div><div id="mechanismControlRuntimeList" class="control-runtime-list"></div>`
  viewport.append(deck)

  deck.addEventListener('input', event => {
    const row = event.target.closest('[data-control-id]')
    if (!row || !event.target.matches('[data-runtime-rpm]')) return
    api()?.setMotorRpm(row.dataset.controlId, Number(event.target.value))
  })
  deck.addEventListener('click', event => {
    const row = event.target.closest('[data-control-id]')
    const button = event.target.closest('button')
    if (!row || !button) return
    if (button.dataset.runtimeDir != null) api()?.setMotorDirection(row.dataset.controlId, Number(button.dataset.runtimeDir))
    else if (button.dataset.runtimeMode) api()?.setTransmissionMode(row.dataset.controlId, button.dataset.runtimeMode)
  })

  const modes = document.querySelector('.modes')
  if (modes) new MutationObserver(renderDeck).observe(modes, { attributes: true, subtree: true, attributeFilter: ['class'] })
  renderDeck()
}

function isTyping(target) {
  return Boolean(target && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable))
}

function recalcHeldDirection(id) {
  const set = heldDirections.get(id) ?? new Set()
  if (set.has('forward') && !set.has('reverse')) api()?.setMotorDirection(id, 1)
  else if (set.has('reverse') && !set.has('forward')) api()?.setMotorDirection(id, -1)
  else api()?.setMotorDirection(id, 0)
}

window.addEventListener('keydown', event => {
  if (bindingCapture) {
    event.preventDefault(); event.stopImmediatePropagation()
    const { id, action, button } = bindingCapture
    if (event.code === 'Escape') {
      bindingCapture = null
      renderControlProperties()
      return
    }
    const code = event.code === 'Backspace' || event.code === 'Delete' ? null : event.code
    api()?.updateConfig(id, { bindings: { [action]: code } })
    button?.classList.remove('capture')
    bindingCapture = null
    renderControlProperties()
    return
  }

  if (!activeRuntimeMode() || isTyping(event.target) || !api()) return
  let matched = false
  for (const [id, state] of api().getRuntimeEntries()) {
    const config = api().getConfig(id)
    if (!config) continue
    for (const [action, code] of Object.entries(config.bindings ?? {})) {
      if (!code || code !== event.code) continue
      matched = true
      if (state.type === 'motor') {
        if (action === 'forward' || action === 'reverse') {
          const set = heldDirections.get(id) ?? new Set()
          set.add(action); heldDirections.set(id, set); recalcHeldDirection(id)
        } else if (action === 'stop' && !event.repeat) api().setMotorDirection(id, 0)
        else if (action === 'toggle' && !event.repeat) api().toggleMotor(id)
        else if (action === 'speedUp') api().nudgeMotorRpm(id, config.motor.stepRpm)
        else if (action === 'speedDown') api().nudgeMotorRpm(id, -config.motor.stepRpm)
      } else if (!event.repeat) {
        if (action === 'forward' || action === 'neutral' || action === 'reverse') api().setTransmissionMode(id, action)
        else if (action === 'next') api().stepTransmission(id, 1)
        else if (action === 'previous') api().stepTransmission(id, -1)
      }
    }
  }
  if (matched) { event.preventDefault(); event.stopImmediatePropagation() }
}, true)

window.addEventListener('keyup', event => {
  if (!activeRuntimeMode() || !api()) return
  let matched = false
  for (const [id, state] of api().getRuntimeEntries()) {
    if (state.type !== 'motor') continue
    const config = api().getConfig(id)
    for (const action of ['forward', 'reverse']) {
      if (config?.bindings?.[action] !== event.code) continue
      matched = true
      const set = heldDirections.get(id)
      set?.delete(action)
      recalcHeldDirection(id)
    }
  }
  if (matched) { event.preventDefault(); event.stopImmediatePropagation() }
}, true)

function installProjectIO() {
  const exportBtn = document.getElementById('exportBtn')
  const importFile = document.getElementById('importFile')
  if (!exportBtn || !importFile || !api()) return requestAnimationFrame(installProjectIO)
  if (exportBtn.dataset.controlExportReady === 'true') return
  exportBtn.dataset.controlExportReady = 'true'

  exportBtn.onclick = () => {
    document.getElementById('saveBtn')?.click()
    try {
      const project = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null')
      if (!project?.parts) return
      project.controlsVersion = 1
      project.parts = project.parts.map(part => ({ ...part, control: api().getConfig(part.instanceId) ?? undefined }))
      project.savedAt = new Date().toISOString()
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${String(project.name || 'bricklab').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bricklab'}.bricklab`
      link.click(); URL.revokeObjectURL(link.href)
    } catch (error) { console.error(error) }
  }

  document.addEventListener('change', async event => {
    if (event.target !== importFile) return
    event.preventDefault(); event.stopImmediatePropagation()
    const file = importFile.files?.[0]
    if (!file) return
    try {
      const project = JSON.parse(await file.text())
      if (!project || !Array.isArray(project.parts)) throw new Error('Invalid BrickLab project')
      api().stageProjectControls(project.parts)
      localStorage.setItem(PROJECT_KEY, JSON.stringify(project))
      location.reload()
    } catch (error) {
      console.error(t('importFailed'), error)
      const toast = document.getElementById('toast')
      if (toast) { toast.textContent = `${t('importFailed')} · ${error.message || error}`; toast.classList.add('show') }
    }
  }, true)
}

window.addEventListener('bricklab:control-runtime-change', event => updateRuntimeRow(event.detail?.id))
window.addEventListener('bricklab:controls-runtime-reset', () => { heldDirections.clear(); requestAnimationFrame(renderDeck) })
window.addEventListener('bricklab:control-config-change', () => { renderControlProperties(); if (activeRuntimeMode()) renderDeck() })
window.addEventListener('bricklab:languagechange', () => { renderControlProperties(); renderDeck() })

installProperties()
installDeck()
installProjectIO()
