import { classifyTechnicEndpointV1 } from './interface-semantics-v1.js'
import { technicPartProfileV1 } from './part-profile-v1.js'

export const TECHNIC_MECHANICAL_HINTS_VERSION = 'technic-mechanical-hints-v1.1.0'

const EXACT_LDRAW_GEARS = new Map([
  ['62821', Object.freeze({
    kind:'bevel', teeth:28, pitchRadius:28/16, efficiency:.90,
    differentialHousing:true,
    meshAnchorLdu:Object.freeze([0,0,27]),
    meshAxisLdu:Object.freeze([0,0,1]),
    bevelApexSigns:Object.freeze([-1]),
    meshApexToleranceStud:.16,
    authoritative:true,
  })],
  ['18575', Object.freeze({
    kind:'bevel', teeth:20, pitchRadius:20/16, efficiency:.92,
    doubleBevel:true, reinforced:true,
    meshAnchorLdu:Object.freeze([0,0,0]),
    meshAxisLdu:Object.freeze([0,0,1]),
    bevelApexSigns:Object.freeze([-1,1]),
    authoritative:true,
  })],
])

function codeOf(definition) {
  return String(definition?.ldraw?.code || definition?.ldraw?.file || definition?.id || '')
    .replace(/^ldraw-/i,'')
    .replace(/^parts[\\/]/i,'')
    .replace(/\\/g,'/')
    .split('/').pop()
    ?.replace(/\.dat$/i,'')
    .trim().toLowerCase() || ''
}

function exactLDrawGear(definition) {
  const exact=EXACT_LDRAW_GEARS.get(codeOf(definition))
  return exact ? Object.freeze({
    ...exact,
    meshAnchorLdu:exact.meshAnchorLdu ? [...exact.meshAnchorLdu] : null,
    meshAxisLdu:exact.meshAxisLdu ? [...exact.meshAxisLdu] : null,
    bevelApexSigns:exact.bevelApexSigns ? [...exact.bevelApexSigns] : null,
    source:`${TECHNIC_MECHANICAL_HINTS_VERSION}:verified-ldraw-gear`,
  }) : null
}

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
  const gear = exactLDrawGear(definition) ?? trustedGear(profile, definition)
  if (gear) hints.gear = gear

  const existing = definition?.mechanics ?? {}
  const hasExplicitRotaryOwner = Boolean(
    existing.gear || existing.shaft || existing.wheel || existing.motor ||
    existing.transmission || existing.differential,
  )
  if (profile.rotary && !gear && !hasExplicitRotaryOwner) hints.shaft = true
  if (profile.rotary || gear) hints.technicRotary = true
  if (profile.transmission || gear) hints.technicTransmissionRole = profile.role === 'unknown' ? 'gear' : profile.role

  return Object.freeze({
    version:TECHNIC_MECHANICAL_HINTS_VERSION,
    profile,
    keyedAxleReceiver:keyedAxleReceiver(definition),
    mechanics:Object.freeze(hints),
  })
}

function sameGear(a,b) {
  if (!a || !b) return false
  const scalarKeys=['kind','teeth','pitchRadius','efficiency','differentialHousing','doubleBevel','reinforced','meshApexToleranceStud','source']
  if (scalarKeys.some(key => a[key] !== b[key])) return false
  for (const key of ['meshAnchorLdu','meshAxisLdu','bevelApexSigns']) {
    const aa=Array.isArray(a[key]) ? a[key] : []
    const bb=Array.isArray(b[key]) ? b[key] : []
    if (aa.length !== bb.length || aa.some((value,index)=>value!==bb[index])) return false
  }
  return true
}

export function applyTechnicMechanicalHintsV1(definition) {
  if (!definition || typeof definition !== 'object') return false
  const result = technicMechanicalHintsV1(definition)
  const current = definition.mechanics && typeof definition.mechanics === 'object' ? definition.mechanics : {}
  const next = { ...current }
  let changed = false

  if (result.mechanics.gear) {
    const incoming=result.mechanics.gear
    if (!current.gear || incoming.authoritative === true) {
      const merged={ ...(current.gear || {}), ...incoming }
      if (!sameGear(current.gear,merged)) {
        next.gear=merged
        changed=true
      }
    }
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
