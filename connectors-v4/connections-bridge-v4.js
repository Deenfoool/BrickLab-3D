import * as V3 from '../connections-v3.js'

export * from '../connections-v3.js'

export const CONNECTIONS_BRIDGE_VERSION_V4 = 'connector-connections-bridge-v4.1.1'

function snapshot(v4) {
  try { return v4?.projectConnections?.() ?? [] } catch { return [] }
}

export function removeConnectionsForPart(connections, instanceId, {preserveV4=false}={}) {
  try {
    const v4 = globalThis.BrickLabConnectorV4
    const before = snapshot(v4)
    const removed = preserveV4 ? 0 : (v4?.removePartConnections?.(instanceId) ?? 0)
    if (removed > 0) {
      const after = snapshot(v4)
      window.dispatchEvent(new CustomEvent('bricklab:connectorv4graphchange', {
        detail:{
          version:CONNECTIONS_BRIDGE_VERSION_V4,
          cause:'remove-part',
          instanceId,
          removed,
          before,
          after,
        },
      }))
    }
  } catch (error) {
    // Legacy graph removal must never be blocked by V4 diagnostics.
    console.warn('[BrickLab Connector V4] Could not remove V4 links for part; V3 removal continues.', error)
  }
  return V3.removeConnectionsForPart(connections, instanceId)
}
