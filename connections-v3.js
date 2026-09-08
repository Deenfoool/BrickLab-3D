import { CONNECTOR_SYSTEM_VERSION, CONNECTOR_RULES_V3, connectorRuleV3 } from './connector-rules-v3.js'

export const CONNECTOR_RULE_VERSION = CONNECTOR_SYSTEM_VERSION
export const CONNECTOR_SCHEMA_VERSION = 3
export const CONNECTOR_RULES = CONNECTOR_RULES_V3

const pendingBundles = new Map()
const BUNDLE_TTL_MS = 1200
const nowMs = () => globalThis.performance?.now?.() ?? Date.now()

export function endpointKey(instanceId, connectorId) {
  return `${instanceId}::${connectorId}`
}

export function connectorRule(typeA, typeB) {
  return connectorRuleV3(typeA, typeB)
}

export function connectorTypesCompatible(typeA, typeB) {
  return Boolean(connectorRule(typeA, typeB))
}

export function connectionKind(typeA, typeB) {
  return connectorRule(typeA, typeB)?.kind ?? 'generic'
}

function validEndpoint(endpoint) {
  return Boolean(endpoint?.instanceId && endpoint?.connectorId)
}

function pairSignature(a, b) {
  return [endpointKey(a.instanceId, a.connectorId), endpointKey(b.instanceId, b.connectorId)].sort().join('<>')
}

export function connectionEndpoints(connection) {
  const result = []
  const seen = new Set()
  const add = endpoint => {
    if (!validEndpoint(endpoint)) return
    const key = endpointKey(endpoint.instanceId, endpoint.connectorId)
    if (seen.has(key)) return
    seen.add(key)
    result.push(endpoint)
  }
  add(connection?.a)
  add(connection?.b)
  for (const contact of connection?.contacts ?? []) {
    add(contact?.a)
    add(contact?.b)
  }
  return result
}

export function connectionEndpointKeys(connection) {
  return connectionEndpoints(connection).map(endpoint => endpointKey(endpoint.instanceId, endpoint.connectorId))
}

export function connectionSignature(connection) {
  if (!validEndpoint(connection?.a) || !validEndpoint(connection?.b)) return ''
  return `${connection.kind ?? 'generic'}:${pairSignature(connection.a, connection.b)}`
}

function bundleKey(sourceObject, sourceConnector, targetObject, targetConnector) {
  return [sourceObject?.userData?.instanceId, sourceConnector?.id, targetObject?.userData?.instanceId, targetConnector?.id].join('::')
}

function pruneBundles(now = nowMs()) {
  for (const [key, bundle] of pendingBundles) {
    if (!bundle || now - bundle.createdAt > BUNDLE_TTL_MS) pendingBundles.delete(key)
  }
}

export function stageConnectionBundle(sourceObject, sourceConnector, targetObject, targetConnector, contacts = []) {
  if (!connectorRule(sourceConnector?.type, targetConnector?.type)?.multiContact) return
  const unique = new Map()
  for (const contact of contacts) {
    if (!validEndpoint(contact?.a) || !validEndpoint(contact?.b)) continue
    unique.set(pairSignature(contact.a, contact.b), contact)
  }
  const now = nowMs()
  pruneBundles(now)
  pendingBundles.set(bundleKey(sourceObject, sourceConnector, targetObject, targetConnector), {
    contacts: [...unique.values()],
    createdAt: now,
  })
}

function consumeConnectionBundle(sourceObject, sourceConnector, targetObject, targetConnector) {
  const now = nowMs()
  pruneBundles(now)
  const key = bundleKey(sourceObject, sourceConnector, targetObject, targetConnector)
  const bundle = pendingBundles.get(key)
  pendingBundles.delete(key)
  if (!bundle || now - bundle.createdAt > BUNDLE_TTL_MS) return []
  return bundle.contacts
}

export function isEndpointOccupied(connections, instanceId, connectorId) {
  const wanted = endpointKey(instanceId, connectorId)
  return (connections ?? []).some(connection => connectionEndpointKeys(connection).includes(wanted))
}

export function connectionsForPart(connections, instanceId) {
  return (connections ?? []).filter(connection => connectionEndpoints(connection).some(endpoint => endpoint.instanceId === instanceId))
}

export function removeConnectionsForPart(connections, instanceId) {
  return (connections ?? []).filter(connection => !connectionEndpoints(connection).some(endpoint => endpoint.instanceId === instanceId))
}

export function createConnection(sourceObject, sourceConnector, targetObject, targetConnector) {
  const rule = connectorRule(sourceConnector.type, targetConnector.type)
  const contacts = rule?.multiContact ? consumeConnectionBundle(sourceObject, sourceConnector, targetObject, targetConnector) : []
  const primarySignature = pairSignature(
    { instanceId: sourceObject.userData.instanceId, connectorId: sourceConnector.id },
    { instanceId: targetObject.userData.instanceId, connectorId: targetConnector.id },
  )
  const extras = []
  const seen = new Set([primarySignature])
  for (const contact of contacts) {
    const signature = pairSignature(contact.a, contact.b)
    if (seen.has(signature)) continue
    seen.add(signature)
    extras.push(contact)
  }

  return {
    id: crypto.randomUUID(),
    schemaVersion: CONNECTOR_SCHEMA_VERSION,
    kind: rule?.kind ?? 'generic',
    ruleVersion: CONNECTOR_RULE_VERSION,
    contactCount: 1 + extras.length,
    a: {
      instanceId: sourceObject.userData.instanceId,
      connectorId: sourceConnector.id,
      connectorType: sourceConnector.type,
    },
    b: {
      instanceId: targetObject.userData.instanceId,
      connectorId: targetConnector.id,
      connectorType: targetConnector.type,
    },
    ...(extras.length ? { contacts: extras } : {}),
  }
}
