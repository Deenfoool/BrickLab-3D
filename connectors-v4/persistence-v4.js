export const PROJECT_GRAPH_STORAGE_KEY_V4 = 'bricklab.connector-v4.graph.v1'
export const PROJECT_GRAPH_PERSISTENCE_VERSION_V4 = 'connector-project-graph-v4.1.0'
const MAX_CONNECTIONS = 10000

function storageOrNull(storage) {
  if (storage) return storage
  try { return globalThis.localStorage ?? null } catch { return null }
}

function validRecord(record) {
  return Boolean(
    record && record.schemaVersion === 4 && typeof record.id === 'string' && record.id &&
    record.a?.instanceId && record.a?.endpointId && record.b?.instanceId && record.b?.endpointId &&
    record.a.instanceId !== record.b.instanceId
  )
}

export function graphEnvelopeV4(graph) {
  const connections = typeof graph?.list === 'function' ? graph.list() : []
  return {
    version:4,
    persistenceVersion:PROJECT_GRAPH_PERSISTENCE_VERSION_V4,
    savedAt:new Date().toISOString(),
    connections:connections.slice(0,MAX_CONNECTIONS),
  }
}

export function persistGraphV4(graph, storage = null) {
  const target = storageOrNull(storage)
  if (!target) return { saved:false, reason:'storage-unavailable' }
  try {
    const envelope = graphEnvelopeV4(graph)
    target.setItem(PROJECT_GRAPH_STORAGE_KEY_V4, JSON.stringify(envelope))
    return { saved:true, count:envelope.connections.length }
  } catch (error) {
    return { saved:false, reason:'storage-error', error:String(error?.message || error) }
  }
}

export function restoreRecordsIntoGraphV4(graph, records, { replace = true } = {}) {
  if (!graph?.add || !graph?.clear) return { restored:0, rejected:0, errors:['graph-unavailable'] }
  if (replace) graph.clear()
  const list = Array.isArray(records) ? records.slice(0,MAX_CONNECTIONS) : []
  let restored = 0
  let rejected = 0
  const errors = []
  for (const record of list) {
    if (!validRecord(record)) { rejected += 1; continue }
    try {
      const result = graph.add(record)
      if (result?.accepted) restored += 1
      else { rejected += 1; errors.push(`${record.id}:${result?.reason || 'rejected'}`) }
    } catch (error) {
      rejected += 1
      errors.push(`${record.id}:${String(error?.message || error)}`)
    }
  }
  return { restored, rejected, errors }
}

export function restorePersistedGraphV4(graph, storage = null, options = {}) {
  const target = storageOrNull(storage)
  if (!target) return { restored:0, rejected:0, errors:['storage-unavailable'] }
  try {
    const raw = target.getItem(PROJECT_GRAPH_STORAGE_KEY_V4)
    if (!raw) return { restored:0, rejected:0, errors:[] }
    const envelope = JSON.parse(raw)
    if (envelope?.version !== 4 || !Array.isArray(envelope.connections)) {
      return { restored:0, rejected:0, errors:['invalid-envelope'] }
    }
    return restoreRecordsIntoGraphV4(graph, envelope.connections, options)
  } catch (error) {
    return { restored:0, rejected:0, errors:[String(error?.message || error)] }
  }
}

export function clearPersistedGraphV4(storage = null) {
  const target = storageOrNull(storage)
  if (!target) return false
  try { target.removeItem(PROJECT_GRAPH_STORAGE_KEY_V4); return true } catch { return false }
}

export function pruneGraphForObjectsV4(graph, objects) {
  if (!graph?.list || !graph?.remove) return { removed:0, kept:0, reasons:[] }
  const byId = new Map((objects ?? []).filter(Boolean).map(object => [object.userData?.instanceId, object]))
  let removed = 0
  const reasons = []
  for (const record of graph.list()) {
    const objectA = byId.get(record.a?.instanceId)
    const objectB = byId.get(record.b?.instanceId)
    let reason = null
    if (!objectA || !objectB) reason = 'missing-object'
    else if (record.a?.partId && objectA.userData?.partId !== record.a.partId) reason = 'part-a-mismatch'
    else if (record.b?.partId && objectB.userData?.partId !== record.b.partId) reason = 'part-b-mismatch'
    if (!reason) continue
    if (graph.remove(record.id)) {
      removed += 1
      reasons.push({ connectionId:record.id, reason })
    }
  }
  return { removed, kept:graph.list().length, reasons }
}

export function projectWithConnectionsV4(project, graph) {
  if (!project || typeof project !== 'object') return project
  return {
    ...project,
    connectorSystemV4: {
      version:4,
      persistenceVersion:PROJECT_GRAPH_PERSISTENCE_VERSION_V4,
    },
    connectionsV4: typeof graph?.list === 'function' ? graph.list() : [],
  }
}
