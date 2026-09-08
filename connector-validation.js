import { PARTS } from './parts.js'
import { CONNECTOR_RULE_VERSION, connectorRule } from './connections.js'

const ALLOWED_TYPES = new Set(['stud', 'tube', 'pin', 'pin-hole', 'axle', 'axle-hole'])

function finiteVector(value, size = 3) {
  return Array.isArray(value) && value.length === size && value.every(Number.isFinite)
}

function connectorIdsForMechanics(part) {
  const ids = []
  const mechanics = part.mechanics ?? {}
  if (mechanics.motor?.connectorId) ids.push(['motor.connectorId', mechanics.motor.connectorId])
  if (mechanics.transmission) {
    ids.push(['transmission.inputConnectorId', mechanics.transmission.inputConnectorId])
    ids.push(['transmission.outputConnectorId', mechanics.transmission.outputConnectorId])
  }
  if (mechanics.differential) {
    ids.push(['differential.inputConnectorId', mechanics.differential.inputConnectorId])
    ids.push(['differential.leftConnectorId', mechanics.differential.leftConnectorId])
    ids.push(['differential.rightConnectorId', mechanics.differential.rightConnectorId])
  }
  if (mechanics.suspensionArm?.pivotConnectorId) ids.push(['suspensionArm.pivotConnectorId', mechanics.suspensionArm.pivotConnectorId])
  return ids
}

export function validateConnectorCatalog(parts = PARTS) {
  const errors = []
  const warnings = []
  const counts = {}

  for (const part of parts) {
    const connectors = part.connectors ?? []
    const ids = new Set()
    const positionKeys = new Set()

    for (const connector of connectors) {
      counts[connector.type] = (counts[connector.type] ?? 0) + 1
      if (!connector.id || ids.has(connector.id)) {
        errors.push(`${part.id}: duplicate or missing connector id "${connector.id ?? ''}"`)
      }
      ids.add(connector.id)

      if (!ALLOWED_TYPES.has(connector.type)) errors.push(`${part.id}:${connector.id}: unsupported type ${connector.type}`)
      if (!finiteVector(connector.position)) errors.push(`${part.id}:${connector.id}: invalid position`)
      if (!finiteVector(connector.axis)) errors.push(`${part.id}:${connector.id}: invalid axis`)
      else {
        const length = Math.hypot(...connector.axis)
        if (length < 0.5) errors.push(`${part.id}:${connector.id}: zero/short axis`)
        else if (Math.abs(length - 1) > 0.02) warnings.push(`${part.id}:${connector.id}: non-unit axis ${length.toFixed(3)}`)
      }

      if (finiteVector(connector.position)) {
        const key = `${connector.type}:${connector.position.map(value => Number(value).toFixed(4)).join(',')}`
        if (positionKeys.has(key)) warnings.push(`${part.id}:${connector.id}: duplicate ${connector.type} position`)
        positionKeys.add(key)
      }
    }

    for (const [label, id] of connectorIdsForMechanics(part)) {
      if (id && !connectors.some(connector => connector.id === id)) {
        errors.push(`${part.id}: ${label} references missing connector ${id}`)
      }
    }
  }

  for (const type of ALLOWED_TYPES) {
    const hasPartner = [...ALLOWED_TYPES].some(other => connectorRule(type, other))
    if (!hasPartner) errors.push(`connector type ${type} has no compatibility rule`)
  }

  return {
    version: CONNECTOR_RULE_VERSION,
    parts: parts.length,
    connectors: Object.values(counts).reduce((sum, count) => sum + count, 0),
    counts,
    errors,
    warnings,
    ok: errors.length === 0,
  }
}

const diagnostics = validateConnectorCatalog()
globalThis.BrickLabConnectorDiagnostics = diagnostics
if (diagnostics.errors.length) console.error('[BrickLab] connector catalog errors', diagnostics.errors)
if (diagnostics.warnings.length) console.warn('[BrickLab] connector catalog warnings', diagnostics.warnings)
window.dispatchEvent(new CustomEvent('bricklab:connectorvalidation', { detail: diagnostics }))
