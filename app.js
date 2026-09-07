import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { PARTS, findPart } from './parts.js'
import { applySnap, connectorWorldPosition, findSnapCandidate } from './snapping.js'

const $ = selector => document.querySelector(selector)
const app = $('#app')

app.innerHTML = `
<div class="shell">
  <header class="topbar">
    <div class="brand"><span class="brand-mark">B</span><div><strong>BrickLab 3D</strong><small>Mechanical construction sandbox</small></div></div>
    <nav class="modes"><button class="mode active" data-mode="build">BUILD</button><button class="mode" data-mode="simulate">SIMULATE</button><button class="mode" data-mode="test">TEST</button></nav>
    <div class="top-actions"><button id="newBtn" class="ghost">New</button><button id="saveBtn" class="ghost">Save</button><button id="exportBtn" class="primary">Export</button></div>
  </header>
  <aside class="sidebar parts-panel">
    <div class="panel-title"><span>PARTS</span><span id="partCount"></span></div>
    <label class="search"><span>⌕</span><input id="partSearch" placeholder="Search parts" /></label>
    <div id="categoryTabs" class="category-tabs"></div><div id="partsList" class="parts-list"></div>
  </aside>
  <main class="viewport-wrap">
    <div id="viewport" class="viewport"></div>
    <div class="viewport-toolbar"><button id="moveTool" class="tool active">↔ <span>Move</span></button><button id="rotateTool" class="tool">↻ <span>Rotate</span></button><span class="divider"></span><button id="duplicateBtn" class="tool">⧉ <span>Duplicate</span></button><button id="deleteBtn" class="tool danger">⌫ <span>Delete</span></button></div>
    <div class="scene-status"><span class="dot"></span><span id="statusText">BUILD MODE · Connector snap enabled</span></div>
    <div class="help">LMB select · RMB orbit · Wheel zoom · W move · E rotate · Del remove</div><div id="toast" class="toast"></div>
  </main>
  <aside class="sidebar inspector-panel">
    <div class="panel-title">PROPERTIES</div>
    <div id="emptyInspector" class="empty-inspector"><div class="empty-icon">◇</div><strong>No part selected</strong><p>Select a part in the scene to inspect and edit it.</p></div>
    <div id="inspector" class="inspector hidden">
      <div class="selected-card"><div id="selectedIcon" class="selected-icon">▦</div><div><strong id="selectedName">Part</strong><small id="selectedId"></small></div></div>
      <section><h3>TRANSFORM</h3><div class="vector-grid" id="positionFields"></div></section>
      <section><h3>ROTATION</h3><div class="vector-grid" id="rotationFields"></div></section>
      <section><h3>APPEARANCE</h3><label class="color-row">Color <input id="colorInput" type="color" value="#d7263d" /></label></section>
      <section><h3>MECHANICS</h3><div class="stat-row"><span>Connectors</span><b id="connectorState">0 points</b></div><div class="stat-row"><span>Physics body</span><b>Planned</b></div></section>
    </div>
    <div class="project-box"><div><small>PROJECT</small><strong id="projectName">Untitled Build</strong></div><button id="importBtn" class="ghost small">Import</button><input id="importFile" type="file" accept="application/json,.bricklab" hidden /></div>
  </aside>
</div>`

const viewport = $('#viewport')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x181b1f)
scene.fog = new THREE.Fog(0x181b1f, 45, 110)

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300)
camera.position.set(14, 12, 18)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.shadowMap.enabled = true
renderer.outputColorSpace = THREE.SRGBColorSpace
viewport.append(renderer.domElement)

const orbit = new OrbitControls(camera, renderer.domElement)
orbit.enableDamping = true
orbit.target.set(0, 2, 0)
orbit.mouseButtons.LEFT = -1
orbit.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
orbit.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
orbit.maxPolarAngle = Math.PI / 2.03
orbit.minDistance = 4
orbit.maxDistance = 70

scene.add(new THREE.HemisphereLight(0xe8eef7, 0x31363c, 2.25))
const sun = new THREE.DirectionalLight(0xffffff, 2.4)
sun.position.set(10, 18, 9)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
scene.add(sun)

const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.9 }))
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)
const grid = new THREE.GridHelper(80, 80, 0x555d66, 0x343a40)
grid.position.y = 0.012
scene.add(grid)

const buildRoot = new THREE.Group()
const testRoot = new THREE.Group()
const connectorRoot = new THREE.Group()
scene.add(buildRoot, testRoot, connectorRoot)

const connectorGeometry = new THREE.SphereGeometry(0.09, 12, 12)
const connectorMaterial = new THREE.MeshBasicMaterial({ color: 0x69a9ff, depthTest: false, transparent: true, opacity: 0.85 })
const snapMarker = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), new THREE.MeshBasicMaterial({ color: 0x74e6a6, depthTest: false }))
snapMarker.visible = false
scene.add(snapMarker)

const transform = new TransformControls(camera, renderer.domElement)
transform.setTranslationSnap(0.5)
transform.setRotationSnap(Math.PI / 2)
transform.setSize(0.85)
scene.add(transform.getHelper())

let selected = null
let selectionBox = null
let snapCandidate = null
let mode = 'build'
let category = 'All'
let projectName = 'Untitled Build'
let toastTimer = 0

function toast(text) {
  const el = $('#toast')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200)
}

function makePart(partId, color) {
  const def = findPart(partId)
  if (!def) return null
  const actualColor = color ?? def.defaultColor
  const object = def.create(actualColor)
  object.userData = { ...object.userData, partId, color: actualColor, instanceId: crypto.randomUUID() }
  object.traverse(child => {
    child.userData.instanceRoot = object
    if (child.isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
  return object
}

function clearSelectionBox() {
  if (!selectionBox) return
  scene.remove(selectionBox)
  selectionBox.geometry?.dispose?.()
  selectionBox.material?.dispose?.()
  selectionBox = null
}

function connectorGuides() {
  connectorRoot.clear()
  if (!selected || mode !== 'build') return
  const def = findPart(selected.userData.partId)
  for (const connector of def?.connectors ?? []) {
    const point = new THREE.Mesh(connectorGeometry, connectorMaterial)
    point.position.copy(connectorWorldPosition(selected, connector))
    point.renderOrder = 10
    connectorRoot.add(point)
  }
}

function refreshSnap() {
  snapCandidate = selected && mode === 'build' ? findSnapCandidate(selected, buildRoot.children) : null
  snapMarker.visible = Boolean(snapCandidate)
  if (snapCandidate) snapMarker.position.copy(snapCandidate.targetWorld)
}

function select(object) {
  clearSelectionBox()
  selected = object
  transform.detach()
  if (object && mode === 'build') {
    transform.attach(object)
    selectionBox = new THREE.BoxHelper(object, 0x74e6a6)
    scene.add(selectionBox)
  }
  updateInspector()
  connectorGuides()
  refreshSnap()
}

function snapGrid() {
  if (!selected) return
  selected.position.set(
    Math.round(selected.position.x * 2) / 2,
    Math.max(0, Math.round(selected.position.y * 2) / 2),
    Math.round(selected.position.z * 2) / 2,
  )
  const q = Math.PI / 2
  selected.rotation.set(
    Math.round(selected.rotation.x / q) * q,
    Math.round(selected.rotation.y / q) * q,
    Math.round(selected.rotation.z / q) * q,
  )
}

transform.addEventListener('dragging-changed', event => { orbit.enabled = !event.value })
transform.addEventListener('objectChange', () => {
  selectionBox?.update()
  updateInspector()
  connectorGuides()
  refreshSnap()
})
transform.addEventListener('mouseUp', () => {
  snapGrid()
  refreshSnap()
  if (selected && snapCandidate) {
    applySnap(selected, snapCandidate)
    toast(`Snapped ${snapCandidate.source.type} → ${snapCandidate.target.type}`)
  }
  selectionBox?.update()
  updateInspector()
  connectorGuides()
  refreshSnap()
  saveLocal()
})

function addPart(partId) {
  const object = makePart(partId)
  if (!object) return
  const n = buildRoot.children.length
  object.position.set((n % 6 - 2.5) * 1.5, 0, Math.floor(n / 6) * 1.5)
  buildRoot.add(object)
  select(object)
  saveLocal()
  toast(`${findPart(partId)?.name ?? 'Part'} added`)
}

function removeSelected() {
  if (!selected) return
  buildRoot.remove(selected)
  select(null)
  saveLocal()
  toast('Part removed')
}

function duplicateSelected() {
  if (!selected) return
  const copy = makePart(selected.userData.partId, selected.userData.color)
  if (!copy) return
  copy.position.copy(selected.position).add(new THREE.Vector3(1, 0, 1))
  copy.rotation.copy(selected.rotation)
  buildRoot.add(copy)
  select(copy)
  saveLocal()
  toast('Part duplicated')
}

function setTransformMode(next) {
  transform.setMode(next)
  $('#moveTool').classList.toggle('active', next === 'translate')
  $('#rotateTool').classList.toggle('active', next === 'rotate')
}

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0 || mode !== 'build' || transform.axis) return
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(buildRoot.children, true)[0]
  select(hit ? hit.object.userData.instanceRoot : null)
})

function renderCatalog() {
  const categories = ['All', ...new Set(PARTS.map(p => p.category))]
  $('#categoryTabs').innerHTML = categories.map(c => `<button class="category ${c === category ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('')
  document.querySelectorAll('.category').forEach(button => button.onclick = () => { category = button.dataset.cat || 'All'; renderCatalog() })
  const query = $('#partSearch').value.trim().toLowerCase()
  const list = PARTS.filter(p => (category === 'All' || p.category === category) && (!query || `${p.name} ${p.description}`.toLowerCase().includes(query)))
  $('#partCount').textContent = list.length
  $('#partsList').innerHTML = list.map(p => `<button class="part-card" data-part="${p.id}"><span class="part-icon">${p.icon}</span><span><strong>${p.name}</strong><small>${p.description}</small></span><span class="plus">+</span></button>`).join('') || '<div class="no-results">No matching parts</div>'
  document.querySelectorAll('.part-card').forEach(button => button.onclick = () => addPart(button.dataset.part))
}

function updateInspector() {
  $('#emptyInspector').classList.toggle('hidden', Boolean(selected))
  $('#inspector').classList.toggle('hidden', !selected)
  if (!selected) return
  const def = findPart(selected.userData.partId)
  $('#selectedName').textContent = def?.name ?? 'Unknown part'
  $('#selectedId').textContent = selected.userData.instanceId.slice(0, 8)
  $('#selectedIcon').textContent = def?.icon ?? '◇'
  $('#connectorState').textContent = `${def?.connectors?.length ?? 0} points`
  const axes = ['x', 'y', 'z']
  $('#positionFields').innerHTML = axes.map(a => `<label><span>${a.toUpperCase()}</span><input data-pos="${a}" value="${selected.position[a].toFixed(2)}"></label>`).join('')
  $('#rotationFields').innerHTML = axes.map(a => `<label><span>${a.toUpperCase()}</span><input data-rot="${a}" value="${Math.round(THREE.MathUtils.radToDeg(selected.rotation[a]))}°"></label>`).join('')
  document.querySelectorAll('[data-pos]').forEach(input => input.onchange = () => {
    if (!selected) return
    const n = Number(input.value)
    if (Number.isFinite(n)) selected.position[input.dataset.pos] = n
    snapGrid(); selectionBox?.update(); connectorGuides(); refreshSnap(); saveLocal(); updateInspector()
  })
  document.querySelectorAll('[data-rot]').forEach(input => input.onchange = () => {
    if (!selected) return
    const n = Number(input.value.replace('°', ''))
    if (Number.isFinite(n)) selected.rotation[input.dataset.rot] = THREE.MathUtils.degToRad(n)
    snapGrid(); selectionBox?.update(); connectorGuides(); refreshSnap(); saveLocal(); updateInspector()
  })
  $('#colorInput').value = `#${Number(selected.userData.color).toString(16).padStart(6, '0')}`
}

function setPartColor(hex) {
  if (!selected) return
  const color = Number.parseInt(hex.slice(1), 16)
  selected.userData.color = color
  selected.traverse(child => {
    if (!child.isMesh || !child.material) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) if (mat.color && mat.color.getHex() !== 0x222426 && mat.color.getHex() !== 0x17191b) mat.color.setHex(color)
  })
  saveLocal()
}

function buildTestCourse() {
  testRoot.clear()
  const mat = new THREE.MeshStandardMaterial({ color: 0x454b52, roughness: 0.95 })
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 7), mat)
  ramp.position.set(9, 1.25, -5)
  ramp.rotation.z = -THREE.MathUtils.degToRad(14)
  testRoot.add(ramp)
  for (let i = 0; i < 5; i++) {
    const h = 0.8 + i * 0.28
    const obstacle = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 6), mat)
    obstacle.position.set(-9 + i * 2.1, h / 2, -6)
    testRoot.add(obstacle)
  }
}

function setMode(next) {
  mode = next
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('active', b.dataset.mode === next))
  $('.viewport-toolbar').classList.toggle('disabled', next !== 'build')
  testRoot.clear(); connectorRoot.clear(); snapMarker.visible = false
  if (next === 'build') {
    $('#statusText').textContent = 'BUILD MODE · Connector snap enabled'
    if (selected) transform.attach(selected)
    connectorGuides(); refreshSnap()
  } else if (next === 'simulate') {
    $('#statusText').textContent = 'SIMULATE PREVIEW · Physics coming next'
    select(null)
    toast('Rapier physics is the next milestone')
  } else {
    $('#statusText').textContent = 'TEST LAB · Prototype obstacle course'
    select(null)
    buildTestCourse()
  }
}

function serializeProject() {
  return {
    version: 1,
    name: projectName,
    savedAt: new Date().toISOString(),
    parts: buildRoot.children.map(object => ({
      instanceId: object.userData.instanceId,
      partId: object.userData.partId,
      color: object.userData.color,
      position: object.position.toArray(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    })),
  }
}

function loadProject(data) {
  if (!data || !Array.isArray(data.parts)) throw new Error('Invalid BrickLab project')
  select(null)
  buildRoot.clear()
  projectName = data.name || 'Imported Build'
  $('#projectName').textContent = projectName
  for (const item of data.parts) {
    const object = makePart(item.partId, item.color)
    if (!object) continue
    object.userData.instanceId = item.instanceId || crypto.randomUUID()
    if (Array.isArray(item.position)) object.position.fromArray(item.position)
    if (Array.isArray(item.rotation)) object.rotation.set(...item.rotation)
    buildRoot.add(object)
  }
  saveLocal()
}

function saveLocal() {
  try { localStorage.setItem('bricklab.project.v1', JSON.stringify(serializeProject())) } catch (error) { console.warn(error) }
}

function loadLocal() {
  try {
    const raw = localStorage.getItem('bricklab.project.v1')
    if (raw) loadProject(JSON.parse(raw))
  } catch (error) { console.warn('Could not restore project', error) }
}

function exportProject() {
  const blob = new Blob([JSON.stringify(serializeProject(), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bricklab'}.bricklab`
  a.click()
  URL.revokeObjectURL(a.href)
  toast('Project exported')
}

$('#partSearch').addEventListener('input', renderCatalog)
$('#moveTool').onclick = () => setTransformMode('translate')
$('#rotateTool').onclick = () => setTransformMode('rotate')
$('#duplicateBtn').onclick = duplicateSelected
$('#deleteBtn').onclick = removeSelected
$('#saveBtn').onclick = () => { saveLocal(); toast('Saved in this browser') }
$('#exportBtn').onclick = exportProject
$('#newBtn').onclick = () => { select(null); buildRoot.clear(); projectName = 'Untitled Build'; $('#projectName').textContent = projectName; saveLocal(); toast('New build') }
$('#colorInput').addEventListener('input', event => setPartColor(event.target.value))
$('#importBtn').onclick = () => $('#importFile').click()
$('#importFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]
  if (!file) return
  try { loadProject(JSON.parse(await file.text())); toast('Project imported') } catch (error) { console.error(error); toast('Could not import project') }
  event.target.value = ''
})
document.querySelectorAll('.mode').forEach(button => button.onclick = () => setMode(button.dataset.mode))

window.addEventListener('keydown', event => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return
  if (event.key.toLowerCase() === 'w') setTransformMode('translate')
  if (event.key.toLowerCase() === 'e') setTransformMode('rotate')
  if (event.key === 'Delete' || event.key === 'Backspace') removeSelected()
  if (event.key === 'Escape') select(null)
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected() }
})

function resize() {
  const { clientWidth, clientHeight } = viewport
  if (!clientWidth || !clientHeight) return
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(clientWidth, clientHeight, false)
}
new ResizeObserver(resize).observe(viewport)

function animate() {
  orbit.update()
  selectionBox?.update()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

renderCatalog()
loadLocal()
resize()
animate()
