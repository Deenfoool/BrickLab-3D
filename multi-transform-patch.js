import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { interactionGroupMembers, isEditorGroup } from './editor-groups-v1.js'

const states = new WeakMap()
const knownControls = []
const originalAttach = TransformControls.prototype.attach
const originalDetach = TransformControls.prototype.detach
const originalDispatchEvent = TransformControls.prototype.dispatchEvent

function stateFor(control) {
  let state = states.get(control)
  if (!state) {
    state = {
      control,
      primary: null,
      targets: [],
      proxy: null,
      multiActive: false,
      groupActive: false,
      dragging: false,
      proxyStart: new THREE.Matrix4(),
      starts: new Map(),
      scheduled: 0,
      syncing: false,
      groupBounds: new THREE.Box3(),
      groupOutline: null,
      hiddenHelpers: new Set(),
    }
    states.set(control, state)
    knownControls.push(control)
  }
  return state
}

function buildRootFor(object) {
  return object?.parent ?? null
}

function helperSelection(primary) {
  const buildRoot = buildRootFor(primary)
  const scene = buildRoot?.parent
  if (!buildRoot || !scene) return primary ? [primary] : []

  const selected = []
  for (const child of scene.children) {
    const target = child?.object
    if (!target || target.parent !== buildRoot || !target.userData?.instanceId) continue
    if (child.type !== 'BoxHelper' && !child.isBoxHelper) continue
    if (!selected.includes(target)) selected.push(target)
  }
  if (primary && primary.parent === buildRoot && !selected.includes(primary)) selected.push(primary)
  return selected
}

function selectedFromHelpers(primary) {
  const selected = helperSelection(primary)
  if (selected.length >= 2) return selected
  const grouped = interactionGroupMembers(primary)
  return grouped.length >= 2 ? grouped : selected
}

function commonBounds(targets, box = new THREE.Box3()) {
  box.makeEmpty()
  const partBox = new THREE.Box3()
  for (const object of targets) {
    object.updateWorldMatrix(true, false)
    partBox.setFromObject(object)
    if (!partBox.isEmpty()) box.union(partBox)
  }
  return box
}

function commonCenter(targets) {
  const box = commonBounds(targets)
  if (!box.isEmpty()) return box.getCenter(new THREE.Vector3())
  const center = new THREE.Vector3()
  if (!targets.length) return center
  for (const object of targets) center.add(object.getWorldPosition(new THREE.Vector3()))
  return center.multiplyScalar(1 / targets.length)
}

function restoreMemberHelpers(state) {
  for (const helper of state.hiddenHelpers) helper.visible = true
  state.hiddenHelpers.clear()
}

function removeGroupOutline(state) {
  restoreMemberHelpers(state)
  if (state.groupOutline?.parent) state.groupOutline.parent.remove(state.groupOutline)
  state.groupOutline?.geometry?.dispose?.()
  state.groupOutline?.material?.dispose?.()
  state.groupOutline = null
}

function updateGroupOutline(state) {
  if (!state.groupActive || !state.targets.length) return
  const scene = state.primary?.parent?.parent
  if (!scene) return

  commonBounds(state.targets, state.groupBounds)
  if (!state.groupOutline) {
    state.groupOutline = new THREE.Box3Helper(state.groupBounds, 0x74e6a6)
    state.groupOutline.name = '__bricklabEditorGroupOutline'
    state.groupOutline.userData.bricklabEditorGroupOutline = true
    state.groupOutline.raycast = () => {}
    scene.add(state.groupOutline)
  }
  state.groupOutline.box = state.groupBounds
  state.groupOutline.updateMatrixWorld(true)

  restoreMemberHelpers(state)
  for (const child of scene.children) {
    if ((child.type !== 'BoxHelper' && !child.isBoxHelper) || !state.targets.includes(child.object)) continue
    child.visible = false
    state.hiddenHelpers.add(child)
  }
}

function removeProxy(state) {
  removeGroupOutline(state)
  if (state.proxy?.parent) state.proxy.parent.remove(state.proxy)
  state.proxy = null
  state.multiActive = false
  state.groupActive = false
  state.targets = []
  state.starts.clear()
  state.dragging = false
  globalThis.__bricklabMultiTransformActive = false
}

function groupIsWholeSelection(primary, targets) {
  if (!isEditorGroup(primary) || targets.length < 2) return false
  const groupId = primary.userData.groupId
  const group = interactionGroupMembers(primary)
  if (group.length !== targets.length) return false
  return targets.every(object => object.userData.groupId === groupId && group.includes(object))
}

function setTextIfChanged(element, value) {
  if (element && element.textContent !== value) element.textContent = value
}

function setValueIfChanged(element, value) {
  if (element && element.value !== value) element.value = value
}

function decorateGroupInspector(state) {
  if (!state.groupActive || !state.proxy) return
  setTextIfChanged(document.querySelector('#selectedName'), `Group · ${state.targets.length} parts`)
  setTextIfChanged(document.querySelector('#selectedId'), `${String(state.primary?.userData?.groupId || '').slice(0, 8)} · grouped object`)
  setTextIfChanged(document.querySelector('#selectedIcon'), '▦')

  for (const input of document.querySelectorAll('[data-pos]')) {
    const axis = input.dataset.pos
    if (axis in state.proxy.position) setValueIfChanged(input, state.proxy.position[axis].toFixed(2))
  }
  for (const input of document.querySelectorAll('[data-rot]')) {
    const axis = input.dataset.rot
    if (axis in state.proxy.rotation) setValueIfChanged(input, `${Math.round(THREE.MathUtils.radToDeg(state.proxy.rotation[axis]))}°`)
  }

  const stats = document.querySelector('#projectStats')
  if (stats) {
    const next = stats.textContent.replace(/ · \d+ selected$/, ' · 1 group selected')
    setTextIfChanged(stats, next)
  }
}

function configureForSelection(control, expectedPrimary) {
  const state = stateFor(control)
  if (state.primary !== expectedPrimary || !expectedPrimary?.parent) return

  const targets = selectedFromHelpers(expectedPrimary)
  if (targets.length < 2) {
    removeProxy(state)
    originalAttach.call(control, expectedPrimary)
    return
  }

  const scene = expectedPrimary.parent.parent
  if (!scene) return

  if (!state.proxy) {
    state.proxy = new THREE.Object3D()
    state.proxy.name = 'BrickLab Multi Selection Pivot'
    state.proxy.userData.bricklabMultiPivot = true
  }
  if (state.proxy.parent !== scene) scene.add(state.proxy)

  const centerWorld = commonCenter(targets)
  const centerLocal = scene.worldToLocal(centerWorld.clone())
  state.proxy.position.copy(centerLocal)

  const primaryWorldQuaternion = expectedPrimary.getWorldQuaternion(new THREE.Quaternion())
  const sceneWorldQuaternion = scene.getWorldQuaternion(new THREE.Quaternion())
  state.proxy.quaternion.copy(sceneWorldQuaternion.invert().multiply(primaryWorldQuaternion))
  state.proxy.scale.set(1, 1, 1)
  state.proxy.updateMatrixWorld(true)

  state.targets = targets
  state.multiActive = true
  state.groupActive = groupIsWholeSelection(expectedPrimary, targets)
  globalThis.__bricklabMultiTransformActive = true
  originalAttach.call(control, state.proxy)
  if (state.groupActive) {
    updateGroupOutline(state)
    queueMicrotask(() => decorateGroupInspector(state))
  } else {
    removeGroupOutline(state)
  }
}

function scheduleSelectionSync(control, primary) {
  const state = stateFor(control)
  state.scheduled += 1
  const ticket = state.scheduled
  queueMicrotask(() => {
    if (state.scheduled !== ticket) return
    configureForSelection(control, primary)
  })
}

function beginMultiDrag(control, state) {
  if (!state.multiActive || control.object !== state.proxy) return

  state.targets = selectedFromHelpers(state.primary)
  if (state.targets.length < 2) return

  state.dragging = true
  state.starts.clear()
  state.proxy.updateMatrixWorld(true)
  state.proxyStart.copy(state.proxy.matrixWorld)

  for (const object of state.targets) {
    object.updateWorldMatrix(true, false)
    state.starts.set(object, object.matrixWorld.clone())
  }
}

function applyWorldMatrix(object, worldMatrix) {
  const parentInverse = object.parent
    ? object.parent.matrixWorld.clone().invert()
    : new THREE.Matrix4()
  const localMatrix = parentInverse.multiply(worldMatrix)
  localMatrix.decompose(object.position, object.quaternion, object.scale)
  object.updateMatrixWorld(true)
}

function applyMultiDelta(control, state) {
  if (!state.multiActive || !state.dragging || state.syncing || control.object !== state.proxy) return
  if (!state.starts.size) beginMultiDrag(control, state)
  if (!state.starts.size) return

  state.proxy.updateMatrixWorld(true)
  const delta = state.proxy.matrixWorld.clone().multiply(state.proxyStart.clone().invert())

  state.syncing = true
  try {
    for (const object of state.targets) {
      const start = state.starts.get(object)
      if (!start || !object.parent) continue
      applyWorldMatrix(object, delta.clone().multiply(start))
    }
  } finally {
    state.syncing = false
  }
  for (const helper of state.hiddenHelpers) helper.update?.()
  updateGroupOutline(state)
}

function gridSnapEnabled() {
  return document.querySelector('#gridSnapBtn')?.classList.contains('active') !== false
}

function syncProxyFromMembers(state) {
  const primary = state.primary
  const scene = primary?.parent?.parent
  if (!state.proxy || !primary || !scene) return
  const centerWorld = commonCenter(state.targets)
  state.proxy.position.copy(scene.worldToLocal(centerWorld.clone()))
  const primaryWorldQuaternion = primary.getWorldQuaternion(new THREE.Quaternion())
  const sceneWorldQuaternion = scene.getWorldQuaternion(new THREE.Quaternion())
  state.proxy.quaternion.copy(sceneWorldQuaternion.invert().multiply(primaryWorldQuaternion))
  state.proxy.scale.set(1,1,1)
  state.proxy.updateMatrixWorld(true)
}

function snapGroupPose(state) {
  const primary = state.primary
  if (!primary || !state.targets.length || !primary.parent || !state.groupActive || !gridSnapEnabled()) return

  primary.updateWorldMatrix(true, false)
  const oldPrimaryWorld = primary.matrixWorld.clone()
  const position = primary.position.clone()
  position.set(
    Math.round(position.x * 2) / 2,
    Math.max(0, Math.round(position.y * 2) / 2),
    Math.round(position.z * 2) / 2,
  )
  const q = Math.PI / 2
  const rotation = new THREE.Euler(
    Math.round(primary.rotation.x / q) * q,
    Math.round(primary.rotation.y / q) * q,
    Math.round(primary.rotation.z / q) * q,
    primary.rotation.order,
  )
  const desiredLocal = new THREE.Matrix4().compose(
    position,
    new THREE.Quaternion().setFromEuler(rotation),
    primary.scale.clone(),
  )
  primary.parent.updateWorldMatrix(true, false)
  const desiredWorld = primary.parent.matrixWorld.clone().multiply(desiredLocal)
  const delta = desiredWorld.clone().multiply(oldPrimaryWorld.clone().invert())

  for (const object of state.targets) {
    object.updateWorldMatrix(true, false)
    applyWorldMatrix(object, delta.clone().multiply(object.matrixWorld))
  }

  syncProxyFromMembers(state)
  for (const helper of state.hiddenHelpers) helper.update?.()
  updateGroupOutline(state)
}

function commitThroughExistingEditor() {
  const color = document.querySelector('#colorInput')
  if (!color) return
  color.dispatchEvent(new Event('change', { bubbles:true }))
}

function notifyEditorTransform(control, state) {
  originalDispatchEvent.call(control, { type:'objectChange' })
  queueMicrotask(() => {
    updateGroupOutline(state)
    decorateGroupInspector(state)
    commitThroughExistingEditor()
  })
}

function editGroupProxy(control, state, mutate) {
  if (!state.groupActive || !state.proxy || state.targets.length < 2) return false
  beginMultiDrag(control, state)
  mutate(state.proxy)
  state.proxy.updateMatrixWorld(true)
  applyMultiDelta(control, state)
  state.dragging = false
  state.starts.clear()
  snapGroupPose(state)
  notifyEditorTransform(control, state)
  return true
}

function activeGroupState() {
  for (const control of knownControls) {
    const state = states.get(control)
    if (state?.groupActive && state.primary && control.object === state.proxy) return { control, state }
  }
  return null
}

TransformControls.prototype.attach = function bricklabMultiAttach(object) {
  const state = stateFor(this)
  if (object?.userData?.bricklabMultiPivot) return originalAttach.call(this, object)

  state.primary = object ?? null
  removeProxy(state)
  const result = originalAttach.call(this, object)
  if (object) scheduleSelectionSync(this, object)
  return result
}

TransformControls.prototype.detach = function bricklabMultiDetach() {
  const state = stateFor(this)
  state.primary = null
  state.scheduled += 1
  removeProxy(state)
  return originalDetach.call(this)
}

TransformControls.prototype.dispatchEvent = function bricklabMultiDispatch(event) {
  const state = stateFor(this)

  if (state.multiActive && this.object === state.proxy) {
    if (event?.type === 'dragging-changed') {
      if (event.value) beginMultiDrag(this, state)
      else state.dragging = false
    } else if (event?.type === 'objectChange') {
      applyMultiDelta(this, state)
      return
    } else if (event?.type === 'mouseUp') {
      applyMultiDelta(this, state)
      snapGroupPose(state)
      state.dragging = false
      state.starts.clear()
      updateGroupOutline(state)
      queueMicrotask(() => decorateGroupInspector(state))
    }
  }

  return originalDispatchEvent.call(this, event)
}

// Numeric inspector edits are group transforms too. Intercept them before app.js' old
// single-part handler and edit the same proxy used by TransformControls.
document.addEventListener('change', event => {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || (!input.dataset.pos && !input.dataset.rot)) return
  const active = activeGroupState()
  if (!active) return
  const { control, state } = active
  const raw = Number(String(input.value).replace('°', ''))
  if (!Number.isFinite(raw)) return

  event.preventDefault()
  event.stopImmediatePropagation()
  editGroupProxy(control, state, proxy => {
    if (input.dataset.pos) proxy.position[input.dataset.pos] = raw
    else proxy.rotation[input.dataset.rot] = THREE.MathUtils.degToRad(raw)
  })
}, true)

// Group/Ungroup changes groupId inside app.js. Re-evaluate the current selection in a
// microtask after its shortcut handler has completed so the pivot/outline switches mode.
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyG') {
    queueMicrotask(() => {
      for (const control of knownControls) {
        const state = states.get(control)
        if (state?.primary) configureForSelection(control, state.primary)
      }
    })
  }
}, true)

function keyboardTargetIsEditable(event) {
  const target = event.target
  return target instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable)
}

// Keyboard ±90° and reset shortcuts operate on the shared group pivot. The old app
// handlers are stopped only for an actual group, so normal multi-select behavior stays intact.
window.addEventListener('keydown', event => {
  const active = activeGroupState()
  if (!active || keyboardTargetIsEditable(event)) return

  if (['BracketLeft','BracketRight'].includes(event.code) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    event.stopImmediatePropagation()
    const direction = event.code === 'BracketRight' ? 1 : -1
    const axis = ['X','Y','Z'].includes(active.control.axis) ? active.control.axis.toLowerCase() : 'y'
    editGroupProxy(active.control, active.state, proxy => {
      proxy.rotation[axis] += direction * Math.PI / 2
    })
    return
  }

  if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === 'KeyR' || event.code === 'KeyG')) {
    event.preventDefault()
    event.stopImmediatePropagation()
    editGroupProxy(active.control, active.state, proxy => {
      if (event.code === 'KeyR') proxy.rotation.set(0,0,0)
      else proxy.position.set(0,0,0)
    })
  }
}, true)

const inspectorObserver = new MutationObserver(() => {
  const active = activeGroupState()
  if (active) queueMicrotask(() => decorateGroupInspector(active.state))
})
const inspector = document.querySelector('#inspector')
if (inspector) inspectorObserver.observe(inspector, { childList:true, subtree:true })
else window.addEventListener('bricklab:editorgroupselection', () => {
  const value = document.querySelector('#inspector')
  if (value) inspectorObserver.observe(value, { childList:true, subtree:true })
}, { once:true })

window.addEventListener('beforeunload', () => {
  globalThis.__bricklabMultiTransformActive = false
})
