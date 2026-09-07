function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function shortMessage(value, limit = 150) {
  const text = String(value || 'Unknown error').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function showPhysicsError(detail = {}) {
  // The editor's generic catch runs immediately after the create() rejection,
  // so update the toast on the next task to keep the useful diagnostic visible.
  setTimeout(() => {
    const toast = document.getElementById('toast')
    const simState = document.getElementById('simState')
    if (!toast) return

    const ru = isRussian()
    const loadFailure = detail.stage === 'rapier-load'
    const prefix = loadFailure
      ? (ru ? 'RAPIER: не удалось загрузить движок' : 'RAPIER: engine load failed')
      : (ru ? 'PHYSICS: ошибка сборки мира' : 'PHYSICS: world build failed')
    const message = `${prefix} · ${shortMessage(detail.message)}`

    toast.textContent = message
    toast.classList.add('show')
    if (simState) simState.textContent = loadFailure
      ? (ru ? 'Rapier не загрузился' : 'Rapier failed to load')
      : (ru ? 'Ошибка Physics v2' : 'Physics v2 build error')

    clearTimeout(window.__bricklabPhysicsErrorToastTimer)
    window.__bricklabPhysicsErrorToastTimer = setTimeout(() => toast.classList.remove('show'), 9000)
  }, 0)
}

window.addEventListener('bricklab:physicserror', event => showPhysicsError(event.detail))

window.__bricklabPhysicsDiagnostics = () => ({
  lastError: window.__bricklabPhysicsLastError ?? null,
  rapierSource: window.__bricklabRapierSource ?? null,
})
