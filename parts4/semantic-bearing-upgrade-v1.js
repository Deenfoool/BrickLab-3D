import { PARTS } from '../parts.js'

export const PARTS4_SEMANTIC_BEARINGS_VERSION = 'parts-4-semantic-bearings-v1'

function setBearingPorts(partId, mechanicsKey, connectorIds) {
  const part = PARTS.find(item => item.id === partId)
  const mechanics = part?.mechanics?.[mechanicsKey]
  if (!part || !mechanics) return false

  const valid = connectorIds.filter(id => part.connectors?.some(connector => connector.id === id && connector.type === 'axle-hole'))
  if (valid.length !== connectorIds.length) {
    console.warn(`[BrickLab] ${partId} semantic bearing ports are incomplete`, { expected: connectorIds, valid })
    return false
  }

  mechanics.bearingConnectorIds = [...connectorIds]
  return true
}

const installed = {
  worm: setBearingPorts('worm-drive-8', 'transmission', ['input', 'output']),
  gearbox: setBearingPorts('gearbox-fnr', 'transmission', ['input', 'output']),
  differential: setBearingPorts('open-differential', 'differential', ['input', 'left', 'right']),
}

globalThis.BrickLabParts4SemanticBearings = Object.freeze({
  version: PARTS4_SEMANTIC_BEARINGS_VERSION,
  installed: Object.freeze({ ...installed }),
})

if (!Object.values(installed).every(Boolean)) {
  console.warn('[BrickLab] PARTS-4 semantic bearing metadata is incomplete', installed)
}
