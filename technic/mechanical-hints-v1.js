import { classifyTechnicEndpointV1 } from './interface-semantics-v1.js'
import { technicPartProfileV1 } from './part-profile-v1.js'

export const TECHNIC_MECHANICAL_HINTS_VERSION = 'technic-mechanical-hints-v1.0.0'

function keyedAxleReceiver(definition) {
  if ((definition?.connectors ?? []).some(connector => connector?.type === 'axle-hole')) return true
  if (definition?.connectivityV4?.status !== 'ready') return false
  return (definition.connectivityV4.connectors ?? []).some(connector => {
    try { return classifyTechnicEndpointV1(connector).kind === 'technic-axle-hole' }
    catch { return false }
  })
}

function trustedGear(profile, definition) {
  if (!['spur-gear','bevel-gear'].includes(profile?.role)) return null
  const teeth = Number(profile?.toothCount)
  if (!(teeth > 0) || !keyedAxleReceiver(definition)) return null
  const kind = profile.role === 'bevel-gear' ? 'bevel' : 'spur'
  return Object.freeze({
    kind,
    teeth,
    pitchRadius:Number(profile.pitchRadiusStuds) || teeth / 16,
    efficiency:kind === 'bevel' ? 0.90 : 0.92,
    source:`${TECHNIC_MECHANICAL_HINTS_VERSION}:${profile.confidence}`,
  })
}

export function technicMechanicalHintsV1(definition = {}) {
  const profile = technicPartProfileV1(definition)
  const hints = {}
  const gear = trustedGear(profile, definition)
  if (gear) hints.gear = gear

  const existing = definition?.mechanics ?? {}
  const hasExplicitRotaryOwner = Boolean(
    existing.gear || existing.shaft || existing.wheel || existing.motor ||
    existing.transmission || existing.differential,
  )
  if (profile.rotary && !gear && !hasExplicitRotaryOwner) hints.shaft = true
  if (profile.rotary) hints.technicRotary = true
  if (profile.transmission) hints.technicTransmissionRole = profile.role

  return Object.freeze({
    version:TECHNIC_MECHANICAL_HINTS_VERSION,
    profile,
    keyedAxleReceiver:keyedAxleReceiver(definition),
    mechanics:Object.freeze(hints),
  })
}

export function applyTechnicMechanicalHintsV1(definition) {
  if (!definition || typeof definition !== 'object') return false
  const result = technicMechanicalHintsV1(definition)
  const current = definition.mechanics && typeof definition.mechanics === 'object' ? definition.mechanics : {}
  const next = { ...current }
  let changed = false

  if (result.mechanics.gear && !current.gear) {
    next.gear = { ...result.mechanics.gear }
    changed = true
  }
  if (result.mechanics.shaft === true && current.shaft !== true) {
    next.shaft = true
    changed = true
  }
  if (result.mechanics.technicRotary === true && current.technicRotary !== true) {
    next.technicRotary = true
    changed = true
  }
  if (result.mechanics.technicTransmissionRole && !current.technicTransmissionRole) {
    next.technicTransmissionRole = result.mechanics.technicTransmissionRole
    changed = true
  }

  if (changed) definition.mechanics = next
  return changed
}
