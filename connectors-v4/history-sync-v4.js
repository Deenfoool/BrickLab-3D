export const HISTORY_SYNC_VERSION_V4 = 'connector-history-sync-v4.1.0'

const PROJECT_KEYS = new Set(['bricklab.project.v2', 'bricklab.project.v1'])
const MAX_SNAPSHOTS = 96
const snapshots = new Map()
const graphOnlyUndo = []
const graphOnlyRedo = []
let currentFingerprint = null
let pendingGraphTransition = null
let restoreOnNextProjectWrite = false
let importInFlight = false
let importTimer = 0

function runtime() { return globalThis.BrickLabConnectorV4 ?? null }
function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) }

function localStorageSafe() {
  try { return globalThis.localStorage ?? null } catch { return null }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
      .filter(key => !['savedAt','connectionsV4','connectorSystemV4'].includes(key))
      .sort()
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprintJson(text) {
  try {
    const parsed = JSON.parse(text)
    if (!parsed || !Array.isArray(parsed.parts)) return null
    return canonical(parsed)
  } catch { return null }
}

function currentGraph() {
  try { return clone(runtime()?.projectConnections?.() ?? []) } catch { return [] }
}

function setSnapshot(fingerprint, records) {
  if (!fingerprint) return
  if (snapshots.has(fingerprint)) snapshots.delete(fingerprint)
  snapshots.set(fingerprint, clone(records ?? []))
  while (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value)
}

function sameGraph(a, b) {
  try { return JSON.stringify(a ?? []) === JSON.stringify(b ?? []) } catch { return false }
}

function queueGraphTransition(before, after, cause) {
  if (sameGraph(before, after)) return
  if (!pendingGraphTransition) {
    pendingGraphTransition = { before:clone(before), after:clone(after), cause:String(cause || 'graph-change') }
  } else {
    pendingGraphTransition.after = clone(after)
    pendingGraphTransition.cause = `${pendingGraphTransition.cause}+${String(cause || 'graph-change')}`
  }
  graphOnlyRedo.length = 0
}

function finalizePendingAsGraphOnly() {
  if (!pendingGraphTransition || !currentFingerprint) return false
  if (!sameGraph(pendingGraphTransition.before, pendingGraphTransition.after)) {
    graphOnlyUndo.push({
      fingerprint:currentFingerprint,
      before:clone(pendingGraphTransition.before),
      after:clone(pendingGraphTransition.after),
      cause:pendingGraphTransition.cause,
    })
    setSnapshot(currentFingerprint, pendingGraphTransition.after)
  }
  pendingGraphTransition = null
  return true
}

function restoreGraph(records, reason) {
  const v4 = runtime()
  if (!v4?.restoreConnections) return false
  const result = v4.restoreConnections(records ?? [], { replace:true })
  window.dispatchEvent(new CustomEvent('bricklab:connectorv4history', {
    detail:{ version:HISTORY_SYNC_VERSION_V4, reason, ...result },
  }))
  return result.rejected === 0
}

function undoGraphOnly(event) {
  finalizePendingAsGraphOnly()
  const entry = graphOnlyUndo.at(-1)
  if (!entry || entry.fingerprint !== currentFingerprint) return false
  event.preventDefault?.()
  event.stopImmediatePropagation?.()
  graphOnlyUndo.pop()
  if (!restoreGraph(entry.before, 'undo-graph-only')) return true
  setSnapshot(currentFingerprint, entry.before)
  graphOnlyRedo.push(entry)
  return true
}

function redoGraphOnly(event) {
  const entry = graphOnlyRedo.at(-1)
  if (!entry || entry.fingerprint !== currentFingerprint) return false
  event.preventDefault?.()
  event.stopImmediatePropagation?.()
  graphOnlyRedo.pop()
  if (!restoreGraph(entry.after, 'redo-graph-only')) return true
  setSnapshot(currentFingerprint, entry.after)
  graphOnlyUndo.push(entry)
  return true
}

function prepareGeometryHistoryTraversal(direction, event) {
  if (direction === 'undo' && undoGraphOnly(event)) return true
  if (direction === 'redo' && redoGraphOnly(event)) return true
  restoreOnNextProjectWrite = true
  return false
}

function typingTarget(target) {
  return target instanceof HTMLElement && (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable)
}

window.addEventListener('keydown', event => {
  if (typingTarget(event.target)) return
  const mod = event.ctrlKey || event.metaKey
  if (!mod) return
  if (event.code === 'KeyZ' && !event.shiftKey) prepareGeometryHistoryTraversal('undo', event)
  else if ((event.code === 'KeyZ' && event.shiftKey) || event.code === 'KeyY') prepareGeometryHistoryTraversal('redo', event)
}, true)

document.addEventListener('click', event => {
  const button = event.target?.closest?.('#undoBtn,#redoBtn')
  if (!button) return
  prepareGeometryHistoryTraversal(button.id === 'undoBtn' ? 'undo' : 'redo', event)
}, true)

document.addEventListener('change', event => {
  if (event.target?.id !== 'importFile' || !event.target.files?.length) return
  importInFlight = true
  clearTimeout(importTimer)
  importTimer = setTimeout(() => { importInFlight = false }, 4000)
  pendingGraphTransition = null
  graphOnlyUndo.length = 0
  graphOnlyRedo.length = 0
}, true)

window.addEventListener('bricklab:connectorv4projectimport', () => {
  importInFlight = false
  clearTimeout(importTimer)
  if (currentFingerprint) setSnapshot(currentFingerprint, currentGraph())
})

window.addEventListener('bricklab:connectorv4graphchange', event => {
  const before = event.detail?.before
  const after = event.detail?.after
  if (Array.isArray(before) && Array.isArray(after)) queueGraphTransition(before, after, event.detail?.cause)
})

window.addEventListener('bricklab:connectorv4commit', event => {
  const after = currentGraph()
  const id = event.detail?.connectionId
  const before = id ? after.filter(connection => connection.id !== id) : []
  queueGraphTransition(before, after, 'commit')
})

// The editor stores every committed/undo/redo project state through localStorage.
// Intercept only BrickLab's project keys and associate the exact geometry state with
// the exact V4 graph state. No project payload is modified here.
const StorageCtor = globalThis.Storage
if (StorageCtor?.prototype?.setItem && !StorageCtor.prototype.setItem.__bricklabConnectorV4History) {
  const originalSetItem = StorageCtor.prototype.setItem
  function setItemWithV4History(key, value) {
    const target = localStorageSafe()
    if (this === target && PROJECT_KEYS.has(String(key))) {
      const nextFingerprint = fingerprintJson(String(value))
      if (nextFingerprint) {
        if (restoreOnNextProjectWrite && !importInFlight) {
          const remembered = snapshots.get(nextFingerprint)
          if (remembered) restoreGraph(remembered, 'geometry-history-traversal')
          currentFingerprint = nextFingerprint
          restoreOnNextProjectWrite = false
          pendingGraphTransition = null
        } else {
          if (pendingGraphTransition) {
            if (currentFingerprint && nextFingerprint === currentFingerprint) finalizePendingAsGraphOnly()
            else pendingGraphTransition = null
          }
          currentFingerprint = nextFingerprint
          setSnapshot(currentFingerprint, currentGraph())
          if (!importInFlight) graphOnlyRedo.length = 0
        }
      }
    }
    return originalSetItem.call(this, key, value)
  }
  Object.defineProperty(setItemWithV4History, '__bricklabConnectorV4History', { value:true })
  StorageCtor.prototype.setItem = setItemWithV4History
}

// Seed the current persisted base state before app.js re-saves it during loadLocal().
try {
  const storage = localStorageSafe()
  const raw = storage?.getItem('bricklab.project.v2') || storage?.getItem('bricklab.project.v1')
  if (raw) {
    currentFingerprint = fingerprintJson(raw)
    if (currentFingerprint) setSnapshot(currentFingerprint, currentGraph())
  }
} catch { /* storage is optional */ }

globalThis.BrickLabConnectorV4HistorySync = Object.freeze({
  version:HISTORY_SYNC_VERSION_V4,
  stats() {
    return {
      snapshots:snapshots.size,
      graphOnlyUndo:graphOnlyUndo.length,
      graphOnlyRedo:graphOnlyRedo.length,
      pending:Boolean(pendingGraphTransition),
      current:Boolean(currentFingerprint),
      importInFlight,
    }
  },
  captureCurrent() {
    if (currentFingerprint) setSnapshot(currentFingerprint, currentGraph())
  },
})
