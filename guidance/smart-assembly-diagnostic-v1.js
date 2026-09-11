export const SMART_ASSEMBLY_DIAGNOSTIC_VERSION = 'smart-assembly-diagnostic-v1.0.0'

const PANEL_ID = 'bricklabSmartAssemblyDiagnostic'
let phase = 'diagnostic-loaded'
let failure = null
let refreshQueued = false
let compatibilityPromise = null

function ensurePanel() {
  let panel = document.getElementById(PANEL_ID)
  if (panel) return panel
  panel = document.createElement('pre')
  panel.id = PANEL_ID
  panel.setAttribute('aria-live', 'polite')
  Object.assign(panel.style, {
    position:'fixed', left:'14px', bottom:'54px', zIndex:'2147483646',
    margin:'0', padding:'9px 11px', maxWidth:'min(620px, calc(100vw - 28px))',
    border:'1px solid rgba(255,184,77,.65)', borderRadius:'8px',
    background:'rgba(12,15,18,.94)', color:'#ffd08a', boxShadow:'0 8px 28px rgba(0,0,0,.42)',
    font:'11px/1.38 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    whiteSpace:'pre-wrap', pointerEvents:'none', userSelect:'text',
  })
  panel.textContent = 'SA DIAG · loading…'
  document.body.append(panel)
  return panel
}

function selectedFromInspector(subsystems, objects) {
  const inspector = document.querySelector('#inspector')
  const text = document.querySelector('#selectedId')?.textContent?.trim() || ''
  if (!inspector || inspector.classList.contains('hidden') || !text || text.includes('· +')) {
    return { text, prefix:'', object:null }
  }
  const prefix = text.split('·')[0]?.trim() || ''
  if (prefix.length < 4) return { text, prefix, object:null }
  const matches = objects.filter(object => String(object?.userData?.instanceId || '').startsWith(prefix))
  return { text, prefix, object:matches.length === 1 ? matches[0] : null }
}

function partCode(definition, object) {
  return String(
    definition?.ldraw?.code
    || definition?.ldraw?.file
    || object?.userData?.partId
    || '',
  ).replace(/^ldraw-/i,'').replace(/^parts\//i,'').replace(/\.dat$/i,'').trim()
}

async function compatibility() {
  compatibilityPromise ??= import('./assembly-compatibility-v1.js?v=smart-assembly-diagnostic-20260911-v1')
  return compatibilityPromise
}

async function buildSnapshot() {
  const subsystems = globalThis.BrickLabSubsystems
  const editorReady = Boolean(subsystems?.editor?.ready?.())
  const mode = subsystems?.editor?.mode?.() ?? document.querySelector('.mode.active')?.dataset?.mode ?? 'none'
  const apiSelection = editorReady ? (subsystems.editor.selection?.() ?? []) : []
  const objects = editorReady ? (subsystems.editor.objects?.() ?? []) : []
  const inspector = selectedFromInspector(subsystems, objects)
  const source = apiSelection.length === 1 ? apiSelection[0] : inspector.object
  const partId = source?.userData?.partId ?? 'none'
  const definition = source && subsystems?.parts?.get ? subsystems.parts.get(partId) : null
  const code = partCode(definition, source) || 'none'
  let choices = []
  let duplicate = false
  let compatibilityError = null
  try {
    if (definition) {
      const module = await compatibility()
      choices = module.compatibleAssemblyChoices(definition, subsystems.parts.list())
      duplicate = module.isCompatibleAssemblyPresent(
        source,
        definition,
        objects,
        value => subsystems.parts.get(value),
      )
    }
  } catch (error) {
    compatibilityError = String(error?.message || error)
  }

  const runtime = globalThis.BrickLabSmartAssembly
  const current = runtime?.current?.() ?? null
  const layer = document.querySelector('.smart-assembly-layer')
  const card = document.querySelector('.smart-assembly-card')
  let reason = 'ready-to-render'
  if (failure) reason = 'runtime-import-failed'
  else if (!editorReady) reason = 'editor-not-ready'
  else if (mode !== 'build') reason = `mode-${mode}`
  else if (apiSelection.length !== 1 && !inspector.object) reason = 'no-single-selection'
  else if (!source) reason = 'selected-object-unresolved'
  else if (!definition) reason = 'source-definition-missing'
  else if (!choices.length) reason = 'no-compatible-choice'
  else if (duplicate) reason = 'compatible-part-already-present'
  else if (!runtime) reason = 'runtime-not-installed'
  else if (!current) reason = 'runtime-hid-suggestion'
  else if (!layer) reason = 'ui-layer-missing'
  else if (layer.hidden) reason = 'ui-layer-hidden'
  else if (!card) reason = 'ui-card-missing'
  else reason = 'visible-or-positioning'

  return {
    phase, failure, editorReady, mode,
    apiSelectionCount:apiSelection.length,
    inspectorText:inspector.text || 'none',
    inspectorResolved:Boolean(inspector.object),
    objectCount:objects.length,
    partId, code,
    definition:Boolean(definition),
    choices:choices.map(choice => choice.targetCode),
    duplicate,
    runtimeVersion:runtime?.version ?? 'none',
    runtimeCurrent:current ? `${current.sourcePartId} -> ${current.choices?.map(choice => choice.targetCode).join(',')}` : 'none',
    layer:layer ? (layer.hidden ? 'hidden' : 'shown') : 'missing',
    card:Boolean(card),
    compatibilityError,
    reason,
  }
}

export async function refreshSmartAssemblyDiagnostic() {
  refreshQueued = false
  const panel = ensurePanel()
  const state = await buildSnapshot()
  panel.style.borderColor = state.failure ? 'rgba(255,91,91,.8)' : state.reason === 'visible-or-positioning' ? 'rgba(116,230,166,.7)' : 'rgba(255,184,77,.65)'
  panel.style.color = state.failure ? '#ff9a9a' : state.reason === 'visible-or-positioning' ? '#a8f3c7' : '#ffd08a'
  panel.textContent = [
    `SA DIAG ${SMART_ASSEMBLY_DIAGNOSTIC_VERSION} · ${state.phase}`,
    `reason=${state.reason} · mode=${state.mode} · editor=${state.editorReady ? 'ready' : 'no'}`,
    `selection api=${state.apiSelectionCount} inspector=${state.inspectorText} resolved=${state.inspectorResolved ? 'yes' : 'no'} objects=${state.objectCount}`,
    `part=${state.partId} · code=${state.code} · def=${state.definition ? 'yes' : 'no'} · choices=${state.choices.join(',') || 'none'} · duplicate=${state.duplicate ? 'yes' : 'no'}`,
    `runtime=${state.runtimeVersion} · current=${state.runtimeCurrent} · layer=${state.layer} · card=${state.card ? 'yes' : 'no'}`,
    state.compatibilityError ? `compat-error=${state.compatibilityError}` : '',
    state.failure ? `error=${state.failure}` : '',
  ].filter(Boolean).join('\n')
  globalThis.__bricklabSmartAssemblyDiagnosticState = Object.freeze(state)
  return state
}

function scheduleRefresh() {
  if (refreshQueued) return
  refreshQueued = true
  queueMicrotask(() => void refreshSmartAssemblyDiagnostic())
}

export function setSmartAssemblyDiagnosticPhase(next) {
  phase = String(next || 'unknown')
  scheduleRefresh()
}

export function failSmartAssemblyDiagnostic(error) {
  failure = String(error?.stack || error?.message || error || 'unknown error')
  phase = 'failed'
  scheduleRefresh()
}

const selectedIdNode = document.querySelector('#selectedId')
if (selectedIdNode && typeof MutationObserver === 'function') {
  const observer = new MutationObserver(scheduleRefresh)
  observer.observe(selectedIdNode, { childList:true, characterData:true, subtree:true })
}

document.addEventListener('click', scheduleRefresh, false)
for (const name of ['bricklab:partcatalogchange','bricklab:ldrawloaded','bricklab:smartassemblyready','bricklab:smartassemblyinstalled']) {
  globalThis.addEventListener?.(name, scheduleRefresh)
}

globalThis.BrickLabSmartAssemblyDiagnostic = Object.freeze({
  version:SMART_ASSEMBLY_DIAGNOSTIC_VERSION,
  refresh:refreshSmartAssemblyDiagnostic,
  setPhase:setSmartAssemblyDiagnosticPhase,
  fail:failSmartAssemblyDiagnostic,
  state:() => globalThis.__bricklabSmartAssemblyDiagnosticState ?? null,
})

ensurePanel()
scheduleRefresh()
