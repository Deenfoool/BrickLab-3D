export const CONNECTOR_V4_INSPECTOR_SYNC_VERSION = 'connector-v4-inspector-sync-v1.0.0'

const subsystems = globalThis.BrickLabSubsystems
const v4 = globalThis.BrickLabConnectorV4
if (!subsystems?.editor?.ready?.() || !v4?.projectConnections) {
  throw new Error('Connector V4 inspector sync requires the bound editor and Connector V4 runtime')
}

const state = {
  selectionKey:null,
  scheduled:false,
  legacyCount:0,
  baseListHtml:'',
  baseDisconnectDisabled:true,
  renderedCount:null,
  renderedListHtml:null,
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  })[char])
}

function selectedObject() {
  return subsystems.editor.primarySelection?.() ?? subsystems.editor.selection?.().at(-1) ?? null
}

function linksFor(instanceId) {
  return v4.projectConnections().filter(record =>
    record?.a?.instanceId === instanceId || record?.b?.instanceId === instanceId)
}

function endpointIdsFor(instanceId, links) {
  const ids = new Set()
  for (const record of links) {
    if (record?.a?.instanceId === instanceId && record.a.endpointId) ids.add(record.a.endpointId)
    if (record?.b?.instanceId === instanceId && record.b.endpointId) ids.add(record.b.endpointId)
  }
  return ids
}

function v4Chip(record, instanceId) {
  const own = record.a?.instanceId === instanceId ? record.a : record.b
  const other = record.a?.instanceId === instanceId ? record.b : record.a
  const otherName = subsystems.parts.get(other?.partId)?.name ?? 'Part'
  const family = record.activation?.family ?? record.match?.family ?? own?.family ?? 'connector-v4'
  const endpoint = other?.family
    ? `${other.family}${other.gender ? ` · ${other.gender}` : ''}`
    : (other?.endpointId ?? 'endpoint')
  return `<div class="connection-chip connector-v4-chip"><span>V4 · ${escapeHtml(family)}</span><b>${escapeHtml(otherName)} · ${escapeHtml(endpoint)}</b></div>`
}

function captureLegacyUi(countNode, listNode, disconnectButton, force = false) {
  const countText = countNode?.textContent?.trim() ?? ''
  const listHtml = listNode?.innerHTML ?? ''

  if (force || countText !== state.renderedCount) {
    const parsed = Number(countText)
    state.legacyCount = Number.isFinite(parsed) ? parsed : 0
    state.baseDisconnectDisabled = Boolean(disconnectButton?.disabled)
  }
  if (force || listHtml !== state.renderedListHtml) state.baseListHtml = listHtml
}

function resetSelectionState(key) {
  state.selectionKey = key
  state.legacyCount = 0
  state.baseListHtml = ''
  state.baseDisconnectDisabled = true
  state.renderedCount = null
  state.renderedListHtml = null
}

function syncInspector() {
  state.scheduled = false
  const object = selectedObject()
  if (!object?.userData?.instanceId) return

  const instanceId = object.userData.instanceId
  const partId = object.userData.partId
  const key = `${instanceId}::${partId ?? ''}`
  const selectionChanged = key !== state.selectionKey
  if (selectionChanged) resetSelectionState(key)

  const connectorNode = document.querySelector('#connectorState')
  const countNode = document.querySelector('#connectionState')
  const listNode = document.querySelector('#connectionsList')
  const disconnectButton = document.querySelector('#disconnectBtn')
  if (!connectorNode || !countNode || !listNode || !disconnectButton) return

  captureLegacyUi(countNode, listNode, disconnectButton, selectionChanged)

  const connectivity = v4.get?.(partId)
  const links = linksFor(instanceId)
  const endpoints = Array.isArray(connectivity?.connectors) ? connectivity.connectors : []

  // If Connector V4 has no evidence for this part, leave the legacy inspector exactly
  // as app.js rendered it. This keeps old/basic parts on the established V3 UI path.
  if (!endpoints.length && !links.length) return

  const occupiedEndpointIds = endpointIdsFor(instanceId, links)
  const connectorText = `${occupiedEndpointIds.size} / ${endpoints.length}`
  if (connectorNode.textContent !== connectorText) connectorNode.textContent = connectorText

  const totalLinks = state.legacyCount + links.length
  const countText = String(totalLinks)
  if (countNode.textContent !== countText) countNode.textContent = countText
  state.renderedCount = countText

  const legacyHtml = /connection-empty/.test(state.baseListHtml) && links.length
    ? ''
    : state.baseListHtml
  const v4Html = links.map(record => v4Chip(record, instanceId)).join('')
  const listHtml = `${legacyHtml}${v4Html}` || '<div class="connection-empty">No graph links</div>'
  if (listNode.innerHTML !== listHtml) listNode.innerHTML = listHtml
  state.renderedListHtml = listHtml

  // app.js disables this button from its legacy-only selection graph. A V4-only link
  // must still be disconnectable through the existing disconnectSelected() path,
  // whose connections bridge already removes V4 records when preserveV4=false.
  const disabled = state.baseDisconnectDisabled && links.length === 0
  if (disconnectButton.disabled !== disabled) disconnectButton.disabled = disabled
}

function scheduleSync() {
  if (state.scheduled) return
  state.scheduled = true
  queueMicrotask(syncInspector)
}

for (const eventName of [
  'bricklab:editorselectionchange',
  'bricklab:connectorv4',
  'bricklab:connectorv4commit',
  'bricklab:connectorv4graphchange',
  'bricklab:connectorv4reconcile',
  'bricklab:editorexternalmutation',
  'bricklab:ldrawloaded',
]) globalThis.addEventListener?.(eventName, scheduleSync)

// app.js legitimately rewrites the mechanics section on selection and transform
// changes. Observe those writes and re-apply the V4 view in the next microtask rather
// than polling or taking ownership of the Inspector.
const inspector = document.querySelector('#inspector')
const observer = inspector && typeof MutationObserver === 'function'
  ? new MutationObserver(scheduleSync)
  : null
observer?.observe(inspector, {
  subtree:true,
  childList:true,
  characterData:true,
  attributes:true,
  attributeFilter:['disabled'],
})

scheduleSync()

globalThis.BrickLabConnectorV4InspectorSync = Object.freeze({
  version:CONNECTOR_V4_INSPECTOR_SYNC_VERSION,
  refresh:syncInspector,
  destroy(){ observer?.disconnect?.() },
})
