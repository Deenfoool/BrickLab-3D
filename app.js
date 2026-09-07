import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { PARTS, findPart } from './parts.js'
import { applySnap, connectorWorldPosition, findSnapCandidate, orientForSnap } from './snapping.js'
import {
  connectionsForPart,
  createConnection,
  isEndpointOccupied,
  removeConnectionsForPart,
} from './connections.js'
import { PhysicsSession } from './physics.js'

const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]
const app = $('#app')

const shortcutGroups = [
  {
    title: 'Tools',
    items: [
      ['M', 'Move'],
      ['R', 'Rotate'],
      ['S', 'Scale (reserved)'],
      ['G', 'Quick move'],
      ['X / Del', 'Delete'],
      ['Ctrl+D', 'Duplicate'],
      ['[ / ]', 'Rotate ±90°'],
    ],
  },
  {
    title: 'Edit',
    items: [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Shift+Z / Ctrl+Y', 'Redo'],
      ['Esc', 'Clear selection'],
      ['Ctrl+A', 'Select all'],
      ['Shift+Click', 'Multi-select'],
      ['Ctrl+G', 'Group selected'],
      ['Ctrl+Shift+G', 'Ungroup'],
    ],
  },
  {
    title: 'View',
    items: [
      ['F', 'Focus selection'],
      ['Home', 'Frame whole build'],
      ['1 / 2 / 3', 'Front / side / top'],
      ['5', 'Perspective / orthographic'],
      ['Q', 'Local / world axes'],
    ],
  },
  {
    title: 'Mechanics',
    items: [
      ['Shift+S', 'Connector snap'],
      ['Shift+G', 'Grid snap'],
      ['Alt+R', 'Reset rotation'],
      ['Alt+G', 'Reset position'],
      ['C', 'Connector points'],
      ['L', 'Connection graph'],
      ['D', 'Disconnect selected'],
      ['I', 'Mechanics properties'],
    ],
  },
  {
    title: 'Simulation & project',
    items: [
      ['Space', 'Play / pause'],
      ['Shift+Space', 'Reset simulation'],
      ['Tab', 'BUILD ↔ SIMULATE'],
      ['Ctrl+S', 'Save'],
      ['Ctrl+Shift+S', 'Export .bricklab'],
      ['Ctrl+O', 'Import .bricklab'],
      ['Ctrl+N', 'New project'],
      ['?', 'Keyboard shortcuts'],
    ],
  },
]

app.innerHTML = `
<div class="shell">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">B</span>
      <div><strong>BrickLab 3D</strong><small>Mechanical construction sandbox</small></div>
    </div>
    <nav class="modes">
      <button class="mode active" data-mode="build"><i data-lucide="hammer"></i><span>BUILD</span></button>
      <button class="mode" data-mode="simulate"><i data-lucide="play"></i><span>SIMULATE</span></button>
      <button class="mode" data-mode="test"><i data-lucide="flask-conical"></i><span>TEST</span></button>
    </nav>
    <div class="top-actions">
      <button id="newBtn" class="ghost" title="New project (Ctrl+N)"><i data-lucide="file-plus-2"></i><span>New</span></button>
      <button id="saveBtn" class="ghost" title="Save (Ctrl+S)"><i data-lucide="save"></i><span>Save</span></button>
      <button id="exportBtn" class="primary" title="Export .bricklab (Ctrl+Shift+S)"><i data-lucide="download"></i><span>Export</span></button>
      <button id="shortcutsBtn" class="icon-btn" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts"><i data-lucide="circle-help"></i></button>
    </div>
  </header>

  <aside class="sidebar parts-panel">
    <div class="panel-title"><span>PARTS</span><span id="partCount"></span></div>
    <label class="search"><i data-lucide="search"></i><input id="partSearch" placeholder="Search parts" /></label>
    <div id="categoryTabs" class="category-tabs"></div>
    <div id="partsList" class="parts-list"></div>
  </aside>

  <main class="viewport-wrap">
    <div id="viewport" class="viewport"></div>

    <div class="viewport-toolbar">
      <button id="moveTool" class="tool active" title="Move (M)"><i data-lucide="move-3d"></i><span>Move</span><kbd>M</kbd></button>
      <button id="rotateTool" class="tool" title="Rotate (R)"><i data-lucide="rotate-3d"></i><span>Rotate</span><kbd>R</kbd></button>
      <button id="scaleTool" class="tool reserved" title="Scale is reserved for a future milestone"><i data-lucide="scaling"></i><span>Scale</span><kbd>S</kbd></button>
      <span class="divider"></span>
      <button id="undoBtn" class="tool" title="Undo (Ctrl+Z)"><i data-lucide="undo-2"></i><span>Undo</span></button>
      <button id="redoBtn" class="tool" title="Redo (Ctrl+Shift+Z / Ctrl+Y)"><i data-lucide="redo-2"></i><span>Redo</span></button>
      <span class="divider"></span>
      <button id="duplicateBtn" class="tool" title="Duplicate (Ctrl+D)"><i data-lucide="copy"></i><span>Duplicate</span></button>
      <button id="deleteBtn" class="tool danger" title="Delete (X / Delete)"><i data-lucide="trash-2"></i><span>Delete</span></button>
    </div>

    <div id="snapToolbar" class="snap-toolbar">
      <button id="connectorSnapBtn" class="state-pill active" title="Connector snapping (Shift+S)"><i data-lucide="magnet"></i><span>Connector</span><kbd>⇧S</kbd></button>
      <button id="gridSnapBtn" class="state-pill active" title="Grid snapping (Shift+G)"><i data-lucide="grid-3x3"></i><span>Grid</span><kbd>⇧G</kbd></button>
      <button id="spaceBtn" class="state-pill" title="Transform space (Q)"><i data-lucide="axis-3d"></i><span id="spaceState">World</span><kbd>Q</kbd></button>
    </div>

    <div id="simControls" class="sim-controls hidden">
      <button id="simPlayPause" class="ghost small"><i data-lucide="pause"></i><span>Pause</span></button>
      <button id="simReset" class="ghost small"><i data-lucide="rotate-ccw"></i><span>Reset</span></button>
      <span id="simState">Physics idle</span>
    </div>

    <div class="scene-status"><span class="dot"></span><span id="statusText">BUILD MODE · Connector graph enabled</span></div>
    <div class="help"><span>M move</span><span>R rotate</span><span>F focus</span><span>Tab simulate</span><span>? shortcuts</span></div>
    <div id="toast" class="toast"></div>
  </main>

  <aside class="sidebar inspector-panel">
    <div class="panel-title">PROPERTIES</div>
    <div id="emptyInspector" class="empty-inspector">
      <div class="empty-icon"><i data-lucide="mouse-pointer-2"></i></div>
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
      <section id="mechanicsSection">
        <h3>MECHANICS</h3>
        <div class="stat-row"><span>Connectors used</span><b id="connectorState">0 / 0</b></div>
        <div class="stat-row"><span>Graph links</span><b id="connectionState">0</b></div>
        <div id="connectionsList" class="connections-list"></div>
        <button id="disconnectBtn" class="ghost small connection-action"><i data-lucide="unlink"></i><span>Disconnect all</span><kbd>D</kbd></button>
      </section>
    </div>

    <div class="project-box">
      <div><small>PROJECT</small><strong id="projectName">Untitled Build</strong><span id="projectStats">0 parts · 0 links</span></div>
      <button id="importBtn" class="ghost small" title="Import .bricklab (Ctrl+O)"><i data-lucide="upload"></i><span>Import</span></button>
      <input id="importFile" type="file" accept="application/json,.bricklab" hidden />
    </div>
  </aside>
</div>

<div id="shortcutsModal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="shortcutsTitle">
  <div class="shortcuts-modal">
    <div class="modal-head">
      <div><small>BRICKLAB 3D</small><h2 id="shortcutsTitle">Keyboard shortcuts</h2></div>
      <button id="closeShortcutsBtn" class="icon-btn" aria-label="Close"><i data-lucide="x"></i></button>
    </div>
    <div class="shortcut-grid">
      ${shortcutGroups.map(group => `
        <section class="shortcut-group">
          <h3>${group.title}</h3>
          ${group.items.map(([key, label]) => `<div class="shortcut-row"><span>${label}</span><kbd>${key}</kbd></div>`).join('')}
        </section>
      `).join('')}
    </div>
    <div class="modal-foot">Shortcuts are disabled while typing in inputs. Press <kbd>?</kbd> any time to reopen this panel.</div>
  </div>
</div>
`

function renderIcons() {
  if (!window.lucide?.createIcons) return
  window.lucide.createIcons({
    attrs: {
      'stroke-width': 1.8,
      'aria-hidden': 'true',
    },
  })
}
renderIcons()

const viewport = $('#viewport')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x181b1f)
scene.fog = new THREE.Fog(0x181b1f, 45, 110)

const perspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 300)
perspectiveCamera.position.set(14, 12, 18)
const orthographicCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, -300, 300)
orthographicCamera.position.copy(perspectiveCamera.position)
let camera = perspectiveCamera
let isOrthographic = false

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

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.9 }),
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const grid = new THREE.GridHelper(80, 80, 0x555d66, 0x343a40)
grid.position.y = 0.012
scene.add(grid)

const buildRoot = new THREE.Group()
const testRoot = new THREE.Group()
const connectorRoot = new THREE.Group()
const connectionRoot = new THREE.Group()
scene.add(buildRoot, testRoot, connectorRoot, connectionRoot)

const connectorGeometry = new THREE.SphereGeometry(0.09, 12, 12)
const freeConnectorMaterial = new THREE.MeshBasicMaterial({ color: 0x69a9ff, depthTest: false, transparent: true, opacity: 0.85 })
const occupiedConnectorMaterial = new THREE.MeshBasicMaterial({ color: 0xffb65c, depthTest: false, transparent: true, opacity: 0.95 })
const connectionMarkerGeometry = new THREE.SphereGeometry(0.135, 14, 14)
const connectionMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0x74e6a6, depthTest: false })
const snapMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.18, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0x74e6a6, depthTest: false }),
)
snapMarker.visible = false
scene.add(snapMarker)

const transform = new TransformControls(camera, renderer.domElement)
transform.setTranslationSnap(0.5)
transform.setRotationSnap(Math.PI / 2)
transform.setSize(0.85)
transform.setSpace('world')
scene.add(transform.getHelper())

let selected = null
let selectedObjects = new Set()
let selectionBoxes = new Map()
let snapCandidate = null
let mode = 'build'
let category = 'All'
let projectName = 'Untitled Build'
let connections = []
let history = []
let historyIndex = -1
let toastTimer = 0
let isDragging = false
let detachedDuringDrag = false
let physicsSession = null
let simulationStartState = null
let simulationGeneration = 0
let connectorSnapEnabled = true
let gridSnapEnabled = true
let connectorGuidesVisible = true
let connectionVisualsVisible = true
let transformSpace = 'world'

function toast(text) {
  const el = $('#toast')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200)
}

function cloneState(value) {
  return JSON.parse(JSON.stringify(value))
}

function activeSelection() {
  return [...selectedObjects]
}

function objectByInstanceId(instanceId) {
  return buildRoot.children.find(object => object.userData.instanceId === instanceId) ?? null
}

function connectorById(object, connectorId) {
  return findPart(object?.userData.partId)?.connectors?.find(connector => connector.id === connectorId) ?? null
}

function connectorAvailable(object, connector) {
  return !isEndpointOccupied(connections, object.userData.instanceId, connector.id)
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

function disposeSelectionBoxes() {
  for (const box of selectionBoxes.values()) {
    scene.remove(box)
    box.geometry?.dispose?.()
    box.material?.dispose?.()
  }
  selectionBoxes.clear()
}

function rebuildSelectionBoxes() {
  disposeSelectionBoxes()
  if (mode !== 'build') return

  for (const object of selectedObjects) {
    const color = object === selected ? 0x74e6a6 : 0x69a9ff
    const box = new THREE.BoxHelper(object, color)
    selectionBoxes.set(object, box)
    scene.add(box)
  }
}

function updateProjectStats() {
  const selectedCount = selectedObjects.size
  $('#projectStats').textContent = `${buildRoot.children.length} parts · ${connections.length} links${selectedCount > 1 ? ` · ${selectedCount} selected` : ''}`
  if (mode === 'build') {
    $('#statusText').textContent = `BUILD MODE · ${buildRoot.children.length} parts · ${connections.length} connections`
  }
}

function updateConnectionVisuals() {
  connectionRoot.clear()
  if (mode !== 'build' || !connectionVisualsVisible) return

  for (const connection of connections) {
    const object = objectByInstanceId(connection.a.instanceId)
    const connector = connectorById(object, connection.a.connectorId)
    if (!object || !connector) continue

    const marker = new THREE.Mesh(connectionMarkerGeometry, connectionMarkerMaterial)
    marker.position.copy(connectorWorldPosition(object, connector))
    marker.renderOrder = 11
    connectionRoot.add(marker)
  }
}

function connectorGuides() {
  connectorRoot.clear()
  if (!selected || mode !== 'build' || !connectorGuidesVisible) return

  const def = findPart(selected.userData.partId)
  for (const connector of def?.connectors ?? []) {
    const point = new THREE.Mesh(
      connectorGeometry,
      connectorAvailable(selected, connector) ? freeConnectorMaterial : occupiedConnectorMaterial,
    )
    point.position.copy(connectorWorldPosition(selected, connector))
    point.renderOrder = 10
    connectorRoot.add(point)
  }
}

function refreshSnap() {
  snapCandidate = selected && mode === 'build' && connectorSnapEnabled
    ? findSnapCandidate(selected, buildRoot.children, { isAvailable: connectorAvailable })
    : null
  snapMarker.visible = Boolean(snapCandidate)
  if (snapCandidate) snapMarker.position.copy(snapCandidate.targetWorld)
}

function select(object, { additive = false, toggle = false } = {}) {
  if (!additive) selectedObjects.clear()

  if (object) {
    if (toggle && selectedObjects.has(object)) {
      selectedObjects.delete(object)
      if (selected === object) selected = [...selectedObjects].at(-1) ?? null
    } else {
      selectedObjects.add(object)
      selected = object
    }
  } else if (!additive) {
    selected = null
  }

  if (selected && !selectedObjects.has(selected)) selectedObjects.add(selected)
  transform.detach()

  if (selected && mode === 'build') transform.attach(selected)

  rebuildSelectionBoxes()
  updateInspector()
  connectorGuides()
  refreshSnap()
  updateProjectStats()
}

function selectAll() {
  selectedObjects = new Set(buildRoot.children)
  selected = buildRoot.children.at(-1) ?? null
  transform.detach()
  if (selected && mode === 'build') transform.attach(selected)
  rebuildSelectionBoxes()
  updateInspector()
  connectorGuides()
  refreshSnap()
  updateProjectStats()
  toast(`${selectedObjects.size} parts selected`)
}

function snapGrid() {
  if (!selected || !gridSnapEnabled) return
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

function detachPartConnections(object, silent = false) {
  if (!object) return 0
  const before = connections.length
  connections = removeConnectionsForPart(connections, object.userData.instanceId)
  const removed = before - connections.length

  if (removed) {
    updateConnectionVisuals()
    updateProjectStats()
    connectorGuides()
    if (!silent) toast(`Disconnected ${removed} link${removed === 1 ? '' : 's'}`)
  }
  return removed
}

function detachSelectionConnections(silent = true) {
  let count = 0
  for (const object of activeSelection()) count += detachPartConnections(object, silent)
  return count
}

function attachSnapConnection(candidate) {
  if (!selected || !candidate || !connectorSnapEnabled) return null
  if (!connectorAvailable(selected, candidate.source) || !connectorAvailable(candidate.targetObject, candidate.target)) return null

  const connection = createConnection(selected, candidate.source, candidate.targetObject, candidate.target)
  connections.push(connection)
  updateConnectionVisuals()
  updateProjectStats()
  return connection
}

function projectState() {
  return {
    version: 2,
    name: projectName,
    parts: buildRoot.children.map(object => ({
      instanceId: object.userData.instanceId,
      partId: object.userData.partId,
      color: object.userData.color,
      groupId: object.userData.groupId ?? null,
      position: object.position.toArray(),
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
    })),
    connections: cloneState(connections),
  }
}

function serializeProject() {
  return { ...projectState(), savedAt: new Date().toISOString() }
}

function saveLocal() {
  try {
    localStorage.setItem('bricklab.project.v2', JSON.stringify(serializeProject()))
  } catch (error) {
    console.warn(error)
  }
}

function updateHistoryButtons() {
  $('#undoBtn').disabled = historyIndex <= 0
  $('#redoBtn').disabled = historyIndex < 0 || historyIndex >= history.length - 1
}

function commitHistory() {
  const next = projectState()
  const previous = history[historyIndex]

  if (previous && JSON.stringify(previous) === JSON.stringify(next)) {
    saveLocal()
    updateHistoryButtons()
    return
  }

  history = history.slice(0, historyIndex + 1)
  history.push(cloneState(next))
  if (history.length > 60) history.shift()
  historyIndex = history.length - 1
  saveLocal()
  updateHistoryButtons()
}

function resetHistory() {
  history = [cloneState(projectState())]
  historyIndex = 0
  saveLocal()
  updateHistoryButtons()
}

function connectionIsValid(connection, usedEndpoints) {
  if (!connection?.a?.instanceId || !connection?.a?.connectorId || !connection?.b?.instanceId || !connection?.b?.connectorId) return false
  const objectA = objectByInstanceId(connection.a.instanceId)
  const objectB = objectByInstanceId(connection.b.instanceId)
  const connectorA = connectorById(objectA, connection.a.connectorId)
  const connectorB = connectorById(objectB, connection.b.connectorId)
  if (!objectA || !objectB || !connectorA || !connectorB) return false

  const keyA = `${connection.a.instanceId}::${connection.a.connectorId}`
  const keyB = `${connection.b.instanceId}::${connection.b.connectorId}`
  if (usedEndpoints.has(keyA) || usedEndpoints.has(keyB)) return false
  usedEndpoints.add(keyA)
  usedEndpoints.add(keyB)
  return true
}

function applyProject(data, { reset = false, persist = true } = {}) {
  if (!data || !Array.isArray(data.parts)) throw new Error('Invalid BrickLab project')

  select(null)
  buildRoot.clear()
  connections = []
  projectName = data.name || 'Imported Build'
  $('#projectName').textContent = projectName

  for (const item of data.parts) {
    const object = makePart(item.partId, item.color)
    if (!object) continue
    object.userData.instanceId = item.instanceId || crypto.randomUUID()
    object.userData.groupId = item.groupId || null
    if (Array.isArray(item.position)) object.position.fromArray(item.position)
    if (Array.isArray(item.rotation)) object.rotation.set(...item.rotation)
    buildRoot.add(object)
  }

  const usedEndpoints = new Set()
  for (const connection of Array.isArray(data.connections) ? data.connections : []) {
    if (connectionIsValid(connection, usedEndpoints)) connections.push(cloneState(connection))
  }

  updateConnectionVisuals()
  updateProjectStats()
  updateInspector()
  connectorGuides()
  refreshSnap()

  if (reset) resetHistory()
  else if (persist) saveLocal()
}

function undo() {
  if (historyIndex <= 0 || mode !== 'build') return
  historyIndex -= 1
  applyProject(history[historyIndex])
  updateHistoryButtons()
  toast('Undo')
}

function redo() {
  if (historyIndex >= history.length - 1 || mode !== 'build') return
  historyIndex += 1
  applyProject(history[historyIndex])
  updateHistoryButtons()
  toast('Redo')
}

transform.addEventListener('dragging-changed', event => {
  isDragging = Boolean(event.value)
  orbit.enabled = !isDragging
  if (isDragging) detachedDuringDrag = false
})

transform.addEventListener('objectChange', () => {
  if (isDragging && selected && !detachedDuringDrag) {
    detachedDuringDrag = detachPartConnections(selected, true) > 0
  }
  for (const box of selectionBoxes.values()) box.update()
  updateInspector()
  connectorGuides()
  refreshSnap()
})

transform.addEventListener('mouseUp', () => {
  snapGrid()
  refreshSnap()

  if (selected && snapCandidate && connectorSnapEnabled) {
    orientForSnap(selected, snapCandidate)
    applySnap(selected, snapCandidate)
    const connection = attachSnapConnection(snapCandidate)
    if (connection) toast(`Connected ${connection.kind}: ${snapCandidate.source.type} → ${snapCandidate.target.type}`)
  }

  for (const box of selectionBoxes.values()) box.update()
  updateInspector()
  connectorGuides()
  refreshSnap()
  updateConnectionVisuals()
  commitHistory()
  detachedDuringDrag = false
})

function addPart(partId) {
  if (mode !== 'build') return
  const object = makePart(partId)
  if (!object) return
  const n = buildRoot.children.length
  object.position.set((n % 6 - 2.5) * 1.5, 0, Math.floor(n / 6) * 1.5)
  buildRoot.add(object)
  select(object)
  updateProjectStats()
  commitHistory()
  toast(`${findPart(partId)?.name ?? 'Part'} added`)
}

function removeSelected() {
  if (!selectedObjects.size || mode !== 'build') return
  const targets = activeSelection()
  detachSelectionConnections(true)
  for (const object of targets) buildRoot.remove(object)
  select(null)
  updateConnectionVisuals()
  updateProjectStats()
  commitHistory()
  toast(`${targets.length} part${targets.length === 1 ? '' : 's'} removed`)
}

function duplicateSelected() {
  if (!selectedObjects.size || mode !== 'build') return
  const copies = []
  for (const original of activeSelection()) {
    const copy = makePart(original.userData.partId, original.userData.color)
    if (!copy) continue
    copy.position.copy(original.position).add(new THREE.Vector3(1, 0, 1))
    copy.rotation.copy(original.rotation)
    copy.userData.groupId = original.userData.groupId ?? null
    buildRoot.add(copy)
    copies.push(copy)
  }
  selectedObjects = new Set(copies)
  selected = copies.at(-1) ?? null
  transform.detach()
  if (selected) transform.attach(selected)
  rebuildSelectionBoxes()
  updateInspector()
  updateProjectStats()
  commitHistory()
  toast(`${copies.length} part${copies.length === 1 ? '' : 's'} duplicated`)
}

function disconnectSelected() {
  if (!selectedObjects.size || mode !== 'build') return
  const count = detachSelectionConnections(true)
  if (!count) return
  updateInspector()
  refreshSnap()
  commitHistory()
  toast(`Disconnected ${count} link${count === 1 ? '' : 's'}`)
}

function groupSelected() {
  if (mode !== 'build' || selectedObjects.size < 2) {
    toast('Select at least two parts to group')
    return
  }
  const groupId = crypto.randomUUID()
  for (const object of selectedObjects) object.userData.groupId = groupId
  commitHistory()
  toast(`${selectedObjects.size} parts grouped`)
}

function ungroupSelected() {
  if (mode !== 'build' || !selectedObjects.size) return
  let changed = 0
  for (const object of selectedObjects) {
    if (object.userData.groupId) {
      object.userData.groupId = null
      changed += 1
    }
  }
  if (!changed) return toast('Selected parts are not grouped')
  commitHistory()
  toast(`${changed} parts ungrouped`)
}

function setTransformMode(next) {
  if (mode !== 'build') return
  transform.setMode(next)
  $('#moveTool').classList.toggle('active', next === 'translate')
  $('#rotateTool').classList.toggle('active', next === 'rotate')
}

function reserveScale() {
  toast('Scale is reserved — brick dimensions must remain mechanically exact')
}

function toggleTransformSpace() {
  transformSpace = transformSpace === 'world' ? 'local' : 'world'
  transform.setSpace(transformSpace)
  $('#spaceState').textContent = transformSpace === 'world' ? 'World' : 'Local'
  $('#spaceBtn').classList.toggle('active', transformSpace === 'local')
  toast(`${transformSpace === 'world' ? 'World' : 'Local'} transform axes`)
}

function toggleConnectorSnap() {
  connectorSnapEnabled = !connectorSnapEnabled
  $('#connectorSnapBtn').classList.toggle('active', connectorSnapEnabled)
  refreshSnap()
  toast(`Connector snap ${connectorSnapEnabled ? 'on' : 'off'}`)
}

function toggleGridSnap() {
  gridSnapEnabled = !gridSnapEnabled
  $('#gridSnapBtn').classList.toggle('active', gridSnapEnabled)
  transform.setTranslationSnap(gridSnapEnabled ? 0.5 : null)
  transform.setRotationSnap(gridSnapEnabled ? Math.PI / 2 : null)
  toast(`Grid snap ${gridSnapEnabled ? 'on' : 'off'}`)
}

function toggleConnectorGuides() {
  connectorGuidesVisible = !connectorGuidesVisible
  connectorGuides()
  toast(`Connector points ${connectorGuidesVisible ? 'shown' : 'hidden'}`)
}

function toggleConnectionGraph() {
  connectionVisualsVisible = !connectionVisualsVisible
  updateConnectionVisuals()
  toast(`Connection graph ${connectionVisualsVisible ? 'shown' : 'hidden'}`)
}

function resetSelectedRotation() {
  if (!selectedObjects.size || mode !== 'build') return
  detachSelectionConnections(true)
  for (const object of selectedObjects) object.rotation.set(0, 0, 0)
  rebuildSelectionBoxes()
  connectorGuides()
  refreshSnap()
  updateConnectionVisuals()
  updateInspector()
  commitHistory()
  toast('Rotation reset')
}

function resetSelectedPosition() {
  if (!selectedObjects.size || mode !== 'build') return
  detachSelectionConnections(true)
  const targets = activeSelection()
  const primary = selected ?? targets[0]
  const primaryOffset = primary ? primary.position.clone() : new THREE.Vector3()

  for (const object of targets) {
    if (targets.length === 1) object.position.set(0, 0, 0)
    else object.position.sub(primaryOffset)
  }

  rebuildSelectionBoxes()
  connectorGuides()
  refreshSnap()
  updateConnectionVisuals()
  updateInspector()
  commitHistory()
  toast('Position reset')
}

function rotateSelectedQuarter(direction) {
  if (!selected || mode !== 'build') return
  detachPartConnections(selected, true)
  const axis = ['X', 'Y', 'Z'].includes(transform.axis) ? transform.axis.toLowerCase() : 'y'
  selected.rotation[axis] += direction * Math.PI / 2
  if (gridSnapEnabled) snapGrid()
  rebuildSelectionBoxes()
  connectorGuides()
  refreshSnap()
  updateConnectionVisuals()
  updateInspector()
  commitHistory()
  toast(`Rotated ${direction > 0 ? '+90°' : '−90°'} around ${axis.toUpperCase()}`)
}

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0 || mode !== 'build' || transform.axis) return
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(buildRoot.children, true)[0]
  select(hit ? hit.object.userData.instanceRoot : null, {
    additive: event.shiftKey,
    toggle: event.shiftKey,
  })
})

function renderCatalog() {
  const categories = ['All', ...new Set(PARTS.map(part => part.category))]
  $('#categoryTabs').innerHTML = categories
    .map(item => `<button class="category ${item === category ? 'active' : ''}" data-cat="${item}">${item}</button>`)
    .join('')

  $$('.category').forEach(button => {
    button.onclick = () => {
      category = button.dataset.cat || 'All'
      renderCatalog()
    }
  })

  const query = $('#partSearch').value.trim().toLowerCase()
  const list = PARTS.filter(part =>
    (category === 'All' || part.category === category) &&
    (!query || `${part.name} ${part.description}`.toLowerCase().includes(query))
  )

  $('#partCount').textContent = list.length
  $('#partsList').innerHTML = list.length
    ? list.map(part => `
      <button class="part-card" data-part="${part.id}">
        <span class="part-icon">${part.icon}</span>
        <span><strong>${part.name}</strong><small>${part.description}</small></span>
        <span class="plus"><i data-lucide="plus"></i></span>
      </button>
    `).join('')
    : '<div class="no-results">No matching parts</div>'

  $$('.part-card').forEach(button => button.onclick = () => addPart(button.dataset.part))
  renderIcons()
}

function connectionsForSelection() {
  const ids = new Set(activeSelection().map(object => object.userData.instanceId))
  return connections.filter(connection => ids.has(connection.a.instanceId) || ids.has(connection.b.instanceId))
}

function updateInspector() {
  $('#emptyInspector').classList.toggle('hidden', Boolean(selected))
  $('#inspector').classList.toggle('hidden', !selected)
  if (!selected) return

  const def = findPart(selected.userData.partId)
  const partConnections = connectionsForPart(connections, selected.userData.instanceId)
  const usedConnectors = (def?.connectors ?? []).filter(connector => !connectorAvailable(selected, connector)).length
  const selectedExtra = Math.max(0, selectedObjects.size - 1)

  $('#selectedName').textContent = def?.name ?? 'Unknown part'
  $('#selectedId').textContent = `${selected.userData.instanceId.slice(0, 8)}${selectedExtra ? ` · +${selectedExtra} selected` : ''}`
  $('#selectedIcon').textContent = def?.icon ?? '◇'
  $('#connectorState').textContent = `${usedConnectors} / ${def?.connectors?.length ?? 0}`
  $('#connectionState').textContent = String(partConnections.length)
  $('#disconnectBtn').disabled = connectionsForSelection().length === 0

  $('#connectionsList').innerHTML = partConnections.length
    ? partConnections.map(connection => {
        const other = connection.a.instanceId === selected.userData.instanceId ? connection.b : connection.a
        const otherObject = objectByInstanceId(other.instanceId)
        const otherDef = findPart(otherObject?.userData.partId)
        return `<div class="connection-chip"><span>${connection.kind}</span><b>${otherDef?.name ?? 'Part'} · ${other.connectorType}</b></div>`
      }).join('')
    : '<div class="connection-empty">No graph links</div>'

  const axes = ['x', 'y', 'z']
  $('#positionFields').innerHTML = axes
    .map(axis => `<label><span>${axis.toUpperCase()}</span><input data-pos="${axis}" value="${selected.position[axis].toFixed(2)}"></label>`)
    .join('')
  $('#rotationFields').innerHTML = axes
    .map(axis => `<label><span>${axis.toUpperCase()}</span><input data-rot="${axis}" value="${Math.round(THREE.MathUtils.radToDeg(selected.rotation[axis]))}°"></label>`)
    .join('')

  $$('[data-pos]').forEach(input => {
    input.onchange = () => {
      if (!selected) return
      detachPartConnections(selected, true)
      const n = Number(input.value)
      if (Number.isFinite(n)) selected.position[input.dataset.pos] = n
      snapGrid()
      rebuildSelectionBoxes()
      connectorGuides()
      refreshSnap()
      updateConnectionVisuals()
      updateInspector()
      commitHistory()
    }
  })

  $$('[data-rot]').forEach(input => {
    input.onchange = () => {
      if (!selected) return
      detachPartConnections(selected, true)
      const n = Number(input.value.replace('°', ''))
      if (Number.isFinite(n)) selected.rotation[input.dataset.rot] = THREE.MathUtils.degToRad(n)
      snapGrid()
      rebuildSelectionBoxes()
      connectorGuides()
      refreshSnap()
      updateConnectionVisuals()
      updateInspector()
      commitHistory()
    }
  })

  $('#colorInput').value = `#${Number(selected.userData.color).toString(16).padStart(6, '0')}`
}

function setPartColor(hex, commit = false) {
  if (!selectedObjects.size || mode !== 'build') return
  const color = Number.parseInt(hex.slice(1), 16)

  for (const object of selectedObjects) {
    object.userData.color = color
    object.traverse(child => {
      if (!child.isMesh || !child.material) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      for (const material of materials) {
        if (material.color && material.color.getHex() !== 0x222426 && material.color.getHex() !== 0x17191b) {
          material.color.setHex(color)
        }
      }
    })
  }

  if (commit) commitHistory()
  else saveLocal()
}

function setSimPlayButton(running) {
  $('#simPlayPause').innerHTML = running
    ? '<i data-lucide="pause"></i><span>Pause</span>'
    : '<i data-lucide="play"></i><span>Play</span>'
  renderIcons()
}

async function startSimulation({ preserveStartState = false } = {}) {
  if (!preserveStartState || !simulationStartState) simulationStartState = cloneState(projectState())
  const generation = ++simulationGeneration
  physicsSession?.dispose()
  physicsSession = null

  $('#simControls').classList.remove('hidden')
  $('#snapToolbar').classList.add('hidden')
  $('#simPlayPause').disabled = true
  $('#simReset').disabled = true
  $('#simState').textContent = 'Loading Rapier…'
  $('#statusText').textContent = `SIMULATE · loading physics · ${connections.length} graph links`

  try {
    const session = await PhysicsSession.create([...buildRoot.children], cloneState(connections))
    if (generation !== simulationGeneration || mode !== 'simulate') {
      session.dispose()
      return
    }

    physicsSession = session
    physicsSession.setRunning(true)
    setSimPlayButton(true)
    $('#simPlayPause').disabled = false
    $('#simReset').disabled = false

    const stats = session.stats
    $('#simState').textContent = `${stats.bodies} bodies · ${stats.joints} joints${stats.failedJoints ? ` · ${stats.failedJoints} skipped` : ''}`
    $('#statusText').textContent = `SIMULATE · gravity on · ${stats.bodies} bodies · ${stats.joints} joints`
    toast('Physics simulation started')
  } catch (error) {
    console.error('Could not start Rapier simulation', error)
    if (generation !== simulationGeneration) return
    $('#simState').textContent = 'Physics failed to load'
    $('#statusText').textContent = 'SIMULATE · physics unavailable'
    $('#simReset').disabled = false
    toast('Physics module could not be loaded')
  }
}

function stopSimulation({ restore = true } = {}) {
  simulationGeneration += 1
  physicsSession?.dispose()
  physicsSession = null
  $('#simControls').classList.add('hidden')
  $('#snapToolbar').classList.remove('hidden')

  if (restore && simulationStartState) applyProject(simulationStartState, { persist: false })
}

function toggleSimulationRunning() {
  if (!physicsSession) return
  physicsSession.setRunning(!physicsSession.running)
  setSimPlayButton(physicsSession.running)
  $('#statusText').textContent = physicsSession.running
    ? `SIMULATE · running · ${physicsSession.stats.joints} joints`
    : 'SIMULATE · paused'
}

function resetSimulation() {
  if (!simulationStartState) return
  stopSimulation({ restore: true })
  mode = 'simulate'
  startSimulation({ preserveStartState: true })
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
  if (!next || next === mode) return
  const previousMode = mode

  if (previousMode === 'simulate') stopSimulation({ restore: true })

  mode = next
  $$('.mode').forEach(button => button.classList.toggle('active', button.dataset.mode === next))
  $('.viewport-toolbar').classList.toggle('disabled', next !== 'build')
  $('#snapToolbar').classList.toggle('hidden', next !== 'build')
  testRoot.clear()
  connectorRoot.clear()
  connectionRoot.clear()
  snapMarker.visible = false

  if (next === 'build') {
    if (selected) transform.attach(selected)
    rebuildSelectionBoxes()
    connectorGuides()
    refreshSnap()
    updateConnectionVisuals()
    updateProjectStats()
  } else if (next === 'simulate') {
    select(null)
    simulationStartState = cloneState(projectState())
    startSimulation({ preserveStartState: true })
  } else {
    $('#statusText').textContent = 'TEST LAB · Prototype obstacle course'
    select(null)
    buildTestCourse()
  }
}

function toggleBuildSimulate() {
  setMode(mode === 'simulate' ? 'build' : 'simulate')
}

function loadLocal() {
  try {
    const rawV2 = localStorage.getItem('bricklab.project.v2')
    const rawV1 = localStorage.getItem('bricklab.project.v1')
    const raw = rawV2 || rawV1
    if (raw) {
      applyProject(JSON.parse(raw), { reset: true })
      return
    }
  } catch (error) {
    console.warn('Could not restore project', error)
  }
  resetHistory()
}

function exportProject() {
  const blob = new Blob([JSON.stringify(serializeProject(), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bricklab'}.bricklab`
  a.click()
  URL.revokeObjectURL(a.href)
  toast('Project exported with connection graph')
}

function newProject() {
  if (mode === 'simulate') setMode('build')
  select(null)
  buildRoot.clear()
  connections = []
  projectName = 'Untitled Build'
  $('#projectName').textContent = projectName
  updateConnectionVisuals()
  updateProjectStats()
  resetHistory()
  toast('New build')
}

function openShortcuts() {
  $('#shortcutsModal').classList.remove('hidden')
}

function closeShortcuts() {
  $('#shortcutsModal').classList.add('hidden')
}

function focusBox(box) {
  if (!box || box.isEmpty()) return
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const radius = Math.max(size.length() * 0.55, 1.4)
  const direction = camera.position.clone().sub(orbit.target)
  if (direction.lengthSq() < 0.01) direction.set(1, 0.7, 1)
  direction.normalize()
  orbit.target.copy(center)

  camera.position.copy(center).add(direction.multiplyScalar(Math.max(radius * 2.2, 4)))
  if (camera.isOrthographicCamera) {
    camera.zoom = Math.max(0.25, 8 / Math.max(radius, 1))
    camera.updateProjectionMatrix()
  }
  orbit.update()
}

function focusSelected() {
  if (!selectedObjects.size) return toast('Select a part first')
  const box = new THREE.Box3()
  for (const object of selectedObjects) box.expandByObject(object)
  focusBox(box)
}

function frameAll() {
  if (!buildRoot.children.length) return
  focusBox(new THREE.Box3().setFromObject(buildRoot))
}

function setAxisView(axis) {
  const center = orbit.target.clone()
  const distance = Math.max(camera.position.distanceTo(center), 10)
  const positions = {
    front: new THREE.Vector3(0, 0, distance),
    side: new THREE.Vector3(distance, 0, 0),
    top: new THREE.Vector3(0, distance, 0.001),
  }
  camera.position.copy(center).add(positions[axis])
  camera.up.set(0, 1, 0)
  if (axis === 'top') camera.up.set(0, 0, -1)
  camera.lookAt(center)
  orbit.update()
}

function syncCameraProjection() {
  const { clientWidth, clientHeight } = viewport
  if (!clientWidth || !clientHeight) return
  const aspect = clientWidth / clientHeight

  perspectiveCamera.aspect = aspect
  perspectiveCamera.updateProjectionMatrix()

  const span = 10
  orthographicCamera.left = -span * aspect
  orthographicCamera.right = span * aspect
  orthographicCamera.top = span
  orthographicCamera.bottom = -span
  orthographicCamera.updateProjectionMatrix()
}

function toggleProjection() {
  const previous = camera
  isOrthographic = !isOrthographic
  camera = isOrthographic ? orthographicCamera : perspectiveCamera
  camera.position.copy(previous.position)
  camera.quaternion.copy(previous.quaternion)
  camera.up.copy(previous.up)

  if (camera.isOrthographicCamera) {
    camera.zoom = 1
    camera.updateProjectionMatrix()
  }

  orbit.object = camera
  transform.camera = camera
  syncCameraProjection()
  orbit.update()
  toast(isOrthographic ? 'Orthographic camera' : 'Perspective camera')
}

function showMechanicsProperties() {
  if (!selected) return toast('Select a part first')
  const section = $('#mechanicsSection')
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  section.classList.remove('pulse')
  void section.offsetWidth
  section.classList.add('pulse')
}

$('#partSearch').addEventListener('input', renderCatalog)
$('#moveTool').onclick = () => setTransformMode('translate')
$('#rotateTool').onclick = () => setTransformMode('rotate')
$('#scaleTool').onclick = reserveScale
$('#undoBtn').onclick = undo
$('#redoBtn').onclick = redo
$('#duplicateBtn').onclick = duplicateSelected
$('#deleteBtn').onclick = removeSelected
$('#disconnectBtn').onclick = disconnectSelected
$('#connectorSnapBtn').onclick = toggleConnectorSnap
$('#gridSnapBtn').onclick = toggleGridSnap
$('#spaceBtn').onclick = toggleTransformSpace
$('#simPlayPause').onclick = toggleSimulationRunning
$('#simReset').onclick = resetSimulation
$('#saveBtn').onclick = () => { saveLocal(); toast('Saved in this browser') }
$('#exportBtn').onclick = exportProject
$('#newBtn').onclick = newProject
$('#shortcutsBtn').onclick = openShortcuts
$('#closeShortcutsBtn').onclick = closeShortcuts
$('#shortcutsModal').addEventListener('pointerdown', event => {
  if (event.target === $('#shortcutsModal')) closeShortcuts()
})
$('#colorInput').addEventListener('input', event => setPartColor(event.target.value, false))
$('#colorInput').addEventListener('change', event => setPartColor(event.target.value, true))
$('#importBtn').onclick = () => $('#importFile').click()
$('#importFile').addEventListener('change', async event => {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    applyProject(JSON.parse(await file.text()), { reset: true })
    toast('Project imported')
  } catch (error) {
    console.error(error)
    toast('Could not import project')
  }
  event.target.value = ''
})
$$('.mode').forEach(button => button.onclick = () => setMode(button.dataset.mode))

function isTypingTarget(target) {
  return target instanceof HTMLElement && (
    /INPUT|TEXTAREA|SELECT/.test(target.tagName) ||
    target.isContentEditable
  )
}

window.addEventListener('keydown', event => {
  if (isTypingTarget(event.target)) return

  const code = event.code
  const mod = event.ctrlKey || event.metaKey
  const shift = event.shiftKey
  const alt = event.altKey

  if (!$('#shortcutsModal').classList.contains('hidden')) {
    if (code === 'Escape' || (code === 'Slash' && shift)) {
      event.preventDefault()
      closeShortcuts()
    }
    return
  }

  // Physical key codes keep BrickLab shortcuts working on Cyrillic/Latvian layouts.
  if (code === 'Slash' && shift) {
    event.preventDefault()
    openShortcuts()
    return
  }

  if (mod && code === 'KeyS' && shift) {
    event.preventDefault()
    exportProject()
    return
  }
  if (mod && code === 'KeyS') {
    event.preventDefault()
    saveLocal()
    toast('Saved in this browser')
    return
  }
  if (mod && code === 'KeyO') {
    event.preventDefault()
    $('#importBtn').click()
    return
  }
  if (mod && code === 'KeyN') {
    event.preventDefault()
    newProject()
    return
  }
  if (mod && code === 'KeyD') {
    event.preventDefault()
    duplicateSelected()
    return
  }
  if (mod && code === 'KeyA') {
    event.preventDefault()
    selectAll()
    return
  }
  if (mod && code === 'KeyG' && shift) {
    event.preventDefault()
    ungroupSelected()
    return
  }
  if (mod && code === 'KeyG') {
    event.preventDefault()
    groupSelected()
    return
  }
  if (mod && code === 'KeyZ' && !shift) {
    event.preventDefault()
    undo()
    return
  }
  if (mod && ((code === 'KeyZ' && shift) || code === 'KeyY')) {
    event.preventDefault()
    redo()
    return
  }

  if (alt && code === 'KeyR') {
    event.preventDefault()
    resetSelectedRotation()
    return
  }
  if (alt && code === 'KeyG') {
    event.preventDefault()
    resetSelectedPosition()
    return
  }
  if (shift && code === 'KeyS') {
    event.preventDefault()
    toggleConnectorSnap()
    return
  }
  if (shift && code === 'KeyG') {
    event.preventDefault()
    toggleGridSnap()
    return
  }
  if (shift && code === 'Space') {
    event.preventDefault()
    if (mode === 'simulate') resetSimulation()
    return
  }

  if (code === 'Tab') {
    event.preventDefault()
    toggleBuildSimulate()
    return
  }
  if (code === 'Space') {
    event.preventDefault()
    if (mode === 'simulate') toggleSimulationRunning()
    return
  }
  if (code === 'Delete' || code === 'Backspace' || code === 'KeyX') {
    event.preventDefault()
    removeSelected()
    return
  }
  if (code === 'Escape') {
    select(null)
    return
  }
  if (code === 'Home') {
    event.preventDefault()
    frameAll()
    return
  }
  if (code === 'BracketLeft') {
    event.preventDefault()
    rotateSelectedQuarter(-1)
    return
  }
  if (code === 'BracketRight') {
    event.preventDefault()
    rotateSelectedQuarter(1)
    return
  }

  if (code === 'KeyM') setTransformMode('translate')
  else if (code === 'KeyR') setTransformMode('rotate')
  else if (code === 'KeyS') reserveScale()
  else if (code === 'KeyG') setTransformMode('translate')
  else if (code === 'KeyF') focusSelected()
  else if (code === 'KeyQ') toggleTransformSpace()
  else if (code === 'KeyC') toggleConnectorGuides()
  else if (code === 'KeyL') toggleConnectionGraph()
  else if (code === 'KeyD') disconnectSelected()
  else if (code === 'KeyI') showMechanicsProperties()
  else if (code === 'Digit1') setAxisView('front')
  else if (code === 'Digit2') setAxisView('side')
  else if (code === 'Digit3') setAxisView('top')
  else if (code === 'Digit5') toggleProjection()
})

function resize() {
  const { clientWidth, clientHeight } = viewport
  if (!clientWidth || !clientHeight) return
  syncCameraProjection()
  renderer.setSize(clientWidth, clientHeight, false)
}
new ResizeObserver(resize).observe(viewport)

function animate() {
  if (mode === 'simulate' && physicsSession) physicsSession.step()
  orbit.update()
  for (const box of selectionBoxes.values()) box.update()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

renderCatalog()
loadLocal()
updateProjectStats()
updateHistoryButtons()
resize()
animate()
