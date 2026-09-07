import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { PARTS, findPart } from './parts'
import type { EditorMode, SavedPart, SavedProject, TransformMode } from './types'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">B</span><div><strong>BrickLab 3D</strong><small>Mechanical construction sandbox</small></div></div>
      <nav class="modes" aria-label="Editor mode">
        <button class="mode active" data-mode="build">BUILD</button>
        <button class="mode" data-mode="simulate">SIMULATE</button>
        <button class="mode" data-mode="test">TEST</button>
      </nav>
      <div class="top-actions">
        <button id="newBtn" class="ghost">New</button>
        <button id="saveBtn" class="ghost">Save</button>
        <button id="exportBtn" class="primary">Export</button>
      </div>
    </header>

    <aside class="sidebar parts-panel">
      <div class="panel-title"><span>PARTS</span><span id="partCount"></span></div>
      <label class="search"><span>⌕</span><input id="partSearch" placeholder="Search parts" /></label>
      <div id="categoryTabs" class="category-tabs"></div>
      <div id="partsList" class="parts-list"></div>
    </aside>

    <main class="viewport-wrap">
      <div id="viewport" class="viewport"></div>
      <div class="viewport-toolbar">
        <button id="moveTool" class="tool active" title="Move (W)">↔ <span>Move</span></button>
        <button id="rotateTool" class="tool" title="Rotate (E)">↻ <span>Rotate</span></button>
        <span class="divider"></span>
        <button id="duplicateBtn" class="tool" title="Duplicate (Ctrl+D)">⧉ <span>Duplicate</span></button>
        <button id="deleteBtn" class="tool danger" title="Delete">⌫ <span>Delete</span></button>
      </div>
      <div class="scene-status"><span class="dot"></span><span id="statusText">BUILD MODE · Grid snap 0.5 stud</span></div>
      <div class="help">LMB select · RMB orbit · Wheel zoom · W move · E rotate · Del remove</div>
      <div id="toast" class="toast"></div>
    </main>

    <aside class="sidebar inspector-panel">
      <div class="panel-title">PROPERTIES</div>
      <div id="emptyInspector" class="empty-inspector">
        <div class="empty-icon">◇</div>
        <strong>No part selected</strong>
        <p>Select a part in the scene to inspect and edit it.</p>
      </div>
      <div id="inspector" class="inspector hidden">
        <div class="selected-card">
          <div id="selectedIcon" class="selected-icon">▦</div>
          <div><strong id="selectedName">Part</strong><small id="selectedId"></small></div>
        </div>
        <section><h3>TRANSFORM</h3><div class="vector-grid" id="positionFields"></div></section>
        <section><h3>ROTATION</h3><div class="vector-grid" id="rotationFields"></div></section>
        <section><h3>APPEARANCE</h3><label class="color-row">Color <input id="colorInput" type="color" value="#d7263d" /></label></section>
        <section class="connections"><h3>MECHANICS</h3><div class="stat-row"><span>Connectors</span><b id="connectorState">Prototype</b></div><div class="stat-row"><span>Physics body</span><b>Planned</b></div></section>
      </div>
      <div class="project-box">
        <div><small>PROJECT</small><strong id="projectName">Untitled Build</strong></div>
        <button id="importBtn" class="ghost small">Import</button>
        <input id="importFile" type="file" accept="application/json,.bricklab" hidden />
      </div>
    </aside>
  </div>
`

const viewport = document.querySelector<HTMLDivElement>('#viewport')!
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x181b1f)
scene.fog = new THREE.Fog(0x181b1f, 45, 110)

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300)
camera.position.set(14, 12, 18)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
viewport.appendChild(renderer.domElement)

const orbit = new OrbitControls(camera, renderer.domElement)
orbit.enableDamping = true
orbit.target.set(0, 2, 0)
orbit.mouseButtons.LEFT = -1 as any
orbit.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
orbit.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
orbit.maxPolarAngle = Math.PI / 2.03
orbit.minDistance = 4
orbit.maxDistance = 70

const transform = new TransformControls(camera, renderer.domElement)
transform.setTranslationSnap(0.5)
transform.setRotationSnap(Math.PI / 2)
transform.setSize(0.85)
scene.add(transform.getHelper())
transform.addEventListener('dragging-changed', event => { orbit.enabled = !(event as unknown as { value: boolean }).value })
transform.addEventListener('objectChange', () => updateInspector())
transform.addEventListener('mouseUp', () => { snapSelected(); saveLocal() })

scene.add(new THREE.HemisphereLight(0xe8eef7, 0x31363c, 2.25))
const keyLight = new THREE.DirectionalLight(0xffffff, 2.4)
keyLight.position.set(10, 18, 9)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(2048, 2048)
keyLight.shadow.camera.left = -25
keyLight.shadow.camera.right = 25
keyLight.shadow.camera.top = 25
keyLight.shadow.camera.bottom = -25
scene.add(keyLight)

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.9 }),
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
ground.userData.isGround = true
scene.add(ground)

const grid = new THREE.GridHelper(80, 80, 0x555d66, 0x343a40)
grid.position.y = 0.012
scene.add(grid)

const buildRoot = new THREE.Group()
buildRoot.name = 'BuildRoot'
scene.add(buildRoot)

const testRoot = new THREE.Group()
testRoot.name = 'TestRoot'
scene.add(testRoot)

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let selected: THREE.Object3D | null = null
let selectionBox: THREE.BoxHelper | null = null
let currentCategory = 'All'
let currentMode: EditorMode = 'build'
let currentTransformMode: TransformMode = 'translate'
let projectName = 'Untitled Build'

function resize() {
  const w = viewport.clientWidth
  const h = viewport.clientHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / Math.max(h, 1)
  camera.updateProjectionMatrix()
}
new ResizeObserver(resize).observe(viewport)
resize()

function animate() {
  requestAnimationFrame(animate)
  orbit.update()
  if (selectionBox && selected) selectionBox.update()
  renderer.render(scene, camera)
}
animate()

function makeInstance(partId: string, color?: number) {
  const definition = findPart(partId)
  if (!definition) return null
  const actualColor = color ?? definition.defaultColor
  const instance = definition.create(actualColor)
  instance.userData.instanceId = crypto.randomUUID()
  instance.userData.partId = definition.id
  instance.userData.color = actualColor
  instance.traverse(child => {
    child.userData.instanceRoot = instance
    if (child instanceof THREE.Mesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
  return instance
}

function addPart(partId: string) {
  const instance = makeInstance(partId)
  if (!instance) return
  const offset = buildRoot.children.length % 6
  instance.position.set((offset - 2.5) * 1.5, 0, 0)
  buildRoot.add(instance)
  selectObject(instance)
  saveLocal()
  toast(`${findPart(partId)?.name ?? 'Part'} added`)
}

function selectObject(object: THREE.Object3D | null) {
  if (selectionBox) {
    scene.remove(selectionBox)
    selectionBox.dispose()
    selectionBox = null
  }
  selected = object
  transform.detach()
  if (selected) {
    transform.attach(selected)
    selectionBox = new THREE.BoxHelper(selected, 0x74e6a6)
    scene.add(selectionBox)
  }
  updateInspector()
}

function snapSelected() {
  if (!selected) return
  selected.position.x = Math.round(selected.position.x * 2) / 2
  selected.position.y = Math.max(0, Math.round(selected.position.y * 2) / 2)
  selected.position.z = Math.round(selected.position.z * 2) / 2
  const quarter = Math.PI / 2
  selected.rotation.x = Math.round(selected.rotation.x / quarter) * quarter
  selected.rotation.y = Math.round(selected.rotation.y / quarter) * quarter
  selected.rotation.z = Math.round(selected.rotation.z / quarter) * quarter
  updateInspector()
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0 || currentMode !== 'build' || transform.axis) return
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(buildRoot.children, true)
  if (hits.length === 0) {
    selectObject(null)
    return
  }
  const root = hits[0].object.userData.instanceRoot as THREE.Object3D | undefined
  selectObject(root ?? null)
})

function deleteSelected() {
  if (!selected) return
  const name = findPart(selected.userData.partId)?.name ?? 'Part'
  buildRoot.remove(selected)
  selectObject(null)
  saveLocal()
  toast(`${name} removed`)
}

function duplicateSelected() {
  if (!selected) return
  const copy = makeInstance(selected.userData.partId, selected.userData.color)
  if (!copy) return
  copy.position.copy(selected.position).add(new THREE.Vector3(1, 0, 1))
  copy.rotation.copy(selected.rotation)
  buildRoot.add(copy)
  selectObject(copy)
  saveLocal()
  toast('Part duplicated')
}

function setTransformMode(mode: TransformMode) {
  currentTransformMode = mode
  transform.setMode(mode)
  document.querySelector('#moveTool')?.classList.toggle('active', mode === 'translate')
  document.querySelector('#rotateTool')?.classList.toggle('active', mode === 'rotate')
}

window.addEventListener('keydown', event => {
  const target = event.target as HTMLElement
  if (target.matches('input')) return
  if (event.key.toLowerCase() === 'w') setTransformMode('translate')
  if (event.key.toLowerCase() === 'e') setTransformMode('rotate')
  if (event.key === 'Delete' || event.key === 'Backspace') deleteSelected()
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    duplicateSelected()
  }
  if (event.key === 'Escape') selectObject(null)
})

function renderCatalog() {
  const categories = ['All', ...new Set(PARTS.map(part => part.category))]
  const categoryTabs = document.querySelector<HTMLDivElement>('#categoryTabs')!
  categoryTabs.innerHTML = categories.map(cat => `<button class="category ${cat === currentCategory ? 'active' : ''}" data-cat="${cat}">${cat}</button>`).join('')
  categoryTabs.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.onclick = () => { currentCategory = button.dataset.cat ?? 'All'; renderCatalog() }
  })

  const query = document.querySelector<HTMLInputElement>('#partSearch')!.value.trim().toLowerCase()
  const filtered = PARTS.filter(part => (currentCategory === 'All' || part.category === currentCategory) && (!query || `${part.name} ${part.description}`.toLowerCase().includes(query)))
  document.querySelector('#partCount')!.textContent = String(filtered.length)
  document.querySelector('#partsList')!.innerHTML = filtered.map(part => `
    <button class="part-card" data-part="${part.id}">
      <span class="part-icon">${part.icon}</span>
      <span><strong>${part.name}</strong><small>${part.description}</small></span>
      <span class="plus">+</span>
    </button>
  `).join('') || '<div class="no-results">No matching parts</div>'
  document.querySelectorAll<HTMLButtonElement>('.part-card').forEach(button => {
    button.onclick = () => addPart(button.dataset.part!)
  })
}
renderCatalog()
document.querySelector<HTMLInputElement>('#partSearch')!.addEventListener('input', renderCatalog)

function setMode(mode: EditorMode) {
  currentMode = mode
  document.querySelectorAll<HTMLButtonElement>('.mode').forEach(button => button.classList.toggle('active', button.dataset.mode === mode))
  const status = document.querySelector('#statusText')!
  const toolbar = document.querySelector('.viewport-toolbar')!
  if (mode === 'build') {
    status.textContent = 'BUILD MODE · Grid snap 0.5 stud'
    toolbar.classList.remove('disabled')
    testRoot.clear()
    if (selected) transform.attach(selected)
  } else if (mode === 'simulate') {
    status.textContent = 'SIMULATE PREVIEW · Physics engine is the next milestone'
    toolbar.classList.add('disabled')
    transform.detach()
    selectObject(null)
    testRoot.clear()
    toast('Simulation shell ready — Rapier physics comes next')
  } else {
    status.textContent = 'TEST LAB · Prototype obstacle course'
    toolbar.classList.add('disabled')
    transform.detach()
    selectObject(null)
    buildTestCourse()
  }
}

document.querySelectorAll<HTMLButtonElement>('.mode').forEach(button => {
  button.onclick = () => setMode(button.dataset.mode as EditorMode)
})

function buildTestCourse() {
  testRoot.clear()
  const mat = new THREE.MeshStandardMaterial({ color: 0x454b52, roughness: 0.95 })
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 7), mat)
  ramp.position.set(9, 1.25, -5)
  ramp.rotation.z = -THREE.MathUtils.degToRad(14)
  ramp.receiveShadow = true
  testRoot.add(ramp)
  for (let i = 0; i < 5; i += 1) {
    const obstacle = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8 + i * 0.28, 6), mat)
    obstacle.position.set(-9 + i * 2.1, (0.8 + i * 0.28) / 2, -6)
    obstacle.castShadow = true
    obstacle.receiveShadow = true
    testRoot.add(obstacle)
  }
}

function round(n: number) { return Math.abs(n) < 0.0001 ? '0' : n.toFixed(2) }
function deg(n: number) { return Math.round(THREE.MathUtils.radToDeg(n)).toString() }

function updateInspector() {
  const empty = document.querySelector('#emptyInspector')!
  const panel = document.querySelector('#inspector')!
  if (!selected) {
    empty.classList.remove('hidden')
    panel.classList.add('hidden')
    return
  }
  empty.classList.add('hidden')
  panel.classList.remove('hidden')
  const def = findPart(selected.userData.partId)
  document.querySelector('#selectedName')!.textContent = def?.name ?? 'Unknown part'
  document.querySelector('#selectedId')!.textContent = selected.userData.instanceId.slice(0, 8)
  document.querySelector('#selectedIcon')!.textContent = def?.icon ?? '◇'
  const positionFields = document.querySelector('#positionFields')!
  positionFields.innerHTML = ['x', 'y', 'z'].map(axis => `<label><span>${axis.toUpperCase()}</span><input data-pos="${axis}" value="${round(selected!.position[axis as 'x' | 'y' | 'z'])}" /></label>`).join('')
  positionFields.querySelectorAll<HTMLInputElement>('input').forEach(input => {
    input.onchange = () => {
      if (!selected) return
      const axis = input.dataset.pos as 'x' | 'y' | 'z'
      const value = Number(input.value)
      if (Number.isFinite(value)) selected.position[axis] = value
      snapSelected(); saveLocal()
    }
  })
  const rotationFields = document.querySelector('#rotationFields')!
  rotationFields.innerHTML = ['x', 'y', 'z'].map(axis => `<label><span>${axis.toUpperCase()}</span><input data-rot="${axis}" value="${deg(selected!.rotation[axis as 'x' | 'y' | 'z'])}°" /></label>`).join('')
  rotationFields.querySelectorAll<HTMLInputElement>('input').forEach(input => {
    input.onchange = () => {
      if (!selected) return
      const axis = input.dataset.rot as 'x' | 'y' | 'z'
      const value = Number(input.value.replace('°', ''))
      if (Number.isFinite(value)) selected.rotation[axis] = THREE.MathUtils.degToRad(value)
      snapSelected(); saveLocal()
    }
  })
  const color = selected.userData.color as number
  document.querySelector<HTMLInputElement>('#colorInput')!.value = `#${color.toString(16).padStart(6, '0')}`
}

document.querySelector<HTMLInputElement>('#colorInput')!.addEventListener('change', event => {
  if (!selected) return
  const value = Number.parseInt((event.target as HTMLInputElement).value.slice(1), 16)
  const replacement = makeInstance(selected.userData.partId, value)
  if (!replacement) return
  replacement.position.copy(selected.position)
  replacement.rotation.copy(selected.rotation)
  replacement.userData.instanceId = selected.userData.instanceId
  buildRoot.remove(selected)
  buildRoot.add(replacement)
  selectObject(replacement)
  saveLocal()
})

function serialize(): SavedProject {
  return {
    version: 1,
    name: projectName,
    savedAt: new Date().toISOString(),
    parts: buildRoot.children.map(object => ({
      instanceId: object.userData.instanceId,
      partId: object.userData.partId,
      color: object.userData.color,
      position: [object.position.x, object.position.y, object.position.z],
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    } satisfies SavedPart)),
  }
}

function loadProject(project: SavedProject) {
  if (project.version !== 1 || !Array.isArray(project.parts)) throw new Error('Unsupported BrickLab project')
  selectObject(null)
  buildRoot.clear()
  projectName = project.name || 'Imported Build'
  for (const part of project.parts) {
    const object = makeInstance(part.partId, part.color)
    if (!object) continue
    object.userData.instanceId = part.instanceId || crypto.randomUUID()
    object.position.fromArray(part.position)
    object.rotation.set(...part.rotation)
    buildRoot.add(object)
  }
  document.querySelector('#projectName')!.textContent = projectName
  saveLocal()
}

function saveLocal() {
  localStorage.setItem('bricklab.project', JSON.stringify(serialize()))
}

function restoreLocal() {
  const raw = localStorage.getItem('bricklab.project')
  if (!raw) return
  try { loadProject(JSON.parse(raw) as SavedProject) } catch { localStorage.removeItem('bricklab.project') }
}
restoreLocal()

document.querySelector('#saveBtn')!.addEventListener('click', () => { saveLocal(); toast('Saved in this browser') })
document.querySelector('#newBtn')!.addEventListener('click', () => {
  if (buildRoot.children.length && !window.confirm('Start a new build? Current browser save will be replaced.')) return
  selectObject(null)
  buildRoot.clear()
  projectName = 'Untitled Build'
  document.querySelector('#projectName')!.textContent = projectName
  saveLocal()
  toast('New build created')
})

document.querySelector('#exportBtn')!.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'build'}.bricklab`
  link.click()
  URL.revokeObjectURL(link.href)
  toast('Project exported')
})

document.querySelector('#importBtn')!.addEventListener('click', () => document.querySelector<HTMLInputElement>('#importFile')!.click())
document.querySelector<HTMLInputElement>('#importFile')!.addEventListener('change', async event => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    loadProject(JSON.parse(await file.text()) as SavedProject)
    toast('Project imported')
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Could not import project')
  }
  ;(event.target as HTMLInputElement).value = ''
})

document.querySelector('#moveTool')!.addEventListener('click', () => setTransformMode('translate'))
document.querySelector('#rotateTool')!.addEventListener('click', () => setTransformMode('rotate'))
document.querySelector('#deleteBtn')!.addEventListener('click', deleteSelected)
document.querySelector('#duplicateBtn')!.addEventListener('click', duplicateSelected)

let toastTimer = 0
function toast(message: string) {
  const el = document.querySelector<HTMLDivElement>('#toast')!
  el.textContent = message
  el.classList.add('show')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200)
}
