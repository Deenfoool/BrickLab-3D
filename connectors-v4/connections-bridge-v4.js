import * as V3 from '../connections-v3.js'

export * from '../connections-v3.js'

export const CONNECTIONS_BRIDGE_VERSION_V4 = 'connector-connections-bridge-v4.1.0'

export function removeConnectionsForPart(connections, instanceId) {
  try {
    globalThis.BrickLabConnectorV4?.removePartConnections?.(instanceId)
  } catch (error) {
    // Legacy graph removal must never be blocked by V4 diagnostics.
    console.warn('[BrickLab Connector V4] Could not remove V4 links for part; V3 removal continues.', error)
  }
  return V3.removeConnectionsForPart(connections, instanceId)
}
