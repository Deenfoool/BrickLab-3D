export function endpointKey(instanceId, connectorId) {
  return `${instanceId}::${connectorId}`
}

export function isEndpointOccupied(connections, instanceId, connectorId) {
  const key = endpointKey(instanceId, connectorId)
  return connections.some(connection =>
    endpointKey(connection.a.instanceId, connection.a.connectorId) === key ||
    endpointKey(connection.b.instanceId, connection.b.connectorId) === key
  )
}

export function connectionsForPart(connections, instanceId) {
  return connections.filter(connection =>
    connection.a.instanceId === instanceId || connection.b.instanceId === instanceId
  )
}

export function removeConnectionsForPart(connections, instanceId) {
  return connections.filter(connection =>
    connection.a.instanceId !== instanceId && connection.b.instanceId !== instanceId
  )
}

export function connectionKind(typeA, typeB) {
  const types = new Set([typeA, typeB])
  if (types.has('stud') && types.has('tube')) return 'fixed'
  if (types.has('pin') && types.has('pin-hole')) return 'hinge'
  if (types.has('axle') && types.has('pin-hole')) return 'bearing'
  if (types.has('axle') && types.has('axle-hole')) return 'axle'
  return 'generic'
}

export function createConnection(sourceObject, sourceConnector, targetObject, targetConnector) {
  return {
    id: crypto.randomUUID(),
    kind: connectionKind(sourceConnector.type, targetConnector.type),
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
  }
}
