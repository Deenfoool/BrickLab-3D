import * as THREE from 'three'
import { buildPhysicsPlanV4, drivetrainSemanticLinksV4 } from '../connectors-v4/physics-policy-v4.js'
import {
  KINEMATICS_SOLVER_VERSION,
  dynamicJointKind,
  jointControlAxes,
  solveShaftRatios,
  summarizePlanDof,
} from './solver-v1.js?v=kinematics-20260912-v1'

export const KINEMATICS_RUNTIME_VERSION = 'kinematics-runtime-v1.0.0'

const LANGUAGE_KEY = 'bricklab.ui.language.v1'
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
let baseline = new Map()
let baselineProject = null
let analysis = null
let drivers = []
let currentDriverId = null
let angleDeg = 0
let slideStud = 0
let originalV4Global = null
let previousStatusText = ''
let toolbarWasDisabled = false
let snapWasHidden = false
let selectedBeforeEnterId = null

function language() {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY)
    if (value === 'ru' || value === 'en') return value
  } catch {}
  return String(navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

function t(en, ru) { return language() === 'ru' ? ru : en }

function toast(message, timeout = 3000) {
  const node = document.querySelector('#toast')
  if (!node) return
  node.textContent = message
  node.classList.add('show')
  globalThis.setTimeout?.(() => node.classList.remove('show'), timeout)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[char])
}

function createUi() {
  let layer = viewport.querySelector('.kinematics-layer')
  if (layer) return layer
  layer = document.createElement('div')
  layer.className = 'kinematics-layer'
  layer.hidden = true
  layer.innerHTML = '<section class="kinematics-panel" role="region" aria-label="Kinematics"></section>'
  viewport.append(layer)
  return layer
}

const layer = createUi()
const panel = layer.querySelector('.kinematics-panel')

function objects() { return subsystems.editor.objects?.() ?? [] }
function currentDriver() { return drivers.find(driver => driver.id === currentDriverId) ?? null }

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

function restoreBaseline({ update = true } = {}) {
  for (const pose of baseline.values()) {
    pose.object.position.copy(pose.position)
    pose.object.quaternion.copy(pose.quaternion)
    pose.object.scale.copy(pose.scale)
    if (update) pose.object.updateMatrixWorld?.(true)
  }
}

function replaceV4WithKinematicsProxy() {
  if (originalV4Global) return
  originalV4Global = globalThis.BrickLabConnectorV4
  const target = originalV4Global
  // app.js runs Connector V4 updateEditor every BUILD frame. Kinematics intentionally
  // changes live transforms without changing the construction graph, so suppress only
  // that editor-reconcile hook while this temporary mode is active.
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

function definitionName(object) {
  return subsystems.parts.get(object?.userData?.partId)?.name ?? object?.userData?.partId ?? t('Part','Деталь')
}

function shaftDrivers(drivetrain) {
  return (drivetrain?.shafts ?? []).map(shaft => {
    const representative = subsystems.editor.objectById?.(shaft.memberIds?.[0])
    const label = `${t('Shaft','Вал')} · ${definitionName(representative)}${shaft.memberIds?.length > 1 ? ` · ${shaft.memberIds.length} ${t('parts','дет.')}` : ''}`
    return {
      id:`shaft:${shaft.id}`,
      type:'shaft',
      shaftId:shaft.id,
      label,
      memberIds:[...(shaft.memberIds ?? [])],
      controls:{ angle:true, slide:false },
    }
  })
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
        label:`${kind} · ${definitionName(movingObject)} → ${definitionName(targetObject)}`,
      })
    }
  }
  return result
}

function preferredDriver(previousInstanceId) {
  if (!previousInstanceId) return drivers[0]?.id ?? null
  return drivers.find(driver => driver.type === 'shaft' && driver.memberIds.includes(previousInstanceId))?.id
    ?? drivers.find(driver => driver.type === 'joint' && driver.movingObject?.userData?.instanceId === previousInstanceId)?.id
    ?? drivers[0]?.id
    ?? null
}

async function analyze() {
  analyzing = true
  renderPanel()
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
  angleDeg = 0
  slideStud = 0
  analyzing = false
  renderPanel()
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
    return { locked:true, reason:t('A rigid alternate path connects both sides of this joint.','Обе стороны шарнира соединены альтернативным жёстким путём.'), solution:null }
  }

  let frame
  try { frame = authoritativeV4.worldFrame(driver.targetObject, driver.targetConnector) }
  catch (error) { return { locked:true, reason:String(error?.message || error), solution:null } }
  const axis = frame.axis.clone().normalize()
  const pivot = frame.position.clone()
  const controls = driver.controls
  const radians = controls.angle ? THREE.MathUtils.degToRad(angleDeg) : 0
  const slide = controls.slide ? slideStud : 0

  const rotation = new THREE.Matrix4().makeRotationAxis(axis, radians)
  const aroundPivot = new THREE.Matrix4().makeTranslation(pivot.x,pivot.y,pivot.z)
    .multiply(rotation)
    .multiply(new THREE.Matrix4().makeTranslation(-pivot.x,-pivot.y,-pivot.z))
  const translation = new THREE.Matrix4().makeTranslation(axis.x*slide,axis.y*slide,axis.z*slide)
  const delta = translation.multiply(aroundPivot)
  transformComponent(component, delta)
  return { locked:false, solution:null }
}

function applyControls() {
  if (!active || analyzing || !analysis) return
  const driver = currentDriver()
  if (!driver) {
    restoreBaseline()
    renderPanel()
    return
  }
  const result = driver.type === 'shaft' ? applyShaftDriver(driver) : applyJointDriver(driver)
  panel.dataset.locked = result?.locked ? 'true' : 'false'
  panel.dataset.driverType = driver.type
  renderReadout(result)
}

function driverOptions() {
  return drivers.map(driver => `<option value="${escapeHtml(driver.id)}"${driver.id === currentDriverId ? ' selected' : ''}>${escapeHtml(driver.label)}</option>`).join('')
}

function renderReadout(lastResult = null) {
  const node = panel.querySelector('[data-kinematics-readout]')
  if (!node || !analysis) return
  const driver = currentDriver()
  let extra = ''
  if (lastResult?.locked) extra = `<div class="kinematics-alert error">${escapeHtml(lastResult.reason)}</div>`
  else if (driver?.type === 'shaft') {
    const solution = lastResult?.solution ?? solveShaftRatios(driver.shaftId, analysis.drivetrain?.gearMeshes ?? [])
    const driven = Object.keys(solution.ratios).length
    const ambiguous = solution.ambiguous.length
    extra = `<div class="kinematics-readout-line"><span>${t('Driven shafts','Ведомые валы')}</span><b>${driven}</b></div>`
    if (ambiguous) extra += `<div class="kinematics-alert warning">${t('Differential branch is under-constrained and is not propagated automatically.','Ветвь дифференциала недоопределена и не распространяется автоматически.')}</div>`
  }
  const blockers = analysis.plan?.blockers?.length ?? 0
  if (blockers) extra += `<div class="kinematics-alert warning">${blockers} ${t('uncertified V4 relationship(s) are excluded from direct joint driving.','несертифицированных V4-связей исключены из прямого управления шарнирами.')}</div>`
  node.innerHTML = extra
}

function wirePanel() {
  panel.querySelector('[data-kinematics-driver]')?.addEventListener('change', event => {
    currentDriverId = event.target.value || null
    angleDeg = 0
    slideStud = 0
    restoreBaseline()
    renderPanel()
  })
  panel.querySelector('[data-kinematics-angle]')?.addEventListener('input', event => {
    angleDeg = Number(event.target.value) || 0
    const output = panel.querySelector('[data-kinematics-angle-value]')
    if (output) output.textContent = `${Math.round(angleDeg)}°`
    applyControls()
  })
  panel.querySelector('[data-kinematics-slide]')?.addEventListener('input', event => {
    slideStud = Number(event.target.value) || 0
    const output = panel.querySelector('[data-kinematics-slide-value]')
    if (output) output.textContent = `${slideStud.toFixed(2)} stud`
    applyControls()
  })
  panel.querySelector('[data-kinematics-reset]')?.addEventListener('click', () => {
    angleDeg = 0
    slideStud = 0
    restoreBaseline()
    renderPanel()
  })
  panel.querySelector('[data-kinematics-exit]')?.addEventListener('click', () => exit({ restore:true }))
}

function renderPanel() {
  if (!active) return
  if (analyzing || !analysis) {
    panel.innerHTML = `<div class="kinematics-head"><div><small>KINEMATICS V1</small><h3>${t('Analyzing mechanism…','Анализ механизма…')}</h3></div><span class="kinematics-spinner"></span></div><p>${t('Building a deterministic constraint and drivetrain model. No physics session is started.','Строится детерминированная модель ограничений и трансмиссии. Физическая симуляция не запускается.')}</p>`
    return
  }

  const driver = currentDriver()
  const controls = driver?.controls ?? {angle:false,slide:false}
  const dof = analysis.dof
  const status = dof.blockers
    ? t('Certified subset','Сертифицированное подмножество')
    : t('Certified','Сертифицировано')
  panel.innerHTML = `
    <div class="kinematics-head">
      <div><small>KINEMATICS V1 · ${escapeHtml(status)}</small><h3>${t('Mechanism motion','Движение механизма')}</h3></div>
      <button type="button" class="kinematics-close" data-kinematics-exit aria-label="Exit">×</button>
    </div>
    <div class="kinematics-metrics">
      <div><span>${t('Mechanism DOF','Степеней свободы')}</span><b>${dof.total}</b></div>
      <div><span>${t('Shafts','Валы')}</span><b>${analysis.drivetrain?.shafts?.length ?? 0}</b></div>
      <div><span>${t('Gear links','Передачи')}</span><b>${analysis.drivetrain?.gearMeshes?.length ?? 0}</b></div>
    </div>
    <label class="kinematics-field"><span>${t('Driver','Ведущий элемент')}</span>
      <select data-kinematics-driver ${drivers.length ? '' : 'disabled'}>
        ${drivers.length ? driverOptions() : `<option>${t('No deterministic driver found','Нет детерминированного ведущего элемента')}</option>`}
      </select>
    </label>
    ${controls.angle ? `<label class="kinematics-control"><span>${t('Rotation','Вращение')} <b data-kinematics-angle-value>${Math.round(angleDeg)}°</b></span><input data-kinematics-angle type="range" min="-180" max="180" step="1" value="${angleDeg}"></label>` : ''}
    ${controls.slide ? `<label class="kinematics-control"><span>${t('Axial travel','Осевое перемещение')} <b data-kinematics-slide-value>${slideStud.toFixed(2)} stud</b></span><input data-kinematics-slide type="range" min="-4" max="4" step="0.05" value="${slideStud}"></label>` : ''}
    <div data-kinematics-readout></div>
    ${drivers.length ? '' : `<div class="kinematics-alert info">${t('Add a supported shaft/gear train or a certified revolute, prismatic or cylindrical V4 joint.','Добавьте поддерживаемую передачу/вал или сертифицированный V4-шарнир: revolute, prismatic или cylindrical.')}</div>`}
    <div class="kinematics-actions"><button type="button" data-kinematics-reset>${t('Reset pose','Сбросить позу')}</button><button type="button" class="primary" data-kinematics-exit>${t('Back to BUILD','Вернуться в СБОРКУ')}</button></div>
    <footer>${t('Temporary motion only · gravity off · collision impulses off · project is not saved','Только временное движение · без гравитации · без импульсов столкновений · проект не сохраняется')}</footer>
  `
  wirePanel()
  renderReadout()
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
  if (status) status.textContent = t('KINEMATICS · deterministic motion · no physics','КИНЕМАТИКА · детерминированное движение · без физики')
}

function restoreModeVisual() {
  document.body.classList.remove('bricklab-kinematics-active')
  for (const button of document.querySelectorAll('.mode')) button.classList.toggle('active', button.dataset.mode === 'build')
  const toolbar = document.querySelector('.viewport-toolbar')
  const snap = document.querySelector('#snapToolbar')
  if (!toolbarWasDisabled) toolbar?.classList.remove('disabled')
  if (!snapWasHidden) snap?.classList.remove('hidden')
  const status = document.querySelector('#statusText')
  if (status && previousStatusText) status.textContent = previousStatusText
}

function clearEditorSelection() {
  globalThis.dispatchEvent?.(new KeyboardEvent('keydown', { key:'Escape', code:'Escape', bubbles:true }))
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

function canvasCapture(event) {
  if (!active || event.button !== 0) return
  event.preventDefault()
  event.stopImmediatePropagation()
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
  // Prevent BUILD edit/save shortcuts while app.js internally remains in BUILD. The
  // temporary pose is never allowed to enter history or persistence.
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
  baseline = captureBaseline(sceneObjects)
  clearEditorSelection()
  replaceV4WithKinematicsProxy()
  active = true
  layer.hidden = false
  setModeVisual()
  renderPanel()
  await analyze()
  globalThis.dispatchEvent?.(new CustomEvent('bricklab:kinematicsenter', {
    detail:{ version:KINEMATICS_RUNTIME_VERSION, solverVersion:KINEMATICS_SOLVER_VERSION, drivers:drivers.length },
  }))
  return api
}

function exit({ restore = true } = {}) {
  if (!active && !analyzing) return api
  if (restore) restoreBaseline({ update:true })
  restoreV4Global()
  try { authoritativeV4.reconcileGraph?.(objects(), { persist:false }) } catch (error) { console.warn('[BrickLab Kinematics] Baseline graph reconcile failed.', error) }
  active = false
  analyzing = false
  analysis = null
  drivers = []
  currentDriverId = null
  angleDeg = 0
  slideStud = 0
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
  angleDeg = 0
  slideStud = 0
  restoreBaseline({ update:true })
  renderPanel()
}

modeBar.addEventListener('click', modeCapture, true)
document.querySelector('.top-actions')?.addEventListener('click', blockEditorClick, true)
viewport.querySelector('canvas')?.addEventListener('pointerdown', canvasCapture, true)
globalThis.addEventListener?.('keydown', keyCapture, true)
globalThis.addEventListener?.('bricklab:languagechange', () => { if (active) renderPanel() })

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
    driverCount:drivers.length,
    dof:analysis?.dof ?? null,
    blockers:analysis?.plan?.blockers?.length ?? 0,
  }),
  drivers:() => drivers.map(driver => Object.freeze({ id:driver.id, type:driver.type, kind:driver.kind ?? null, label:driver.label })),
  setDriver(id) {
    if (!drivers.some(driver => driver.id === id)) return false
    currentDriverId = id
    angleDeg = 0
    slideStud = 0
    restoreBaseline()
    renderPanel()
    return true
  },
  setAngle(degrees) { angleDeg = Math.max(-180, Math.min(180, Number(degrees) || 0)); applyControls(); return angleDeg },
  setSlide(studs) { slideStud = Math.max(-4, Math.min(4, Number(studs) || 0)); applyControls(); return slideStud },
  projectStateSnapshot:() => baselineProject,
})

globalThis.BrickLabKinematics = api
globalThis.dispatchEvent?.(new CustomEvent('bricklab:kinematicsready', {
  detail:{ version:KINEMATICS_RUNTIME_VERSION, solverVersion:KINEMATICS_SOLVER_VERSION },
}))
