import { PARTS } from '../parts.js'

export const PARTS3_DIAGNOSTICS_VERSION = 'parts-3-diagnostics-v1'
const TARGETS = new Set([
  ...(globalThis.BrickLabParts3?.added ?? []),
  ...(globalThis.BrickLabParts3Extra?.added ?? []),
])

function finite3(value) { return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) }

export function inspectParts3() {
  const failures = []
  const warnings = []
  const checked = []

  for (const part of PARTS) {
    if (!TARGETS.has(part.id) && part.schemaVersion !== 'part-schema-v1') continue
    checked.push(part.id)
    if (typeof part.create !== 'function') failures.push(`${part.id}: missing create()`)
    const ids = new Set()
    for (const connector of part.connectors ?? []) {
      if (ids.has(connector.id)) failures.push(`${part.id}: duplicate connector ${connector.id}`)
      ids.add(connector.id)
      if (!finite3(connector.position) || !finite3(connector.axis)) failures.push(`${part.id}/${connector.id}: malformed vector`)
      if (finite3(connector.axis) && Math.abs(Math.hypot(...connector.axis) - 1) > 1e-6) warnings.push(`${part.id}/${connector.id}: axis is not normalized`)
    }
    if (part.mechanics?.wheel && !(part.mechanics.wheel.radius > 0)) failures.push(`${part.id}: invalid wheel radius`)
    if (part.mechanics?.gear && !(part.mechanics.gear.teeth > 0)) failures.push(`${part.id}: invalid gear teeth`)
    if (!part.physics?.massKg || !(part.physics.massKg > 0)) warnings.push(`${part.id}: using default or missing explicit mass`)
  }

  const result = {
    version: PARTS3_DIAGNOSTICS_VERSION,
    checked,
    targetCount: TARGETS.size,
    failures,
    warnings,
    ok: failures.length === 0,
  }
  globalThis.__bricklabParts3Diagnostics = result
  if (failures.length) console.error('BrickLab PARTS-3 validation failed', result)
  return result
}

inspectParts3()
globalThis.BrickLabParts3Diagnostics = Object.freeze({ version: PARTS3_DIAGNOSTICS_VERSION, inspect: inspectParts3 })
