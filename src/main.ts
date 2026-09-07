import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { PARTS, findPart } from './parts'
import { applySnap, connectorWorldPosition, findSnapCandidate } from './snapping'
import type { SnapCandidate } from './snapping'
import type { EditorMode, SavedPart, SavedProject, TransformMode } from './types'

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!
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

const viewport = $('#viewport') as HTMLDivElement
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x181b1f)
scene.fog = new THREE.Fog(0x181b1f, 45, 110)
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300)
camera.position.set(14, 12, 18)
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.outputColorSpace = THREE.SRGBColorSpace
viewport.append(renderer.domElement)

const orbit = new OrbitControls(camera, renderer.domElement)
orbit.enableDamping = true
orbit.target.set(0, 2, 0)
orbit.mouseButtons.LEFT = -1 as any
orbit.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
orbit.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
orbit.maxPolarAngle = Math.PI / 2.03
orbit.minDistance = 4
orbit.maxDistance = 70

scene.add(new THREE.HemisphereLight(0xe8eef7, 0x31363c, 2.25))
const sun = new THREE.DirectionalLight(0xffffff, 2.4)
sun.position.set(10, 18, 9)
sun.castShadow = true
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
const connectorMaterial = new THREE.MeshBasicMaterial({ color: 0x69a9ff, depthTest: false, transparent: true, opacity: 0.8 })
const snapMarker = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), new THREE.MeshBasicMaterial({ color: 0x74e6a6, depthTest: false }))
snapMarker.visible = false
scene.add(snapMarker)

const transform = new TransformControls(camera, renderer.domElement)
transform.setTranslationSnap(0.5)
transform.setRotationSnap(Math.PI / 2)
transform.setSize(0.85)
scene.add(transform.getHelper())

let selected: THREE.Object3D | null = null
let selectionBox: THREE.BoxHelper | null = null
let snapCandidate: SnapCandidate | null = null
let mode: EditorMode = 'build'
let category = 'All'
let projectName = 'Untitled Build'
let toastTimer = 0

function toast(text: string) {
  const el = $('#toast')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200)
}

function makePart(partId: string, color?: number) {
  const def = findPart(partId)
  if (!def) return null
  const actualColor = color ?? def.defaultColor
  const object = def.create(actualColor)
  object.userData = { ...object.userData, partId, color: actualColor, instanceId: crypto.randomUUID() }
  object.traverse(child => {
    child.userData.instanceRoot = object
    if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true }
  })
  return object
}

function connectorGuides() {
  connectorRoot.clear()
  if (!selected || mode !== 'build') return
  const def = findPart(selected.userData.partId)
  def?.connectors.forEach(connector => {
    const point = new THREE.Mesh(connectorGeometry, connectorMaterial)
    point.position.copy(connectorWorldPosition(selected!, connector))
    point.renderOrder = 10
    connectorRoot.add(point)
  })
}

function refreshSnap() {
  snapCandidate = selected && mode === 'build' ? findSnapCandidate(selected, buildRoot.children) : null
  snapMarker.visible = !!snapCandidate
  if (snapCandidate) snapMarker.position.copy(snapCandidate.targetWorld)
}

function select(object: THREE.Object3D | null) {
  if (selectionBox) { scene.remove(selectionBox); selectionBox.dispose(); selectionBox = null }
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

transform.addEventListener('dragging-changed', event => { orbit.enabled = !(event as unknown as { value: boolean }).value })
transform.addEventListener('objectChange', () => { updateInspector(); connectorGuides(); refreshSnap() })
transform.addEventListener('mouseUp', () => {
  snapGrid()
  refreshSnap()
  if (selected && snapCandidate) {
    applySnap(selected, snapCandidate)
    toast(`Snapped ${snapCandidate.source.type} → ${snapCandidate.target.type}`)
  }
  updateInspector(); connectorGuides(); refreshSnap(); saveLocal()
})

function addPart(partId: string) {
  const object = makePart(partId)
  if (!object) return
  object.position.set(((buildRoot.children.length % 6) - 2.5) * 1.5, 0, 0)
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
}

function setTransformMode(next: TransformMode) {
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
  select(hit ? (hit.object.userData.instanceRoot as THREE.Object3D) : null)
})

function renderCatalog() {
  const categories = ['All', ...new Set(PARTS.map(p => p.category))]
  const tabs = $('#categoryTabs')
  tabs.innerHTML = categories.map(c => `<button class="category ${c === category ? 'active' : ''}" data-cat="${c}">${c}</button>`).join('')
  tabs.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.onclick = () => { category = button.dataset.cat ?? 'All'; renderCatalog() })
  const query = ($('#partSearch') as HTMLInputElement).value.trim().toLowerCase()
  const list = PARTS.filter(p => (category === 'All' || p.category === category) && (!query || `${p.name} ${p.description}`.toLowerCase().includes(query)))
  $('#partCount').textContent = String(list.length)
  $('#partsList').innerHTML = list.map(p => `<button class="part-card" data-part="${p.id}"><span class="part-icon">${p.icon}</span><span><strong>${p.name}</strong><small>${p.description}</small></span><span class="plus">+</span></button>`).join('') || '<div class="no-results">No matching parts</div>'
  document.querySelectorAll<HTMLButtonElement>('.part-card').forEach(button => button.onclick = () => addPart(button.dataset.part!))
}

function updateInspector() {
  $('#emptyInspector').classList.toggle('hidden', !!selected)
  $('#inspector').classList.toggle('hidden', !selected)
  if (!selected) return
  const def = findPart(selected.userData.partId)
  $('#selectedName').textContent = def?.name ?? 'Unknown part'
  $('#selectedId').textContent = selected.userData.instanceId.slice(0, 8)
  $('#selectedIcon').textContent = def?.icon ?? '◇'
  $('#connectorState').textContent = `${def?.connectors.length ?? 0} points`
  const axes = ['x', 'y', 'z'] as const
  $('#positionFields').innerHTML = axes.map(a => `<label><span>${a.toUpperCase()}</span><input data-pos="${a}" value="${selected!.position[a].toFixed(2)}" /></label>`).join('')
  $('#rotationFields').innerHTML = axes.map(a => `<label><span>${a.toUpperCase()}</span><input data-rot="${a}" value="${Math.round(THREE.MathUtils.radToDeg(selected!.rotation[a]))}°" /></label>`).join('')
  document.querySelectorAll<HTMLInputElement>('[data-pos]').forEach(input => input.onchange = () => { if (!selected) return; const a = input.dataset.pos as 'x'|'y'|'z'; const n = Number(input.value); if (Number.isFinite(n)) selected.position[a] = n; snapGrid(); connectorGuides(); refreshSnap(); saveLocal() })
  document.querySelectorAll<HTMLInputElement>('[data-rot]').forEach(input => input.onchange = () => { if (!selected) return; const a = input.dataset.rot as 'x'|'y'|'z'; const n = Number(input.value.replace('°','')); if (Number.isFinite(n)) selected.rotation[a] = THREE.MathUtils.degToRad(n); snapGrid(); connectorGuides(); refreshSnap(); saveLocal() })
  ;($('#colorInput') as HTMLInputElement).value = `#${Number(selected.userData.color).toString(16).padStart(6, '0')}`
}

function buildTestCourse() {
  testRoot.clear()
  const mat = new THREE.MeshStandardMaterial({ color: 0x454b52, roughness: 0.95 })
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 7), mat)
  ramp.position.set(9, 1.25, -5); ramp.rotation.z = -THREE.MathUtils.degToRad(14); testRoot.add(ramp)
  for (let i = 0; i < 5; i++) { const h = 0.8 + i * 0.28; const obstacle = new THREE.Mesh(new THREE.BoxGeometry(1.2, h, 6), mat); obstacle.position.set(-9 + i * 2.1, h / 2, -6); testRoot.add(obstacle) }
}

function setMode(next: EditorMode) {
  mode = next
  document.querySelectorAll<HTMLButtonElement>('.mode').forEach(b => b.classList.toggle('active', b.dataset.mode === next))
  $('.viewport-toolbar').classList.toggle('disabled', next !== 'build')
  testRoot.clear(); connectorRoot.clear(); snapMarker.visible = false
  if (next === 'build') { $('#statusText').textContent = 'BUILD MODE · Connector snap enabled'; if (selected) transform.attach(selected); connectorGuides(); refreshSnap() }
  if (next === 'simulate') { $('#statusText').textContent = 'SIMULATE PREVIEW · Rapier physics is next'; select(null); toast('Physics shell ready for the next milestone') }
  if (next === 'test') { $('#statusText').textContent = 'TEST LAB · Prototype obstacle course'; select(null); buildTestCourse() }
}

function serialize(): SavedProject {
  return { version: 1, name: projectName, savedAt: new Date().toISOString(), parts: buildRoot.children.map(o => ({ instanceId: o.userData.instanceId, partId: o.userData.partId, color: o.userData.color, position: [o.position.x, o.position.y, o.position.z], rotation: [o.rotation.x, o.rotation.y, o.rotation.z] } satisfies SavedPart)) }
}
function saveLocal() { localStorage.setItem('bricklab.project', JSON.stringify(serialize())) }
function loadProject(project: SavedProject) {
  if (project.version !== 1 || !Array.isArray(project.parts)) throw new Error('Unsupported BrickLab project')
  select(null); buildRoot.clear(); projectName = project.name || 'Imported Build'; $('#projectName').textContent = projectName
  project.parts.forEach(p => { const object = makePart(p.partId, p.color); if (!object) return; object.userData.instanceId = p.instanceId; object.position.fromArray(p.position); object.rotation.set(...p.rotation); buildRoot.add(object) })
  saveLocal()
}
try { const raw = localStorage.getItem('bricklab.project'); if (raw) loadProject(JSON.parse(raw) as SavedProject) } catch { localStorage.removeItem('bricklab.project') }

$('#moveTool').addEventListener('click', () => setTransformMode('translate'))
$('#rotateTool').addEventListener('click', () => setTransformMode('rotate'))
$('#deleteBtn').addEventListener('click', removeSelected)
$('#duplicateBtn').addEventListener('click', duplicateSelected)
$('#saveBtn').addEventListener('click', () => { saveLocal(); toast('Saved in this browser') })
$('#newBtn').addEventListener('click', () => { if (buildRoot.children.length && !confirm('Start a new build? Current browser save will be replaced.')) return; select(null); buildRoot.clear(); projectName = 'Untitled Build'; $('#projectName').textContent = projectName; saveLocal() })
$('#exportBtn').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'bricklab-build.bricklab'; a.click(); URL.revokeObjectURL(url) })
$('#importBtn').addEventListener('click', () => ($('#importFile') as HTMLInputElement).click())
;($('#importFile') as HTMLInputElement).addEventListener('change', async event => { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; try { loadProject(JSON.parse(await file.text()) as SavedProject); toast('Project imported') } catch { alert('Invalid BrickLab project') } input.value = '' })
;($('#colorInput') as HTMLInputElement).addEventListener('change', event => { if (!selected) return; const old = selected; const replacement = makePart(old.userData.partId, Number.parseInt((event.target as HTMLInputElement).value.slice(1), 16)); if (!replacement) return; replacement.position.copy(old.position); replacement.rotation.copy(old.rotation); replacement.userData.instanceId = old.userData.instanceId; buildRoot.remove(old); buildRoot.add(replacement); select(replacement); saveLocal() })
;($('#partSearch') as HTMLInputElement).addEventListener('input', renderCatalog)
document.querySelectorAll<HTMLButtonElement>('.mode').forEach(button => button.onclick = () => setMode(button.dataset.mode as EditorMode))
window.addEventListener('keydown', event => { if ((event.target as HTMLElement).matches('input')) return; if (event.key.toLowerCase() === 'w') setTransformMode('translate'); if (event.key.toLowerCase() === 'e') setTransformMode('rotate'); if (event.key === 'Delete' || event.key === 'Backspace') removeSelected(); if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelected() } if (event.key === 'Escape') select(null) })

renderCatalog()
const resize = () => { const w = viewport.clientWidth; const h = Math.max(viewport.clientHeight, 1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix() }
new ResizeObserver(resize).observe(viewport)
resize()
renderer.setAnimationLoop(() => { orbit.update(); selectionBox?.update(); renderer.render(scene, camera) })
