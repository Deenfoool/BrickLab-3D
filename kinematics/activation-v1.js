export const KINEMATICS_ACTIVATION_VERSION = 'kinematics-activation-v1.0.0'

const LANGUAGE_KEY = 'bricklab.ui.language.v1'

function language() {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY)
    if (value === 'ru' || value === 'en') return value
  } catch {}
  return String(navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

function copy() {
  return language() === 'ru'
    ? { label:'КИНЕМАТИКА', title:'Кинематика — движение механизма без гравитации и столкновений', loading:'Загрузка кинематики…', error:'Кинематика не запустилась' }
    : { label:'KINEMATICS', title:'Kinematics — mechanism motion without gravity or collision impulses', loading:'Loading Kinematics…', error:'Kinematics could not start' }
}

function toast(message, timeout = 3600) {
  const node = document.querySelector('#toast')
  if (!node) return
  node.textContent = message
  node.classList.add('show')
  globalThis.setTimeout?.(() => node.classList.remove('show'), timeout)
}

function ensureStylesheet() {
  if (!globalThis.document?.head || document.querySelector('link[data-bricklab-kinematics]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = './kinematics/kinematics-v1.css?v=kinematics-20260912-v1'
  link.dataset.bricklabKinematics = 'v1'
  document.head.append(link)
}

function ensureButton() {
  const modes = document.querySelector('.modes')
  if (!modes) throw new Error('Kinematics activation could not find the mode bar')
  const existing = modes.querySelector('[data-mode="kinematics"]')
  if (existing) return existing

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'mode kinematics-mode'
  button.dataset.mode = 'kinematics'
  button.dataset.kinematicsOwned = 'true'
  button.innerHTML = '<i data-lucide="orbit"></i><span></span>'
  const simulate = modes.querySelector('[data-mode="simulate"]')
  if (simulate) modes.insertBefore(button, simulate)
  else modes.append(button)
  globalThis.lucide?.createIcons?.({ attrs:{ 'stroke-width':1.8, 'aria-hidden':'true' } })
  return button
}

function localizeButton(button) {
  const text = copy()
  const span = button.querySelector('span')
  if (span) span.textContent = text.label
  button.title = text.title
}

ensureStylesheet()
const button = ensureButton()
localizeButton(button)

let loading = false

async function activate(event) {
  event?.preventDefault?.()
  event?.stopPropagation?.()
  if (loading) return
  const existing = globalThis.BrickLabKinematics
  if (existing?.active?.()) {
    existing.exit?.({ restore:true })
    return
  }

  if (globalThis.BrickLabSubsystems?.editor?.mode?.() !== 'build') {
    toast(language() === 'ru' ? 'Сначала вернитесь в СБОРКУ' : 'Return to BUILD before entering Kinematics')
    return
  }

  loading = true
  button.disabled = true
  button.dataset.kinematicsState = 'loading'
  button.title = copy().loading
  try {
    await import('./runtime-v1.js?v=kinematics-20260912-v1')
    const api = globalThis.BrickLabKinematics
    if (!api?.enter) throw new Error('Kinematics runtime loaded without an enter API')
    button.dataset.kinematicsState = 'ready'
    localizeButton(button)
    await api.enter()
  } catch (error) {
    button.dataset.kinematicsState = 'error'
    button.title = `${copy().error}: ${error?.message || error}`
    console.error('[BrickLab Kinematics] Runtime failed to load', error)
    toast(`${copy().error}: ${error?.message || error}`)
  } finally {
    loading = false
    button.disabled = false
  }
}

button.addEventListener('click', activate)
globalThis.addEventListener?.('bricklab:languagechange', () => localizeButton(button))

globalThis.BrickLabKinematicsActivation = Object.freeze({
  version:KINEMATICS_ACTIVATION_VERSION,
  button,
  loaded:() => Boolean(globalThis.BrickLabKinematics),
  activate:() => activate(),
})

globalThis.dispatchEvent?.(new CustomEvent('bricklab:kinematicsactivationready', {
  detail:{ version:KINEMATICS_ACTIVATION_VERSION },
}))
