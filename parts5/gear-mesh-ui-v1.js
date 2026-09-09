import * as THREE from 'three'

export const PARTS5_GEAR_MESH_UI_VERSION = 'parts-5-gear-mesh-ui-v2'

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

function publicCandidate(candidate) {
  if (!candidate) return null
  if (candidate.movingTeeth != null) return candidate
  return {
    kind: candidate.gearKind,
    movingTeeth: candidate.movingGear?.teeth,
    fixedTeeth: candidate.fixedGear?.teeth,
  }
}

let guides = []
const movingGuideMaterial = new THREE.LineBasicMaterial({
  color: 0x74e6a6,
  transparent: true,
  opacity: 0.95,
  depthTest: false,
})
const fixedGuideMaterial = new THREE.LineBasicMaterial({
  color: 0x69a9ff,
  transparent: true,
  opacity: 0.82,
  depthTest: false,
})

function clearGuides() {
  for (const guide of guides) {
    guide.parent?.remove(guide)
    guide.geometry?.dispose?.()
  }
  guides = []
}

function addPitchCircle(descriptor, material) {
  const object = descriptor?.object
  const connector = descriptor?.connector
  const radius = Number(descriptor?.pitchRadius)
  if (!object || !connector || !(radius > 0)) return null

  const points = []
  for (let i = 0; i < 72; i += 1) {
    const angle = i / 72 * Math.PI * 2
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const line = new THREE.LineLoop(geometry, material)
  line.position.fromArray(connector.position)
  line.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(...connector.axis).normalize(),
  )
  line.renderOrder = 30
  line.frustumCulled = false
  line.userData.parts5GearMeshGuide = true
  object.add(line)
  guides.push(line)
  return line
}

function refreshPitchGuides() {
  clearGuides()
  const candidate = globalThis.__bricklabGearMeshCandidate
  if (!candidate || candidate.kind !== 'gear-mesh') return
  addPitchCircle(candidate.movingGear, movingGuideMaterial)
  addPitchCircle(candidate.fixedGear, fixedGuideMaterial)
}

function showCandidate(value) {
  const detail = publicCandidate(value)
  const hint = ensureHint()
  refreshPitchGuides()
  if (!hint) return
  if (!detail?.movingTeeth || !detail?.fixedTeeth) {
    hint.hidden = true
    hint.textContent = ''
    return
  }
  const ru = isRussian()
  const kind = detail.kind === 'bevel'
    ? (ru ? 'КОНИЧЕСКОЕ ЗАЦЕПЛЕНИЕ' : 'BEVEL MESH')
    : (ru ? 'ЗАЦЕПЛЕНИЕ ШЕСТЕРЁН' : 'GEAR MESH')
  const phase = detail.kind === 'spur' ? (ru ? ' · ФАЗА ЗУБЬЕВ' : ' · TOOTH PHASE') : ''
  hint.textContent = `${kind} · ${detail.movingTeeth}T ↔ ${detail.fixedTeeth}T · ${ratioLabel(detail.movingTeeth, detail.fixedTeeth)}${phase}`
  hint.hidden = false
  hint.style.borderColor = 'rgba(116,230,166,.38)'
  hint.style.color = '#a8f2c7'
}

let snapTimer = 0
function showSnap(detail) {
  const hint = ensureHint()
  if (!hint || !detail) return
  const ru = isRussian()
  const phase = detail.phaseAligned ? (ru ? ' · зубья совмещены' : ' · teeth phased') : ''
  hint.textContent = `${ru ? 'ЗАЦЕПЛЕНИЕ УСТАНОВЛЕНО' : 'GEAR MESH SNAPPED'} · ${detail.movingTeeth}T ↔ ${detail.fixedTeeth}T${phase}`
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
window.addEventListener('bricklab:languagechange', () => showCandidate(globalThis.__bricklabGearMeshCandidate))
window.addEventListener('beforeunload', clearGuides, { once: true })

globalThis.BrickLabParts5GearMeshUI = Object.freeze({
  version: PARTS5_GEAR_MESH_UI_VERSION,
  refresh: () => showCandidate(globalThis.__bricklabGearMeshCandidate),
  clearGuides,
})
