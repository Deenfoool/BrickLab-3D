const RULE_VERSION = 'connector-system-v2'

const RULES = new Map([
  ['stud|tube', { kind: 'fixed', axis: 'opposed', captureDistance: 0.46, minAlignment: 0.92, multiContact: true }],
  ['pin|pin-hole', { kind: 'hinge', axis: 'parallel', captureDistance: 0.42, minAlignment: 0.88 }],
  ['axle|pin-hole', { kind: 'bearing', axis: 'parallel', captureDistance: 0.40, minAlignment: 0.90 }],
  ['axle|axle-hole', { kind: 'axle', axis: 'parallel', captureDistance: 0.38, minAlignment: 0.92, keyed: true }],
])

const pendingBundles = new Map()

function pairKey(typeA, typeB) {
  return [typeA, typeB].sort().join('|')
}

function pendingKey(sourceObject, sourceConnector, targetObject, targetConnector) {
  return [
    sourceObject?.userData?.instanceId,
    sourceConnector?.id,
    targetObject?.userData?.instanceId,
    targetConnector?.id,
  ].join('::')
}

export function endpointKey(instanceId, connectorId) {
  return `${instanceId}::${connectorId}`
}

export function connectorRule(typeA, typeB) {
  return RULES.get(pairKey(typeA, typeB)) ?? null
}

export function connectorTypesCompatible(typeA, typeB) {
  return Boolean(connectorRule(typeA, typeB))
}

export function connectionKind(typeA, typeB) {
  return connectorRule(typeA, typeB)?.kind ?? 'generic'
}

export function stageConnectionBundle(sourceObject, sourceConnector, targetObject, targetConnector, contacts = []) {
  const key = pendingKey(sourceObject, sourceConnector, targetObject, targetConnector)
  const safeContacts = contacts.filter(contact =>
    contact?.a?.instanceId && contact?.a?.connectorId &&
    contact?.b?.instanceId && contact?.b?.connectorId
  )
  pendingBundles.set(key, { contacts: safeContacts, createdAt: performance.now?.() ?? Date.now() })
}

function consumeConnectionBundle(sourceObject, sourceConnector, targetObject, targetConnector) {
  const key = pendingKey(sourceObject, sourceConnector, targetObject, targetConnector)
  const pending = pendingBundles.get(key)
  pendingBundles.delete(key)
  if (!pending) return []
  const now = performance.now?.() ?? Date.now()
  return now - pending.createdAt < 1500 ? pending.contacts : []
}

function connectionEndpoints(connection) {
  const endpoints = []
  if (connection?.a) endpoints.push(connection.a)
  if (connection?.b) endpoints.push(connection.b)
  for (const contact of connection?.contacts ?? []) {
    if (contact?.a) endpoints.push(contact.a)
    if (contact?.b) endpoints.push(contact.b)
  }
  return endpoints
}

export function isEndpointOccupied(connections, instanceId, connectorId) {
  const key = endpointKey(instanceId, connectorId)
  return connections.some(connection =>
    connectionEndpoints(connection).some(endpoint => endpointKey(endpoint.instanceId, endpoint.connectorId) === key)
  )
}

export function connectionsForPart(connections, instanceId) {
  return connections.filter(connection =>
    connectionEndpoints(connection).some(endpoint => endpoint.instanceId === instanceId)
  )
}

export function removeConnectionsForPart(connections, instanceId) {
  return connections.filter(connection =>
    !connectionEndpoints(connection).some(endpoint => endpoint.instanceId === instanceId)
  )
}

export function createConnection(sourceObject, sourceConnector, targetObject, targetConnector) {
  const rule = connectorRule(sourceConnector.type, targetConnector.type)
  const contacts = consumeConnectionBundle(sourceObject, sourceConnector, targetObject, targetConnector)
  const primaryA = endpointKey(sourceObject.userData.instanceId, sourceConnector.id)
  const primaryB = endpointKey(targetObject.userData.instanceId, targetConnector.id)

  const extras = contacts.filter(contact => {
    const a = endpointKey(contact.a.instanceId, contact.a.connectorId)
    const b = endpointKey(contact.b.instanceId, contact.b.connectorId)
    return !(a === primaryA && b === primaryB) && !(a === primaryB && b === primaryA)
  })

  return {
    id: crypto.randomUUID(),
    kind: rule?.kind ?? 'generic',
    ruleVersion: RULE_VERSION,
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

export const CONNECTOR_RULE_VERSION = RULE_VERSION
export const CONNECTOR_RULES = Object.freeze(Object.fromEntries(RULES))
