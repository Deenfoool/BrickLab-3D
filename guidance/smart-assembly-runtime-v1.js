import {
  registerLDrawPartByFile,
  preloadLDrawPrototype,
  getLDrawMetadata,
} from '../ldraw/runtime-v3.js'
import {
  SMART_ASSEMBLY_COMPATIBILITY_VERSION,
  SMART_ASSEMBLY_FAMILIES,
  compatibleAssemblyChoices,
  bestAssemblyChoice,
  isCompatibleAssemblyPresent,
  smartAssemblyDismissalKey,
  smartAssemblyPlacement,
} from './assembly-compatibility-v1.js?v=smart-assembly-20260911-v6'

export const SMART_ASSEMBLY_ASSISTANT_VERSION = 'smart-assembly-assistant-v1.0.3'

const subsystems = globalThis.BrickLabSubsystems
if (!subsystems?.editor?.ready?.()) throw new Error('Smart Assembly Assistant requires the bound editor subsystem')

function ensureStylesheet() {
  if (!globalThis.document?.head || document.querySelector('link[data-bricklab-smart-assembly]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = './guidance/smart-assembly-v1.css?v=smart-assembly-20260911-v3'
  link.dataset.bricklabSmartAssembly = 'v1'
  document.head.append(link)
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[char])
}

function candidateLabel(choice) {
  return choice.targetDefinition?.name || `LDraw ${choice.targetCode}`
}

function sourceDefinitionFor(object) {
  return subsystems.parts.get(object?.userData?.partId) ?? null
}

function currentBuildMode() {
  return (subsystems.editor.mode?.() ?? document.querySelector('.mode.active')?.dataset?.mode) === 'build'
}

function inspectorSelectedObject() {
  const inspector = document.querySelector('#inspector')
  if (!inspector || inspector.classList.contains('hidden')) return null
  const text = document.querySelector('#selectedId')?.textContent?.trim() || ''
  // updateInspector appends "· +N selected" for a multi-selection. Guidance V1 only
  // acts on one part, so never collapse a real multi-selection to its primary object.
  if (!text || text.includes('· +')) return null
  const prefix = text.split('·')[0]?.trim() || ''
  if (prefix.length < 4) return null
  const matches = subsystems.editor.objects().filter(object =>
    String(object?.userData?.instanceId || '').startsWith(prefix),
  )
  return matches.length === 1 ? matches[0] : null
}

function guidanceSelection() {
  const apiSelection = subsystems.editor.selection()
  const inspectorSelection = inspectorSelectedObject()
  if (!inspectorSelection) return apiSelection
  if (apiSelection.length === 1 && apiSelection[0] === inspectorSelection) return apiSelection
  // The inspector is driven by app.js' lexical selection and remains a fail-safe for
  // old saved sessions while the editor selection bridge is being upgraded in place.
  return [inspectorSelection]
}

function makeLayer() {
  const viewport = document.querySelector('#viewport')
  if (!viewport) throw new Error('BrickLab viewport is unavailable')
  viewport.classList.add('smart-assembly-host')
  const layer = document.createElement('div')
  layer.className = 'smart-assembly-layer'
  layer.hidden = true
  layer.innerHTML = `
    <div class="smart-assembly-anchor" aria-hidden="true"></div>
    <div class="smart-assembly-line" aria-hidden="true"></div>
    <section class="smart-assembly-card" role="region" aria-label="Smart Assembly suggestion"></section>
  `
  viewport.append(layer)
  return {
    viewport,
    layer,
    anchor:layer.querySelector('.smart-assembly-anchor'),
    line:layer.querySelector('.smart-assembly-line'),
    card:layer.querySelector('.smart-assembly-card'),
  }
}

ensureStylesheet()
const ui = makeLayer()
const dismissed = new Set()
const labels = new Map()
let current = null
let choicesExpanded = false
let installPending = false
let evaluationQueued = false
let lastSignature = ''
let animationFrame = 0

function hide() {
  current = null
  lastSignature = ''
  choicesExpanded = false
  ui.layer.classList.remove('is-visible')
  ui.layer.hidden = true
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
}

function lineToCard(point, cardX, cardY, cardWidth) {
  const endX = cardX >= point.x ? cardX : cardX + cardWidth
  const endY = cardY + 42
  const dx = endX - point.x
  const dy = endY - point.y
  const length = Math.hypot(dx, dy)
  ui.line.style.width = `${length}px`
  ui.line.style.transform = `translate3d(${point.x}px,${point.y}px,0) rotate(${Math.atan2(dy, dx)}rad)`
}

function positionUi() {
  if (!current || ui.layer.hidden) return
  const point = subsystems.editor.viewportPoint?.(current.source, { offsetY:.72 })
  const width = point?.width || ui.viewport.clientWidth
  const height = point?.height || ui.viewport.clientHeight
  if (!width || !height) return

  const anchorPoint = point?.visible
    ? point
    : { x:Math.max(28, width * .42), y:Math.max(60, height * .48), width, height, visible:false }
  const cardWidth = ui.card.offsetWidth || Math.min(310, width - 28)
  const cardHeight = ui.card.offsetHeight || 170
  const toRight = anchorPoint.x < width * .58
  const proposedX = toRight ? anchorPoint.x + 62 : anchorPoint.x - cardWidth - 62
  const cardX = Math.max(10, Math.min(width - cardWidth - 10, proposedX))
  const cardY = Math.max(12, Math.min(height - cardHeight - 12, anchorPoint.y - 62))

  ui.anchor.style.transform = `translate3d(${anchorPoint.x}px,${anchorPoint.y}px,0)`
  ui.anchor.style.opacity = point?.visible ? '1' : '.45'
  ui.card.style.transform = `translate3d(${cardX}px,${cardY}px,0)`
  lineToCard(anchorPoint, cardX, cardY, cardWidth)
  animationFrame = requestAnimationFrame(positionUi)
}

function choiceName(choice) {
  return labels.get(choice.targetCode) || candidateLabel(choice)
}

function renderCard() {
  if (!current) return
  const { choice, choices, sourceDef } = current
  const missing = choice.targetRole === 'rim' ? 'rim' : 'tire'
  const sourceLabel = sourceDef?.name || (choice.sourceRole === 'tire' ? 'Tire' : 'Rim')
  const detail = choice.targetRole === 'rim'
    ? 'This tire has no supported compatible rim at the same assembly position.'
    : 'This rim has no supported compatible tire at the same assembly position.'
  const choicesMarkup = choicesExpanded
    ? `<div class="smart-assembly-choices">${choices.map((item, index) => `
        <button class="smart-assembly-choice" data-smart-choice="${index}" ${installPending ? 'disabled' : ''}>
          <span>${escapeHtml(choiceName(item))}<small>${escapeHtml(item.targetCode)} · ${escapeHtml(item.familyId)}</small></span>
          <b>${item.confidence}</b>
        </button>`).join('')}</div>`
    : ''

  ui.card.innerHTML = `
    <small>Smart Assembly · ${escapeHtml(choice.familyId)}</small>
    <h3>${escapeHtml(sourceLabel)} has no ${missing}</h3>
    <p>${detail} BrickLab only suggests pairs from mechanically supported compatibility data.</p>
    ${choicesMarkup}
    <div class="smart-assembly-actions">
      <button class="primary" data-smart-install ${installPending ? 'disabled' : ''}>${installPending ? 'Installing…' : `Install best · ${escapeHtml(choiceName(choice))}`}</button>
      <button data-smart-choices ${installPending ? 'disabled' : ''}>${choicesExpanded ? 'Hide choices' : `Show choices (${choices.length})`}</button>
      <button class="quiet" data-smart-dismiss ${installPending ? 'disabled' : ''}>Not now</button>
    </div>
    <div class="smart-assembly-status">${installPending ? 'Loading normal BrickLab part…' : `${choice.confidence} compatibility · user action required`}</div>
  `

  ui.card.querySelector('[data-smart-install]')?.addEventListener('click', () => void installChoice(choice))
  ui.card.querySelector('[data-smart-choices]')?.addEventListener('click', () => {
    choicesExpanded = !choicesExpanded
    renderCard()
    positionUiOnce()
  })
  ui.card.querySelector('[data-smart-dismiss]')?.addEventListener('click', dismissCurrent)
  ui.card.querySelectorAll('[data-smart-choice]').forEach(button => {
    button.addEventListener('click', () => void installChoice(choices[Number(button.dataset.smartChoice)]))
  })
}

function positionUiOnce() {
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  positionUi()
}

async function hydrateChoiceNames(choices, signature) {
  await Promise.all(choices.map(async choice => {
    if (labels.has(choice.targetCode) || choice.targetDefinition?.name) return
    try {
      const metadata = await getLDrawMetadata(`${choice.targetCode}.dat`)
      labels.set(choice.targetCode, metadata.description || `LDraw ${choice.targetCode}`)
    } catch {
      labels.set(choice.targetCode, `LDraw ${choice.targetCode}`)
    }
  }))
  if (current && signature === lastSignature) renderCard()
}

function dismissCurrent() {
  if (!current) return
  dismissed.add(smartAssemblyDismissalKey(current.source, current.choice))
  hide()
}

async function installChoice(choice) {
  if (!current || installPending || !choice) return
  installPending = true
  renderCard()
  const source = current.source
  const sourceDef = current.sourceDef
  const originalGroupId = source.userData?.groupId ?? null
  try {
    let definition = choice.targetDefinition ?? subsystems.parts.get(choice.targetPartId)
    if (!definition) definition = await registerLDrawPartByFile(`${choice.targetCode}.dat`)
    globalThis.BrickLabLDrawMechanicalIntelligence?.sync?.()

    // Both visuals are bottom-normalized by runtime-v3. Resolve their real bounds before
    // insertion so the tyre and rim are centred on one another instead of merely sharing
    // the same floor-level origin. This also makes the accepted part appear immediately
    // from the canonical LDraw prototype cache rather than as a temporary placeholder.
    const sourceFile = sourceDef?.ldraw?.file
    const [sourcePayload, targetPayload] = await Promise.all([
      sourceFile ? preloadLDrawPrototype(sourceFile).catch(() => null) : Promise.resolve(null),
      preloadLDrawPrototype(`${choice.targetCode}.dat`).catch(() => null),
    ])

    const groupId = originalGroupId || globalThis.crypto?.randomUUID?.() || `assembly-${Date.now().toString(36)}`
    source.userData.groupId = groupId
    const placement = smartAssemblyPlacement(source, { ...choice, targetPartId:definition.id }, groupId, {
      sourceSize:sourcePayload?.metadata?.size ?? sourceDef?.ldraw?.size ?? null,
      targetSize:targetPayload?.metadata?.size ?? definition?.ldraw?.size ?? null,
    })
    const color = choice.targetRole === 'tire' ? 0x17191b : 0xadb5bd
    const inserted = subsystems.editor.insertPart(definition.id, {
      nearObject:source,
      parent:source.parent,
      position:placement.position,
      rotation:placement.rotation,
      groupId,
      color,
      persist:true,
    })
    if (!inserted) throw new Error('Editor did not return the inserted part')

    dismissed.add(smartAssemblyDismissalKey(source, choice))
    globalThis.dispatchEvent?.(new CustomEvent('bricklab:smartassemblyinstalled', {
      detail:{
        version:SMART_ASSEMBLY_ASSISTANT_VERSION,
        familyId:choice.familyId,
        sourceInstanceId:source.userData?.instanceId ?? null,
        insertedInstanceId:inserted.userData?.instanceId ?? null,
        insertedPartId:definition.id,
      },
    }))
    hide()
  } catch (error) {
    source.userData.groupId = originalGroupId
    console.error('[BrickLab Smart Assembly] Could not install compatible part', error)
    const status = ui.card.querySelector('.smart-assembly-status')
    if (status) status.textContent = `Could not install: ${error?.message || error}`
  } finally {
    installPending = false
    if (current) renderCard()
  }
}

function evaluate() {
  evaluationQueued = false
  if (!currentBuildMode()) return hide()
  const selection = guidanceSelection()
  if (selection.length !== 1) return hide()

  const source = selection[0]
  const sourceDef = sourceDefinitionFor(source)
  if (!sourceDef) return hide()
  const choices = compatibleAssemblyChoices(sourceDef, subsystems.parts.list())
  const choice = choices[0] ?? bestAssemblyChoice(sourceDef, subsystems.parts.list())
  if (!choice) return hide()
  if (dismissed.has(smartAssemblyDismissalKey(source, choice))) return hide()
  if (isCompatibleAssemblyPresent(source, sourceDef, subsystems.editor.objects(), value => subsystems.parts.get(value))) return hide()

  const signature = `${source.userData?.instanceId || ''}:${choice.familyId}:${choices.map(item => item.targetCode).join(',')}`
  if (signature === lastSignature && current) return
  lastSignature = signature
  current = { source, sourceDef, choice, choices }
  choicesExpanded = false
  ui.layer.hidden = false
  ui.layer.classList.add('is-visible')
  renderCard()
  positionUiOnce()
  void hydrateChoiceNames(choices, signature)
}

function scheduleEvaluation() {
  if (evaluationQueued) return
  evaluationQueued = true
  queueMicrotask(evaluate)
}

for (const eventName of [
  'bricklab:mechanicalintelligencechange',
  'bricklab:mechanicalintelligenceready',
  'bricklab:partcatalogchange',
  'bricklab:ldrawloaded',
  'bricklab:editorexternalmutation',
  'bricklab:editorselectionchange',
  'bricklab:editorgroupselection',
]) globalThis.addEventListener?.(eventName, scheduleEvaluation)

document.addEventListener('pointerup', scheduleEvaluation, true)
document.addEventListener('keyup', scheduleEvaluation, true)

const selectedIdNode = document.querySelector('#selectedId')
const selectionObserver = selectedIdNode && typeof globalThis.MutationObserver === 'function'
  ? new globalThis.MutationObserver(scheduleEvaluation)
  : null
selectionObserver?.observe(selectedIdNode, { childList:true, characterData:true, subtree:true })

const api = Object.freeze({
  version:SMART_ASSEMBLY_ASSISTANT_VERSION,
  compatibilityVersion:SMART_ASSEMBLY_COMPATIBILITY_VERSION,
  families:SMART_ASSEMBLY_FAMILIES,
  evaluate,
  current:() => current ? Object.freeze({
    familyId:current.choice.familyId,
    sourceInstanceId:current.source?.userData?.instanceId ?? null,
    sourcePartId:current.source?.userData?.partId ?? null,
    choices:current.choices.map(choice => Object.freeze({
      targetCode:choice.targetCode,
      targetPartId:choice.targetPartId,
      confidence:choice.confidence,
    })),
  }) : null,
  dismiss:dismissCurrent,
  installBest:() => current ? installChoice(current.choice) : Promise.resolve(null),
  resetDismissals() { dismissed.clear(); scheduleEvaluation() },
  destroy() {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    selectionObserver?.disconnect()
    ui.layer.remove()
  },
})

subsystems.guidance.bind(api)
globalThis.BrickLabSmartAssembly = api
globalThis.dispatchEvent?.(new CustomEvent('bricklab:smartassemblyready', {
  detail:{ version:api.version, families:api.families.length },
}))
scheduleEvaluation()
