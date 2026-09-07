import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'

const states = new WeakMap()
const originalAttach = TransformControls.prototype.attach
const originalDetach = TransformControls.prototype.detach
const originalDispatchEvent = TransformControls.prototype.dispatchEvent

function stateFor(control) {
  let state = states.get(control)
  if (!state) {
    state = {
      primary: null,
      targets: [],
      proxy: null,
      multiActive: false,
      dragging: false,
      proxyStart: new THREE.Matrix4(),
      starts: new Map(),
      scheduled: 0,
      syncing: false,
    }
    states.set(control, state)
  }
  return state
}

function sceneFor(object) {
  let root = object
  while (root?.parent) root = root.parent
  return root?.isScene ? root : object?.parent?.parent ?? null
}

function buildRootFor(object) {
  return object?.parent ?? null
}

function selectedFromHelpers(primary) {
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

function updateSelectionHelpers(primary) {
  const scene = primary?.parent?.parent
  if (!scene) return
  for (const child of scene.children) {
    if ((child.type === 'BoxHelper' || child.isBoxHelper) && child.object?.parent === primary.parent) {
      child.update?.()
    }
  }
}

function commonCenter(targets) {
  const box = new THREE.Box3()
  const partBox = new THREE.Box3()
  let hasBounds = false

  for (const object of targets) {
    object.updateWorldMatrix(true, false)
    partBox.setFromObject(object)
    if (partBox.isEmpty()) continue
    if (!hasBounds) {
      box.copy(partBox)
      hasBounds = true
    } else {
      box.union(partBox)
    }
  }

  if (hasBounds) return box.getCenter(new THREE.Vector3())

  const center = new THREE.Vector3()
  if (!targets.length) return center
  for (const object of targets) center.add(object.getWorldPosition(new THREE.Vector3()))
  return center.multiplyScalar(1 / targets.length)
}

function removeProxy(state) {
  if (state.proxy?.parent) state.proxy.parent.remove(state.proxy)
  state.proxy = null
  state.multiActive = false
  state.targets = []
  state.starts.clear()
  state.dragging = false
  globalThis.__bricklabMultiTransformActive = false
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
  globalThis.__bricklabMultiTransformActive = true
  originalAttach.call(control, state.proxy)
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
    updateSelectionHelpers(state.primary)
  } finally {
    state.syncing = false
  }
}

function snapGroupTranslation(state) {
  const primary = state.primary
  if (!primary || !state.targets.length || !primary.parent) return

  const snapped = primary.position.clone()
  snapped.set(
    Math.round(snapped.x * 2) / 2,
    Math.max(0, Math.round(snapped.y * 2) / 2),
    Math.round(snapped.z * 2) / 2,
  )
  const delta = snapped.sub(primary.position)
  if (delta.lengthSq() < 1e-10) return

  for (const object of state.targets) {
    if (object.parent !== primary.parent) continue
    object.position.add(delta)
    object.updateMatrixWorld(true)
  }
  if (state.proxy?.parent === primary.parent?.parent) {
    const worldDelta = delta.clone().applyQuaternion(primary.parent.getWorldQuaternion(new THREE.Quaternion()))
    state.proxy.position.add(worldDelta)
    state.proxy.updateMatrixWorld(true)
  }
  updateSelectionHelpers(primary)
}

TransformControls.prototype.attach = function bricklabMultiAttach(object) {
  const state = stateFor(this)

  if (object?.userData?.bricklabMultiPivot) {
    return originalAttach.call(this, object)
  }

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
      // The editor's single-object objectChange handler disconnects only the active
      // part. Suppress that handler while the shared pivot owns the transform.
      return
    } else if (event?.type === 'mouseUp') {
      applyMultiDelta(this, state)
      snapGroupTranslation(state)
      state.dragging = false
      state.starts.clear()
    }
  }

  return originalDispatchEvent.call(this, event)
}

window.addEventListener('beforeunload', () => {
  globalThis.__bricklabMultiTransformActive = false
})
