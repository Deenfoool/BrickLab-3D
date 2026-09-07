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
    <div class="viewport-toolbar">
      <button id="moveTool" class="tool active">↔ <span>Move</span></button>
      <button id="rotateTool" class="tool">↻ <span>Rotate</span></button>
      <span class="divider"></span>
      <button id="undoBtn" class="tool" title="Undo (Ctrl+Z)">↶ <span>Undo</span></button>
      <button id="redoBtn" class="tool" title="Redo (Ctrl+Shift+Z)">↷ <span>Redo</span></button>
      <span class="divider"></span>
      <button id="duplicateBtn" class="tool">⧉ <span>Duplicate</span></button>
      <button id="deleteBtn" class="tool danger">⌫ <span>Delete</span></button>
    </div>
    <div id="simControls" class="sim-controls hidden">
      <button id="simPlayPause" class="ghost small">Pause</button>
      <button id="simReset" class="ghost small">Reset</button>
      <span id="simState">Physics idle</span>
    </div>
    <div class="scene-status"><span class="dot"></span><span id="statusText">BUILD MODE · Connector graph enabled</span></div>
    <div class="help">LMB select · RMB orbit · Wheel zoom · W move · E rotate · Ctrl+Z undo · Del remove</div><div id="toast" class="toast"></div>
  </main>
  <aside class="sidebar inspector-panel">
    <div class="panel-title">PROPERTIES</div>
    <div id="emptyInspector" class="empty-inspector"><div class="empty-icon">◇</div><strong>No part selected</strong><p>Select a part in the scene to inspect and edit it.</p></div>
    <div id="inspector" class="inspector hidden">
      <div class="selected-card"><div id="selectedIcon" class="selected-icon">▦</div><div><strong id="selectedName">Part</strong><small id="selectedId"></small></div></div>
      <section><h3>TRANSFORM</h3><div class="vector-grid" id="positionFields"></div></section>
      <section><h3>ROTATION</h3><div class="vector-grid" id="rotationFields"></div></section>
      <section><h3>APPEARANCE</h3><label class="color-row">Color <input id="colorInput" type="color" value="#d7263d" /></label></section>
      <section>
        <h3>MECHANICS</h3>
        <div class="stat-row"><span>Connectors used</span><b id="connectorState">0 / 0</b></div>
        <div class="stat-row"><span>Graph links</span><b id="connectionState">0</b></div>
        <div id="connectionsList" class="connections-list"></div>
        <button id="disconnectBtn" class="ghost small connection-action">Disconnect all</button>
      </section>
    </div>
    <div class="project-box"><div><small>PROJECT</small><strong id="projectName">Untitled Build</strong><span id="projectStats">0 parts · 0 links</span></div><button id="importBtn" class="ghost small">Import</button><input id="importFile" type="file" accept="application/json,.bricklab" hidden /></div>
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
const connectionRoot = new THREE.Group()
scene.add(buildRoot, testRoot, connectorRoot, connectionRoot)

const connectorGeometry = new THREE.SphereGeometry(0.09, 12, 12)
const freeConnectorMaterial = new THREE.MeshBasicMaterial({ color: 0x69a9ff, depthTest: false, transparent: true, opacity: 0.85 })
const occupiedConnectorMaterial = new THREE.MeshBasicMaterial({ color: 0xffb65c, depthTest: false, transparent: true, opacity: 0.95 })
const connectionMarkerGeometry = new THREE.SphereGeometry(0.135, 14, 14)
const connectionMarkerMaterial = new THREE.MeshBasicMaterial({ color: 0x74e6a6, depthTest: false })
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
let connections = []
let history = []
let historyIndex = -1
let toastTimer = 0
let isDragging = false
let detachedDuringDrag = false
let physicsSession = null
let simulationStartState = null
let simulationGeneration = 0

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

function clearSelectionBox() {
  if (!selectionBox) return
  scene.remove(selectionBox)
  selectionBox.geometry?.dispose?.()
  selectionBox.material?.dispose?.()
  selectionBox = null
}

function updateProjectStats() {
  $('#projectStats').textContent = `${buildRoot.children.length} parts · ${connections.length} links`
  if (mode === 'build') $('#statusText').textContent = `BUILD MODE · ${buildRoot.children.length} parts · ${connections.length} connections`
}

function updateConnectionVisuals() {
  connectionRoot.clear()
  if (mode !== 'build') return

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
  if (!selected || mode !== 'build') return

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
  snapCandidate = selected && mode === 'build'
    ? findSnapCandidate(selected, buildRoot.children, { isAvailable: connectorAvailable })
    : null
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

function attachSnapConnection(candidate) {
  if (!selected || !candidate) return null
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
  if (historyIndex <= 0) return
  historyIndex -= 1
  applyProject(history[historyIndex])
  updateHistoryButtons()
  toast('Undo')
}

function redo() {
  if (historyIndex >= history.length - 1) return
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
  selectionBox?.update()
  updateInspector()
  connectorGuides()
  refreshSnap()
})

transform.addEventListener('mouseUp', () => {
  snapGrid()
  refreshSnap()

  if (selected && snapCandidate) {
    orientForSnap(selected, snapCandidate)
    applySnap(selected, snapCandidate)
    const connection = attachSnapConnection(snapCandidate)
    if (connection) toast(`Connected ${connection.kind}: ${snapCandidate.source.type} → ${snapCandidate.target.type}`)
  }

  selectionBox?.update()
  updateInspector()
  connectorGuides()
  refreshSnap()
  updateConnectionVisuals()
  commitHistory()
  detachedDuringDrag = false
})

function addPart(partId) {
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
  if (!selected) return
  const object = selected
  detachPartConnections(object, true)
  buildRoot.remove(object)
  select(null)
  updateConnectionVisuals()
  updateProjectStats()
  commitHistory()
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
  updateProjectStats()
  commitHistory()
  toast('Part duplicated')
}

function disconnectSelected() {
  if (!selected) return
  const count = detachPartConnections(selected, true)
  if (!count) return
  updateInspector()
  refreshSnap()
  commitHistory()
  toast(`Disconnected ${count} link${count === 1 ? '' : 's'}`)
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
  const categories = ['All', ...new Set(PARTS.map(part => part.category))]
  $('#categoryTabs').innerHTML = categories.map(item => `<button class="category ${item === category ? 'active' : ''}" data-cat="${item}">${item}</button>`).join('')
  document.querySelectorAll('.category').forEach(button => {
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
  $('#partsList').innerHTML = list.map(part => `<button class="part-card" data-part="${part.id}"><span class="part-icon">${part.icon}</span><span><strong>${part.name}</strong><small>${part.description}</small></span><span class="plus">+</span></button>`).join('') || '<div class="no-results">No matching parts</div>'
  document.querySelectorAll('.part-card').forEach(button => button.onclick = () => addPart(button.dataset.part))
}

function updateInspector() {
  $('#emptyInspector').classList.toggle('hidden', Boolean(selected))
  $('#inspector').classList.toggle('hidden', !selected)
  if (!selected) return

  const def = findPart(selected.userData.partId)
  const partConnections = connectionsForPart(connections, selected.userData.instanceId)
  const usedConnectors = (def?.connectors ?? []).filter(connector => !connectorAvailable(selected, connector)).length

  $('#selectedName').textContent = def?.name ?? 'Unknown part'
  $('#selectedId').textContent = selected.userData.instanceId.slice(0, 8)
  $('#selectedIcon').textContent = def?.icon ?? '◇'
  $('#connectorState').textContent = `${usedConnectors} / ${def?.connectors?.length ?? 0}`
  $('#connectionState').textContent = String(partConnections.length)
  $('#disconnectBtn').disabled = partConnections.length === 0

  $('#connectionsList').innerHTML = partConnections.length
    ? partConnections.map(connection => {
        const other = connection.a.instanceId === selected.userData.instanceId ? connection.b : connection.a
        const otherObject = objectByInstanceId(other.instanceId)
        const otherDef = findPart(otherObject?.userData.partId)
        return `<div class="connection-chip"><span>${connection.kind}</span><b>${otherDef?.name ?? 'Part'} · ${other.connectorType}</b></div>`
      }).join('')
    : '<div class="connection-empty">No graph links</div>'

  const axes = ['x', 'y', 'z']
  $('#positionFields').innerHTML = axes.map(axis => `<label><span>${axis.toUpperCase()}</span><input data-pos="${axis}" value="${selected.position[axis].toFixed(2)}"></label>`).join('')
  $('#rotationFields').innerHTML = axes.map(axis => `<label><span>${axis.toUpperCase()}</span><input data-rot="${axis}" value="${Math.round(THREE.MathUtils.radToDeg(selected.rotation[axis]))}°"></label>`).join('')

  document.querySelectorAll('[data-pos]').forEach(input => {
    input.onchange = () => {
      if (!selected) return
      detachPartConnections(selected, true)
      const n = Number(input.value)
      if (Number.isFinite(n)) selected.position[input.dataset.pos] = n
      snapGrid()
      selectionBox?.update()
      connectorGuides()
      refreshSnap()
      updateConnectionVisuals()
      updateInspector()
      commitHistory()
    }
  })

  document.querySelectorAll('[data-rot]').forEach(input => {
    input.onchange = () => {
      if (!selected) return
      detachPartConnections(selected, true)
      const n = Number(input.value.replace('°', ''))
      if (Number.isFinite(n)) selected.rotation[input.dataset.rot] = THREE.MathUtils.degToRad(n)
      snapGrid()
      selectionBox?.update()
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
  if (!selected) return
  const color = Number.parseInt(hex.slice(1), 16)
  selected.userData.color = color
  selected.traverse(child => {
    if (!child.isMesh || !child.material) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (material.color && material.color.getHex() !== 0x222426 && material.color.getHex() !== 0x17191b) material.color.setHex(color)
    }
  })
  if (commit) commitHistory()
  else saveLocal()
}

async function startSimulation({ preserveStartState = false } = {}) {
  if (!preserveStartState || !simulationStartState) simulationStartState = cloneState(projectState())
  const generation = ++simulationGeneration
  physicsSession?.dispose()
  physicsSession = null

  $('#simControls').classList.remove('hidden')
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
    $('#simPlayPause').textContent = 'Pause'
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

  if (restore && simulationStartState) {
    applyProject(simulationStartState, { persist: false })
  }
}

function toggleSimulationRunning() {
  if (!physicsSession) return
  physicsSession.setRunning(!physicsSession.running)
  $('#simPlayPause').textContent = physicsSession.running ? 'Pause' : 'Play'
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

  if (previousMode === 'simulate') {
    stopSimulation({ restore: true })
  }

  mode = next
  document.querySelectorAll('.mode').forEach(button => button.classList.toggle('active', button.dataset.mode === next))
  $('.viewport-toolbar').classList.toggle('disabled', next !== 'build')
  testRoot.clear()
  connectorRoot.clear()
  connectionRoot.clear()
  snapMarker.visible = false

  if (next === 'build') {
    if (selected) transform.attach(selected)
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

$('#partSearch').addEventListener('input', renderCatalog)
$('#moveTool').onclick = () => setTransformMode('translate')
$('#rotateTool').onclick = () => setTransformMode('rotate')
$('#undoBtn').onclick = undo
$('#redoBtn').onclick = redo
$('#duplicateBtn').onclick = duplicateSelected
$('#deleteBtn').onclick = removeSelected
$('#disconnectBtn').onclick = disconnectSelected
$('#simPlayPause').onclick = toggleSimulationRunning
$('#simReset').onclick = resetSimulation
$('#saveBtn').onclick = () => { saveLocal(); toast('Saved in this browser') }
$('#exportBtn').onclick = exportProject
$('#newBtn').onclick = () => {
  select(null)
  buildRoot.clear()
  connections = []
  projectName = 'Untitled Build'
  $('#projectName').textContent = projectName
  updateConnectionVisuals()
  updateProjectStats()
  commitHistory()
  toast('New build')
}
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

document.querySelectorAll('.mode').forEach(button => button.onclick = () => setMode(button.dataset.mode))

window.addEventListener('keydown', event => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return

  const key = event.key.toLowerCase()
  if (key === 'w') setTransformMode('translate')
  if (key === 'e') setTransformMode('rotate')
  if (event.key === 'Delete' || event.key === 'Backspace') removeSelected()
  if (event.key === 'Escape') select(null)

  if ((event.ctrlKey || event.metaKey) && key === 'd') {
    event.preventDefault()
    duplicateSelected()
  }
  if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undo()
  }
  if ((event.ctrlKey || event.metaKey) && ((key === 'z' && event.shiftKey) || key === 'y')) {
    event.preventDefault()
    redo()
  }
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
  if (mode === 'simulate' && physicsSession) physicsSession.step()
  orbit.update()
  selectionBox?.update()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}

renderCatalog()
loadLocal()
updateProjectStats()
updateHistoryButtons()
resize()
animate()
