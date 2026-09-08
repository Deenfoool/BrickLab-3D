const BUILD_ID = 'RUNTIME-1'
const BUILD_TAG = 'runtime-1-20260908-0539'
window.__bricklabBuildId = BUILD_ID
window.__bricklabBuildTag = BUILD_TAG

function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function shortMessage(value, limit = 150) {
  const text = String(value || 'Unknown error').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function showPhysicsError(detail = {}) {
  setTimeout(() => {
    const toast = document.getElementById('toast')
    const simState = document.getElementById('simState')
    if (!toast) return

    const ru = isRussian()
    const loadFailure = detail.stage === 'rapier-load'
    const buildStage = detail.buildStage ? ` [${detail.buildStage}]` : ''
    const prefix = loadFailure
      ? (ru ? 'RAPIER: не удалось загрузить движок' : 'RAPIER: engine load failed')
      : (ru ? `PHYSICS${buildStage}: ошибка сборки мира` : `PHYSICS${buildStage}: world build failed`)
    const message = `${prefix} · ${shortMessage(detail.message)}`

    toast.textContent = message
    toast.classList.add('show')
    if (simState) simState.textContent = loadFailure
      ? (ru ? 'Rapier не загрузился' : 'Rapier failed to load')
      : `${ru ? 'Ошибка Physics v2' : 'Physics v2 build error'}${buildStage}`

    clearTimeout(window.__bricklabPhysicsErrorToastTimer)
    window.__bricklabPhysicsErrorToastTimer = setTimeout(() => toast.classList.remove('show'), 12000)
  }, 0)
}

function installBuildStamp() {
  const actions = document.querySelector('.top-actions')
  if (!actions) {
    requestAnimationFrame(installBuildStamp)
    return
  }
  if (document.getElementById('bricklabBuildStamp')) return
  const badge = document.createElement('span')
  badge.id = 'bricklabBuildStamp'
  badge.textContent = BUILD_ID
  badge.title = `BrickLab production build ${BUILD_TAG} · simulation time scale + command RPM motor physics`
  Object.assign(badge.style, {
    display: 'inline-flex',
    alignItems: 'center',
    height: '24px',
    padding: '0 7px',
    border: '1px solid #2f4a3a',
    borderRadius: '6px',
    background: '#152019',
    color: '#74e6a6',
    fontSize: '8px',
    fontWeight: '800',
    letterSpacing: '.08em',
    whiteSpace: 'nowrap',
  })
  actions.insertBefore(badge, actions.firstChild)
}

window.addEventListener('bricklab:physicserror', event => showPhysicsError(event.detail))
window.addEventListener('DOMContentLoaded', installBuildStamp, { once: true })
installBuildStamp()

window.__bricklabPhysicsDiagnostics = () => ({
  buildId: BUILD_ID,
  buildTag: BUILD_TAG,
  buildStage: window.__bricklabPhysicsStage ?? null,
  autoWeld: window.__bricklabLastAutoWeldStats ?? null,
  controls: window.BrickLabControls?.getRuntimeEntries?.() ?? [],
  timeScale: window.BrickLabSimulationTime?.getApplied?.() ?? 1,
  lastError: window.__bricklabPhysicsLastError ?? null,
  rapierSource: window.__bricklabRapierSource ?? null,
})
