export const DESIGN_DOCTOR_ACTIVATION_VERSION = 'design-doctor-activation-v1.0.1'

function toast(message, timeout = 3600) {
  const node = document.querySelector('#toast')
  if (!node) return
  node.textContent = message
  node.classList.add('show')
  globalThis.setTimeout?.(() => node.classList.remove('show'), timeout)
}

function ensureStylesheet() {
  if (!globalThis.document?.head || document.querySelector('link[data-bricklab-design-doctor]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = './guidance/design-doctor-v1.css?v=design-doctor-20260912-v2'
  link.dataset.bricklabDesignDoctor = 'v1'
  document.head.append(link)
}

function ensureButton() {
  const toolbar = document.querySelector('.viewport-toolbar')
  if (!toolbar) throw new Error('Design Doctor activation could not find the viewport toolbar')

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

ensureStylesheet()
const button = ensureButton()
let loading = false
let loaded = Boolean(globalThis.BrickLabDesignDoctor)

async function activate(event) {
  if (loaded || loading) return
  event?.preventDefault?.()
  loading = true
  button.disabled = true
  button.dataset.designDoctorState = 'loading'
  button.title = 'Loading Design Doctor…'

  try {
    await import('./design-doctor-runtime-v1.js?v=design-doctor-20260912-v3')
    const api = globalThis.BrickLabDesignDoctor
    if (!api?.scan) throw new Error('Design Doctor runtime loaded without a scan API')

    loaded = true
    button.dataset.designDoctorState = 'ready'
    button.title = 'Design Doctor — scan build diagnostics'
    button.removeEventListener('click', activate)

    await api.scan()
  } catch (error) {
    button.dataset.designDoctorState = 'error'
    button.title = `Design Doctor failed to load: ${error?.message || error}`
    console.error('[BrickLab Design Doctor] Runtime failed to load', error)
    toast(`Design Doctor could not start: ${error?.message || error}`)
  } finally {
    loading = false
    button.disabled = false
  }
}

if (!loaded) button.addEventListener('click', activate)
else button.dataset.designDoctorState = 'ready'

globalThis.BrickLabDesignDoctorActivation = Object.freeze({
  version:DESIGN_DOCTOR_ACTIVATION_VERSION,
  button,
  loaded:() => Boolean(globalThis.BrickLabDesignDoctor),
  activate:() => activate(),
})

globalThis.dispatchEvent?.(new CustomEvent('bricklab:designdoctoractivationready', {
  detail:{ version:DESIGN_DOCTOR_ACTIVATION_VERSION },
}))
