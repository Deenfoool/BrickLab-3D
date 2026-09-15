import * as THREE from 'three'
import { buildPhysicsPlanV4, drivetrainSemanticLinksV4 } from '../connectors-v4/physics-policy-v4.js'
import {
  KINEMATICS_SOLVER_VERSION,
  dynamicJointKind,
  jointControlAxes,
  solveShaftRatios,
  summarizePlanDof,
} from './solver-v1.js?v=kinematics-20260912-v1'
import {
  angularVelocityFromDelta,
  circularDragDegrees,
  decayAngularVelocity,
  KINEMATICS_DRAG_VERSION,
  linearDragDegrees,
} from './drag-v1.js?v=kinematics-interactive-20260915-v1'

export const KINEMATICS_RUNTIME_VERSION = 'kinematics-runtime-v1.2.0'

const LANGUAGE_KEY = 'bricklab.ui.language.v1'
const INERTIA_STOP_DPS = 3
const INERTIA_DAMPING = 2.65
const MAX_INERTIA_DPS = 1440
const subsystems = globalThis.BrickLabSubsystems
const authoritativeV4 = globalThis.BrickLabConnectorV4
if (!subsystems?.editor?.ready?.() || !authoritativeV4?.projectConnections) {
  throw new Error('Kinematics requires the bound editor contract and Connector V4')
}

const viewport = document.querySelector('#viewport')
const modeBar = document.querySelector('.modes')
const modeButton = modeBar?.querySelector('[data-mode="kinematics"]')
if (!viewport || !modeBar || !modeButton) throw new Error('Kinematics UI activation is incomplete')

let active = false
let analyzing = false
let entryBaseline = new Map()
let baseline = new Map()
let baselineProject = null
let analysis = null
let drivers = []
let currentDriverId = null
let selectedInstanceId = null
let angleDeg = 0
let slideStud = 0
let originalV4Global = null
let previousStatusText = ''
let toolbarWasDisabled = false
let snapWasHidden = false
let selectedBeforeEnterId = null
let pointerDrag = null
let angularVelocityDps = 0
let inertiaFrame = 0
let inertiaLastTime = 0
let lastLockReason = ''
const dragRaycaster = new THREE.Raycaster()
const dragPointer = new THREE.Vector2()

function language() {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY)
    if (value === 'ru' || value === 'en') return value
  } catch {}
  return String(navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

function t(en, ru) { return language() === 'ru' ? ru : en }

function toast(message, timeout = 2600) {
  const node = document.querySelector('#toast')
  if (!node) return
  node.textContent = message
  node.classList.add('show')
  globalThis.setTimeout?.(() => node.classList.remove('show'), timeout)
}

function createInteractionLayer() {
  let layer = viewport.querySelector('.kinematics-layer')
  if (!layer) {
    layer = document.createElement('div')
    layer.className = 'kinematics-layer'
    layer.hidden = true
    layer.innerHTML = '<div class="kinematics-selection-marker" aria-hidden="true"></div>'
    viewport.append(layer)
  } else {
    layer.querySelector('.kinematics-panel')?.remove()
    if (!layer.querySelector('.kinematics-selection-marker')) {
      const marker = document.createElement('div')
      marker.className = 'kinematics-selection-marker'
      marker.setAttribute('aria-hidden', 'true')
      layer.append(marker)
    }
  }
  return layer
}

const layer = createInteractionLayer()
const selectionMarker = layer.querySelector('.kinematics-selection-marker')

function objects() { return subsystems.editor.objects?.() ?? [] }
function currentDriver() { return drivers.find(driver => driver.id === currentDriverId) ?? null }

function driverForInstance(instanceId) {
  return drivers.find(driver => driver.type === 'shaft' && driver.memberIds.includes(instanceId))
    ?? drivers.find(driver => driver.type === 'joint'
      && driver.controls?.angle
      && driver.movingObject?.userData?.instanceId === instanceId)
    ?? null
}

function mechanicalDragEligible(object) {
  const mechanics = subsystems.parts.get(object?.userData?.partId)?.mechanics
  return Boolean(mechanics?.gear || mechanics?.shaft || mechanics?.wheel)
}

function sceneCamera() {
  const activeCamera = globalThis.BrickLabViewportV1?.camera?.()
  if (activeCamera?.isCamera) return activeCamera
  const first = objects()[0]
  let root = first
  while (root?.parent) root = root.parent
  let camera = null
  root?.traverse?.(node => { if (!camera && node?.isCamera) camera = node })
  return camera
}

function pickedMechanicalObject(event) {
  const canvas = viewport.querySelector('canvas')
  const camera = sceneCamera()
  const rect = canvas?.getBoundingClientRect?.()
  if (!canvas || !camera || !rect?.width || !rect?.height) return null
  dragPointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  dragRaycaster.setFromCamera(dragPointer, camera)
  for (const hit of dragRaycaster.intersectObjects(objects(), true)) {
    const object = hit.object?.userData?.instanceRoot
    if (!object || !mechanicalDragEligible(object)) continue
    const driver = driverForInstance(object.userData?.instanceId)
    if (driver) return { object, driver, camera, canvas }
  }
  return null
}

function pointerPolarAngle(event, center) {
  return Math.atan2(event.clientY - center.y, event.clientX - center.x)
}

function driverAxisWorld(driver) {
  if (driver?.type === 'shaft') {
    return analysis?.drivetrain?.shafts?.find(item => item.id === driver.shaftId)?.axisWorld?.clone?.() ?? null
  }
  if (driver?.type === 'joint') {
    try { return authoritativeV4.worldFrame(driver.targetObject, driver.targetConnector)?.axis?.clone?.() ?? null }
    catch { return null }
  }
  return null
}

function driverViewSign(driver, object, camera) {
  const axis = driverAxisWorld(driver)
  if (!axis || !camera) return 1
  axis.normalize()
  const objectPosition = new THREE.Vector3()
  const cameraPosition = new THREE.Vector3()
  object.getWorldPosition?.(objectPosition)
  camera.getWorldPosition?.(cameraPosition)
  const towardCamera = camera.isOrthographicCamera
    ? camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1)
    : cameraPosition.sub(objectPosition).normalize()
  const dot = axis.dot(towardCamera)
  return Math.abs(dot) < .08 ? 1 : Math.sign(dot)
}

function captureBaseline(items) {
  const result = new Map()
  for (const object of items) {
    object.updateWorldMatrix?.(true, false)
    result.set(object.userData?.instanceId, {
      object,
      position:object.position.clone(),
      quaternion:object.quaternion.clone(),
      scale:object.scale.clone(),
      worldMatrix:object.matrixWorld.clone(),
    })
  }
  return result
}

function restorePoseMap(map, { update = true } = {}) {
  for (const pose of map.values()) {
    pose.object.position.copy(pose.position)
    pose.object.quaternion.copy(pose.quaternion)
    pose.object.scale.copy(pose.scale)
    if (update) pose.object.updateMatrixWorld?.(true)
  }
}

function restoreBaseline(options) { restorePoseMap(baseline, options) }
function restoreEntryBaseline(options) { restorePoseMap(entryBaseline, options) }

function replaceV4WithKinematicsProxy() {
  if (originalV4Global) return
  originalV4Global = globalThis.BrickLabConnectorV4
  const target = originalV4Global
  globalThis.BrickLabConnectorV4 = new Proxy(target, {
    get(object, property, receiver) {
      if (property === 'updateEditor') return () => undefined
      return Reflect.get(object, property, receiver)
    },
  })
}

function restoreV4Global() {
  if (!originalV4Global) return
  globalThis.BrickLabConnectorV4 = originalV4Global
  originalV4Global = null
}

function fixedComponents(plan, sceneObjects) {
  const parent = new Map(sceneObjects.map(object => [object.userData?.instanceId, object.userData?.instanceId]).filter(([id]) => id))
  const find = id => {
    if (!parent.has(id)) return null
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)
    let cursor = id
    while (cursor !== root) {
      const next = parent.get(cursor)
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }
  const union = (a,b) => {
    const ra=find(a), rb=find(b)
    if (ra && rb && ra !== rb) parent.set(rb,ra)
  }
  for (const joint of plan?.joints ?? []) {
    if ((joint?.rule?.kind || joint?.constraint?.kindHint) !== 'fixed') continue
    const entry = joint.entry
    union(entry?.objectA?.userData?.instanceId, entry?.objectB?.userData?.instanceId)
  }
  const groups = new Map()
  for (const object of sceneObjects) {
    const id=object.userData?.instanceId
    const root=find(id)
    if (!root) continue
    const list=groups.get(root) ?? []
    list.push(object)
    groups.set(root,list)
  }
  const byInstance = new Map()
  for (const list of groups.values()) for (const object of list) byInstance.set(object.userData.instanceId, list)
  return byInstance
}

function shaftDrivers(drivetrain) {
  return (drivetrain?.shafts ?? []).map(shaft => ({
    id:`shaft:${shaft.id}`,
    type:'shaft',
    shaftId:shaft.id,
    memberIds:[...(shaft.memberIds ?? [])],
    controls:{ angle:true, slide:false },
  }))
}

function jointDrivers(plan) {
  const result = []
  for (const joint of plan?.joints ?? []) {
    const kind = dynamicJointKind(joint)
    if (!kind) continue
    const entry = joint.entry
    if (!entry?.objectA || !entry?.objectB || !entry?.connectorA || !entry?.connectorB) continue
    const controls = jointControlAxes(joint)
    for (const side of ['a','b']) {
      const movingObject = side === 'a' ? entry.objectA : entry.objectB
      const targetObject = side === 'a' ? entry.objectB : entry.objectA
      const movingConnector = side === 'a' ? entry.connectorA : entry.connectorB
      const targetConnector = side === 'a' ? entry.connectorB : entry.connectorA
      result.push({
        id:`joint:${joint.id}:${side}`,
        type:'joint',
        kind,
        joint,
        movingObject,
        targetObject,
        movingConnector,
        targetConnector,
        controls,
      })
    }
  }
  return result
}

function preferredDriver(previousInstanceId) {
  if (!previousInstanceId) return null
  return driverForInstance(previousInstanceId)?.id ?? null
}

function setStatus(message) {
  const status = document.querySelector('#statusText')
  if (status) status.textContent = message
}

async function analyze() {
  analyzing = true
  document.body.dataset.bricklabKinematicsAnalyzing = 'true'
  setStatus(t('KINEMATICS · analyzing mechanism…','КИНЕМАТИКА · анализ механизма…'))
  const sceneObjects = objects()
  try {
    await authoritativeV4.hydrateObjects?.(sceneObjects)
  } catch (error) {
    console.debug?.('[BrickLab Kinematics] Connector hydration incomplete; using currently certified endpoints.', error)
  }
  authoritativeV4.reconcileGraph?.(sceneObjects, { persist:false })
  const records = authoritativeV4.projectConnections?.() ?? []
  const project = baselineProject ?? subsystems.editor.projectState?.() ?? {}
  const legacy = Array.isArray(project?.connections) ? project.connections : []
  const semantic = drivetrainSemanticLinksV4(records)
  let drivetrain
  try {
    drivetrain = subsystems.mechanics.analyze(sceneObjects, [...legacy, ...semantic])
  } catch (error) {
    drivetrain = { shafts:[], gearMeshes:[], conflicts:[], stats:{}, error:String(error?.message || error) }
  }

  let plan
  try {
    plan = buildPhysicsPlanV4({
      objects:sceneObjects,
      connections:records,
      getConnector:(partId, endpointId) => authoritativeV4.getConnector?.(partId, endpointId) ?? null,
    })
  } catch (error) {
    plan = { pass:false, joints:[], blockers:[{ connectionId:null, family:null, reason:`preflight-error:${error?.message || error}` }], stats:{} }
  }

  analysis = {
    records,
    legacy,
    drivetrain,
    plan,
    dof:summarizePlanDof(plan),
    fixedByInstance:fixedComponents(plan, sceneObjects),
  }
  drivers = [...shaftDrivers(drivetrain), ...jointDrivers(plan)]
  currentDriverId = preferredDriver(selectedBeforeEnterId)
  selectedInstanceId = currentDriverId ? selectedBeforeEnterId : null
  angleDeg = 0
  slideStud = 0
  analyzing = false
  delete document.body.dataset.bricklabKinematicsAnalyzing
  setStatus(t('KINEMATICS · LMB select + drag to rotate · Esc BUILD','КИНЕМАТИКА · ЛКМ выбрать + тянуть для вращения · Esc СБОРКА'))
  updateSelectionMarker()
}

function parentLocalAxis(object, worldAxis) {
  if (!object.parent) return worldAxis.clone().normalize()
  object.parent.updateWorldMatrix?.(true,false)
  const parentQ = new THREE.Quaternion()
  object.parent.getWorldQuaternion?.(parentQ)
  return worldAxis.clone().applyQuaternion(parentQ.invert()).normalize()
}

function applyShaftDriver(driver) {
  const solution = solveShaftRatios(driver.shaftId, analysis?.drivetrain?.gearMeshes ?? [])
  if (solution.conflicts.length) {
    restoreBaseline()
    return { locked:true, reason:t('Conflicting gear ratios lock this drivetrain loop.','Конфликт передаточных отношений блокирует эту кинематическую петлю.'), solution }
  }
  restoreBaseline({ update:true })
  const shaftById = new Map((analysis?.drivetrain?.shafts ?? []).map(shaft => [shaft.id, shaft]))
  for (const [shaftId, ratio] of Object.entries(solution.ratios)) {
    const shaft = shaftById.get(shaftId)
    if (!shaft?.axisWorld) continue
    const radians = THREE.MathUtils.degToRad(angleDeg * ratio)
    if (Math.abs(radians) < 1e-12) continue
    for (const instanceId of shaft.memberIds ?? []) {
      const pose = baseline.get(instanceId)
      if (!pose) continue
      const axisLocal = parentLocalAxis(pose.object, shaft.axisWorld)
      const delta = new THREE.Quaternion().setFromAxisAngle(axisLocal, radians)
      pose.object.quaternion.copy(delta.multiply(pose.quaternion.clone()))
      pose.object.updateMatrixWorld?.(true)
    }
  }
  return { locked:false, solution }
}

function transformComponent(component, deltaWorld) {
  for (const object of component) {
    const pose = baseline.get(object.userData?.instanceId)
    if (!pose) continue
    const world = deltaWorld.clone().multiply(pose.worldMatrix)
    let local = world
    if (object.parent) {
      object.parent.updateWorldMatrix?.(true,false)
      local = object.parent.matrixWorld.clone().invert().multiply(world)
    }
    local.decompose(object.position, object.quaternion, object.scale)
    object.updateMatrixWorld?.(true)
  }
}

function applyJointDriver(driver) {
  restoreBaseline({ update:true })
  const movingId = driver.movingObject?.userData?.instanceId
  const targetId = driver.targetObject?.userData?.instanceId
  const component = analysis?.fixedByInstance?.get(movingId) ?? [driver.movingObject]
  if (component.some(object => object?.userData?.instanceId === targetId)) {
    return { locked:true, reason:t('A rigid alternate path connects both sides of this joint.','Обе стороны шарнира соединены альтернативным жёстким путём.') }
  }
  let frame
  try { frame = authoritativeV4.worldFrame(driver.targetObject, driver.targetConnector) }
  catch (error) { return { locked:true, reason:String(error?.message || error) } }
  const axis = frame.axis.clone().normalize()
  const pivot = frame.position.clone()
  const radians = driver.controls?.angle ? THREE.MathUtils.degToRad(angleDeg) : 0
  const slide = driver.controls?.slide ? slideStud : 0
  const rotation = new THREE.Matrix4().makeRotationAxis(axis, radians)
  const aroundPivot = new THREE.Matrix4().makeTranslation(pivot.x,pivot.y,pivot.z)
    .multiply(rotation)
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z))
  const translation = new THREE.Matrix4().makeTranslation(axis.x*slide,axis.y*slide,axis.z*slide)
  transformComponent(component, translation.multiply(aroundPivot))
  return { locked:false }
}

function stopInertia() {
  if (inertiaFrame) cancelAnimationFrame(inertiaFrame)
  inertiaFrame = 0
  inertiaLastTime = 0
  angularVelocityDps = 0
  document.body.classList.remove('bricklab-kinematics-inertia')
}

function applyControls() {
  if (!active || analyzing || !analysis) return { locked:false }
  const driver = currentDriver()
  if (!driver) return { locked:false }
  const result = driver.type === 'shaft' ? applyShaftDriver(driver) : applyJointDriver(driver)
  if (result?.locked) {
    stopInertia()
    if (result.reason && result.reason !== lastLockReason) {
      lastLockReason = result.reason
      toast(result.reason)
    }
  } else {
    lastLockReason = ''
  }
  updateSelectionMarker()
  return result
}

function updateSelectionMarker() {
  if (!selectionMarker) return
  const object = selectedInstanceId ? subsystems.editor.objectById?.(selectedInstanceId) : null
  const point = object ? subsystems.editor.viewportPoint?.(object, { offsetY:0 }) : null
  if (!active || !object || !point?.visible) {
    selectionMarker.hidden = true
    return
  }
  selectionMarker.hidden = false
  selectionMarker.style.left = `${point.x}px`
  selectionMarker.style.top = `${point.y}px`
}

function rebaseForDriver(driver, instanceId) {
  if (currentDriverId === driver.id) {
    selectedInstanceId = instanceId
    updateSelectionMarker()
    return
  }
  stopInertia()
  baseline = captureBaseline(objects())
  angleDeg = 0
  slideStud = 0
  currentDriverId = driver.id
  selectedInstanceId = instanceId
  updateSelectionMarker()
}

function startInertia() {
  if (!active || !currentDriver()?.controls?.angle || Math.abs(angularVelocityDps) < 12) {
    angularVelocityDps = 0
    return
  }
  angularVelocityDps = Math.max(-MAX_INERTIA_DPS, Math.min(MAX_INERTIA_DPS, angularVelocityDps))
  document.body.classList.add('bricklab-kinematics-inertia')
  inertiaLastTime = performance.now()
  const frame = now => {
    if (!active || pointerDrag || Math.abs(angularVelocityDps) < INERTIA_STOP_DPS) {
      stopInertia()
      return
    }
    const dt = Math.max(0, Math.min(.05, (now - inertiaLastTime) / 1000))
    inertiaLastTime = now
    angleDeg += angularVelocityDps * dt
    const result = applyControls()
    if (result?.locked) return
    angularVelocityDps = decayAngularVelocity(angularVelocityDps, dt, INERTIA_DAMPING)
    inertiaFrame = requestAnimationFrame(frame)
  }
  inertiaFrame = requestAnimationFrame(frame)
}

function setModeVisual() {
  for (const button of document.querySelectorAll('.mode')) button.classList.toggle('active', button.dataset.mode === 'kinematics')
  document.body.classList.add('bricklab-kinematics-active')
  const toolbar = document.querySelector('.viewport-toolbar')
  const snap = document.querySelector('#snapToolbar')
  toolbarWasDisabled = toolbar?.classList.contains('disabled') ?? false
  snapWasHidden = snap?.classList.contains('hidden') ?? false
  toolbar?.classList.add('disabled')
  snap?.classList.add('hidden')
  const status = document.querySelector('#statusText')
  previousStatusText = status?.textContent ?? ''
}

function restoreModeVisual() {
  document.body.classList.remove('bricklab-kinematics-active','bricklab-kinematics-inertia')
  delete document.body.dataset.bricklabKinematicsAnalyzing
  for (const button of document.querySelectorAll('.mode')) button.classList.toggle('active', button.dataset.mode === 'build')
  const toolbar = document.querySelector('.viewport-toolbar')
  const snap = document.querySelector('#snapToolbar')
  if (!toolbarWasDisabled) toolbar?.classList.remove('disabled')
  if (!snapWasHidden) snap?.classList.remove('hidden')
  const status = document.querySelector('#statusText')
  if (status && previousStatusText) status.textContent = previousStatusText
  if (selectionMarker) selectionMarker.hidden = true
}

function blockEditorClick(event) {
  if (!active) return
  const id = event.target?.closest?.('button')?.id
  if (!['saveBtn','exportBtn','newBtn','importBtn'].includes(id)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  toast(t('Exit Kinematics before changing or saving the project.','Выйдите из кинематики перед изменением или сохранением проекта.'))
}

function modeCapture(event) {
  if (!active) return
  const button = event.target?.closest?.('.mode')
  if (!button || button.dataset.mode === 'kinematics') return
  event.preventDefault()
  event.stopImmediatePropagation()
  const targetMode = button.dataset.mode
  exit({ restore:true })
  queueMicrotask(() => document.querySelector(`.mode[data-mode="${targetMode}"]`)?.click?.())
}

function canvasPointerDown(event) {
  if (!active || analyzing || event.button !== 0) return
  const picked = pickedMechanicalObject(event)
  if (!picked) return
  event.preventDefault()
  event.stopImmediatePropagation()
  stopInertia()
  rebaseForDriver(picked.driver, picked.object.userData?.instanceId)

  const point = subsystems.editor.viewportPoint?.(picked.object, { offsetY:0 })
  const viewportRect = viewport.getBoundingClientRect()
  const center = point
    ? { x:viewportRect.left + point.x, y:viewportRect.top + point.y }
    : { x:event.clientX, y:event.clientY }
  const radius = Math.hypot(event.clientX - center.x, event.clientY - center.y)
  pointerDrag = {
    pointerId:event.pointerId,
    canvas:picked.canvas,
    center,
    previousX:event.clientX,
    previousY:event.clientY,
    previousAngle:pointerPolarAngle(event, center),
    previousTime:Number(event.timeStamp) || performance.now(),
    velocity:0,
    moved:false,
    circular:radius >= 12,
    viewSign:driverViewSign(picked.driver, picked.object, picked.camera),
  }
  picked.canvas.setPointerCapture?.(event.pointerId)
  picked.canvas.classList.add('kinematics-dragging')
}

function canvasPointerMove(event) {
  if (active && selectedInstanceId) updateSelectionMarker()
  if (!active || !pointerDrag || event.pointerId !== pointerDrag.pointerId) return
  event.preventDefault()
  event.stopImmediatePropagation()
  const currentAngle = pointerPolarAngle(event, pointerDrag.center)
  const delta = pointerDrag.circular
    ? circularDragDegrees(pointerDrag.previousAngle, currentAngle, pointerDrag.viewSign)
    : linearDragDegrees(event.clientX - pointerDrag.previousX, event.clientY - pointerDrag.previousY, pointerDrag.viewSign)
  const now = Number(event.timeStamp) || performance.now()
  if (Number.isFinite(delta)) {
    angleDeg += delta
    pointerDrag.velocity = angularVelocityFromDelta(delta, now - pointerDrag.previousTime, pointerDrag.velocity, .42, MAX_INERTIA_DPS)
    if (Math.abs(delta) > .02) pointerDrag.moved = true
  }
  pointerDrag.previousAngle = currentAngle
  pointerDrag.previousX = event.clientX
  pointerDrag.previousY = event.clientY
  pointerDrag.previousTime = now
  applyControls()
}

function finishPointerDrag(event, allowInertia = event?.type !== 'pointercancel') {
  if (!pointerDrag || (event?.pointerId != null && event.pointerId !== pointerDrag.pointerId)) return
  event?.preventDefault?.()
  event?.stopImmediatePropagation?.()
  const finished = pointerDrag
  finished.canvas.releasePointerCapture?.(finished.pointerId)
  finished.canvas.classList.remove('kinematics-dragging')
  pointerDrag = null
  angularVelocityDps = allowInertia && finished.moved ? finished.velocity : 0
  if (allowInertia) startInertia()
}

function keyCapture(event) {
  if (!active) return
  if (event.code === 'Escape') {
    event.preventDefault(); event.stopImmediatePropagation(); exit({ restore:true }); return
  }
  if (event.code === 'Tab') {
    event.preventDefault(); event.stopImmediatePropagation()
    exit({ restore:true })
    queueMicrotask(() => document.querySelector('.mode[data-mode="simulate"]')?.click?.())
    return
  }
  const safeViewCodes = new Set(['Home','Digit1','Digit2','Digit3','Digit5','Slash'])
  if (safeViewCodes.has(event.code)) return
  event.preventDefault()
  event.stopImmediatePropagation()
}

async function enter() {
  if (active || analyzing) return api
  if (subsystems.editor.mode?.() !== 'build') {
    toast(t('Kinematics can only start from BUILD.','Кинематика запускается только из СБОРКИ.'))
    return api
  }
  const sceneObjects = objects()
  if (!sceneObjects.length) {
    toast(t('Add parts before entering Kinematics.','Добавьте детали перед запуском кинематики.'))
    return api
  }

  globalThis.BrickLabDesignDoctor?.close?.()
  selectedBeforeEnterId = subsystems.editor.primarySelection?.()?.userData?.instanceId ?? null
  baselineProject = subsystems.editor.projectState?.() ?? null
  entryBaseline = captureBaseline(sceneObjects)
  baseline = captureBaseline(sceneObjects)
  replaceV4WithKinematicsProxy()
  active = true
  layer.hidden = false
  setModeVisual()
  await analyze()
  globalThis.dispatchEvent?.(new CustomEvent('bricklab:kinematicsenter', {
    detail:{ version:KINEMATICS_RUNTIME_VERSION, solverVersion:KINEMATICS_SOLVER_VERSION, drivers:drivers.length },
  }))
  return api
}

function exit({ restore = true } = {}) {
  if (!active && !analyzing) return api
  stopInertia()
  finishPointerDrag(null, false)
  if (restore) restoreEntryBaseline({ update:true })
  restoreV4Global()
  try { authoritativeV4.reconcileGraph?.(objects(), { persist:false }) } catch (error) { console.warn('[BrickLab Kinematics] Baseline graph reconcile failed.', error) }
  active = false
  analyzing = false
  analysis = null
  drivers = []
  currentDriverId = null
  selectedInstanceId = null
  angleDeg = 0
  slideStud = 0
  entryBaseline.clear()
  baseline.clear()
  baselineProject = null
  selectedBeforeEnterId = null
  layer.hidden = true
  restoreModeVisual()
  globalThis.BrickLabConnectorV4InspectorSync?.refresh?.()
  globalThis.dispatchEvent?.(new CustomEvent('bricklab:kinematicsexit', { detail:{ version:KINEMATICS_RUNTIME_VERSION } }))
  return api
}

function reset() {
  stopInertia()
  restoreEntryBaseline({ update:true })
  baseline = captureBaseline(objects())
  angleDeg = 0
  slideStud = 0
  updateSelectionMarker()
}

modeBar.addEventListener('click', modeCapture, true)
document.querySelector('.top-actions')?.addEventListener('click', blockEditorClick, true)
const canvas = viewport.querySelector('canvas')
canvas?.addEventListener('pointerdown', canvasPointerDown, true)
canvas?.addEventListener('pointermove', canvasPointerMove, true)
canvas?.addEventListener('pointerup', finishPointerDrag, true)
canvas?.addEventListener('pointercancel', finishPointerDrag, true)
globalThis.addEventListener?.('keydown', keyCapture, true)
globalThis.addEventListener?.('resize', updateSelectionMarker)

const api = Object.freeze({
  version:KINEMATICS_RUNTIME_VERSION,
  solverVersion:KINEMATICS_SOLVER_VERSION,
  enter,
  exit,
  reset,
  active:() => active,
  status:() => Object.freeze({
    active,
    analyzing,
    driverId:currentDriverId,
    selectedInstanceId,
    driverCount:drivers.length,
    dof:analysis?.dof ?? null,
    blockers:analysis?.plan?.blockers?.length ?? 0,
    dragging:Boolean(pointerDrag),
    inertia:Boolean(inertiaFrame),
    angularVelocityDps,
  }),
  drivers:() => drivers.map(driver => Object.freeze({ id:driver.id, type:driver.type, kind:driver.kind ?? null })),
  setDriver(id) {
    const driver = drivers.find(item => item.id === id)
    if (!driver) return false
    stopInertia()
    baseline = captureBaseline(objects())
    currentDriverId = id
    selectedInstanceId = driver.type === 'shaft' ? driver.memberIds[0] ?? null : driver.movingObject?.userData?.instanceId ?? null
    angleDeg = 0
    slideStud = 0
    updateSelectionMarker()
    return true
  },
  setAngle(degrees) { angleDeg = Number(degrees) || 0; applyControls(); return angleDeg },
  setSlide(studs) { slideStud = Math.max(-4, Math.min(4, Number(studs) || 0)); applyControls(); return slideStud },
  projectStateSnapshot:() => baselineProject,
  dragVersion:KINEMATICS_DRAG_VERSION,
})

globalThis.BrickLabKinematics = api
globalThis.dispatchEvent?.(new CustomEvent('bricklab:kinematicsready', {
  detail:{ version:KINEMATICS_RUNTIME_VERSION, solverVersion:KINEMATICS_SOLVER_VERSION },
}))
