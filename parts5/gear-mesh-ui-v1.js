export const PARTS5_GEAR_MESH_UI_VERSION = 'parts-5-gear-mesh-ui-v1'

function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function ensureHint() {
  const viewport = document.getElementById('viewport')
  if (!viewport) return null
  let hint = document.getElementById('gearMeshHintV1')
  if (hint) return hint

  hint = document.createElement('div')
  hint.id = 'gearMeshHintV1'
  hint.hidden = true
  hint.setAttribute('aria-live', 'polite')
  Object.assign(hint.style, {
    position: 'absolute',
    left: '50%',
    bottom: '76px',
    transform: 'translateX(-50%)',
    zIndex: '24',
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    minHeight: '28px',
    padding: '0 10px',
    border: '1px solid rgba(116,230,166,.38)',
    borderRadius: '7px',
    background: 'rgba(15,24,19,.90)',
    boxShadow: '0 8px 24px rgba(0,0,0,.28)',
    color: '#a8f2c7',
    fontSize: '10px',
    fontWeight: '750',
    letterSpacing: '.035em',
    pointerEvents: 'none',
    backdropFilter: 'blur(8px)',
  })
  viewport.parentElement?.append(hint)
  return hint
}

function ratioLabel(a, b) {
  if (!(a > 0) || !(b > 0)) return '—'
  const value = a / b
  return `${value.toFixed(value < 1 ? 3 : 2)}×`
}

function showCandidate(detail) {
  const hint = ensureHint()
  if (!hint) return
  if (!detail) {
    hint.hidden = true
    hint.textContent = ''
    return
  }
  const ru = isRussian()
  const kind = detail.kind === 'bevel' ? (ru ? 'КОНИЧЕСКОЕ ЗАЦЕПЛЕНИЕ' : 'BEVEL MESH') : (ru ? 'ЗАЦЕПЛЕНИЕ ШЕСТЕРЁН' : 'GEAR MESH')
  hint.textContent = `${kind} · ${detail.movingTeeth}T ↔ ${detail.fixedTeeth}T · ${ratioLabel(detail.movingTeeth, detail.fixedTeeth)}`
  hint.hidden = false
  hint.style.borderColor = 'rgba(116,230,166,.38)'
  hint.style.color = '#a8f2c7'
}

let snapTimer = 0
function showSnap(detail) {
  const hint = ensureHint()
  if (!hint || !detail) return
  const ru = isRussian()
  hint.textContent = `${ru ? 'ЗАЦЕПЛЕНИЕ УСТАНОВЛЕНО' : 'GEAR MESH SNAPPED'} · ${detail.movingTeeth}T ↔ ${detail.fixedTeeth}T`
  hint.hidden = false
  hint.style.borderColor = 'rgba(116,230,166,.70)'
  hint.style.color = '#d5ffe6'
  clearTimeout(snapTimer)
  snapTimer = setTimeout(() => {
    if (!globalThis.__bricklabGearMeshCandidate) hint.hidden = true
  }, 1100)
}

window.addEventListener('bricklab:gearmeshcandidate', event => showCandidate(event.detail))
window.addEventListener('bricklab:gearmeshsnap', event => showSnap(event.detail))
window.addEventListener('bricklab:languagechange', () => showCandidate(globalThis.__bricklabGearMeshCandidate ? {
  kind: globalThis.__bricklabGearMeshCandidate.gearKind,
  movingTeeth: globalThis.__bricklabGearMeshCandidate.movingGear?.teeth,
  fixedTeeth: globalThis.__bricklabGearMeshCandidate.fixedGear?.teeth,
} : null))

globalThis.BrickLabParts5GearMeshUI = Object.freeze({
  version: PARTS5_GEAR_MESH_UI_VERSION,
  refresh: () => showCandidate(globalThis.__bricklabGearMeshCandidate),
})
