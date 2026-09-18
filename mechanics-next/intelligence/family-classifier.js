import { evidence } from '../core/model.js'
import { endpointSemanticKind } from './endpoint-semantics.js'

const ROTARY = new Set([
  'axle','axle-coupler','bush','spur-gear','bevel-gear','crown-gear','clutch-gear',
  'worm','pulley','sprocket','rim','wheel-hub','driving-ring','differential',
])
const TRANSMISSION = new Set([
  'spur-gear','bevel-gear','crown-gear','clutch-gear','worm','rack','pulley','sprocket',
  'differential','driving-ring','universal-joint','cv-joint','linear-actuator',
])
const STRUCTURAL = new Set(['beam','technic-brick','technic-frame','connector','brick','plate'])

function textOf(observation) {
  return [
    observation?.name,
    observation?.description,
    observation?.category,
    ...(observation?.tags || []),
  ].filter(Boolean).join(' | ')
}

function toothCount(text) {
  for (const pattern of [
    /\bgear\s+(\d{1,3})\s*(?:tooth|teeth|t)\b/i,
    /\b(\d{1,3})\s*(?:tooth|teeth|t)\b[^|]{0,36}\bgear\b/i,
  ]) {
    const match = String(text).match(pattern)
    const value = Number(match?.[1])
    if (Number.isFinite(value) && value >= 4 && value <= 168) return value
  }
  return null
}

function axleLength(text) {
  const match = String(text).match(/\b(?:technic\s+)?axle\s+(\d+(?:\.5)?)\s*l?\b/i)
  const value = Number(match?.[1])
  return Number.isFinite(value) && value > 0 && value <= 64 ? value : null
}

function roleFromText(raw) {
  const value = String(raw).toLowerCase()
  if (/\bwheel\s+(?:assembly|with\s+(?:tyre|tire))\b/.test(value)) return 'wheel-assembly'
  if (/\b(?:universal\s+joint|cardan\s+joint)\b/.test(value)) return 'universal-joint'
  if (/\b(?:cv\s+joint|constant\s+velocity)\b/.test(value)) return 'cv-joint'
  if (/\b(?:flex(?:ible)?\s+axle|axle\s+flexible)\b/.test(value)) return 'flex-axle'
  if (/\bdifferential\b/.test(value)) return 'differential'
  if (/\blinear\s+actuator\b/.test(value)) return 'linear-actuator'
  if (/\b(?:shock\s+absorber|spring\s+damper)\b/.test(value)) return 'shock-absorber'
  if (/\b(?:turntable|turn\s*table)\b/.test(value)) return 'turntable'
  if (/\bdriving\s+ring\b|\bclutch\s+ring\b/.test(value)) return 'driving-ring'
  if (/\b(?:gear\s*rack|rack\s+gear|rack\s+and\s+pinion)\b/.test(value)) return 'rack'
  if (/\bworm\b/.test(value) && /\b(?:gear|wheel|screw)\b/.test(value)) return 'worm'
  if (/\bcrown\b/.test(value) && /\bgear\b/.test(value)) return 'crown-gear'
  if (/\bclutch\s+gear\b/.test(value)) return 'clutch-gear'
  if (/\bbevel\b/.test(value) && /\bgear\b/.test(value)) return 'bevel-gear'
  if (/\bgear\b/.test(value) && !/\b(?:gearbox|rack|worm|differential|clutch|driving\s+ring)\b/.test(value)) return 'spur-gear'
  if (/\b(?:sprocket|chain\s+wheel)\b/.test(value)) return 'sprocket'
  if (/\b(?:pulley|belt\s+wheel)\b/.test(value)) return 'pulley'
  if (/\b(?:half\s+)?bush(?:ing)?\b|\baxle\s+stop(?:per)?\b/.test(value)) return 'bush'
  if (/\baxle\s+(?:joiner|connector|coupler)\b/.test(value)) return 'axle-coupler'
  if (/\b(?:technic\s+)?axle\b/.test(value) && !/\b(?:hole|connector|joiner|gear|rack)\b/.test(value)) return 'axle'
  if (/\b(?:technic\s+)?pin\b/.test(value) && !/\bhole\b/.test(value)) return 'pin'
  if (/\b(?:technic\s+frame|frame\s+technic)\b/.test(value)) return 'technic-frame'
  if (/\b(?:liftarm|technic\s+beam)\b/.test(value)) return 'beam'
  if (/\btechnic\s+brick\b/.test(value)) return 'technic-brick'
  if (/\b(?:ball\s+joint|ball\s+socket)\b/.test(value)) return 'ball-joint'
  if (/\bhinge\b/.test(value)) return 'hinge'
  if (/\b(?:wheel\s+hub|hub\s+carrier|steering\s+hub|steering\s+knuckle)\b/.test(value)) return 'wheel-hub'
  if (/\b(?:tyre|tire)\b/.test(value)) return 'tire'
  if (/\b(?:wheel|rim)\b/.test(value) && !/\b(?:gear|pulley)\b/.test(value)) return 'rim'
  if (/\bmotor\b/.test(value)) return 'motor'
  if (/\bconnector\b/.test(value)) return 'connector'
  if (/\bbrick\b/.test(value)) return 'brick'
  if (/\bplate\b/.test(value)) return 'plate'
  return 'unknown'
}

function roleFromEndpointEvidence(endpoints) {
  const kinds = endpoints.map(endpointSemanticKind)
  const groups = new Set(kinds)

  if (groups.has('differential-internal-interface')) return 'differential'
  if (groups.has('universal-joint-port')) return 'universal-joint'
  if (groups.has('linear-actuator-guide')) return 'linear-actuator'
  if (groups.has('turntable-bearing')) return 'turntable'
  if (groups.has('wheel-axle-interface') || groups.has('wheel-retainer')) return 'wheel-hub'
  if (groups.has('rack-guide')) return 'rack'
  if (groups.has('engine-slider')) return 'engine'
  if (groups.has('flex-system-end')) return 'flex-system'
  return null
}

function existingEvidence(observation) {
  const existing = observation?.legacyMechanicalIntelligence
  if (!existing?.class) return null
  const map = {
    tire:'tire',
    rim:'rim',
    'wheel-assembly':'wheel-assembly',
    axle:'axle',
    bush:'bush',
    'spur-gear':'spur-gear',
    'bevel-gear':'bevel-gear',
    rack:'rack',
    'universal-joint':'universal-joint',
    'shock-absorber':'shock-absorber',
    'differential-like':'differential',
    'power-unit':'motor',
    'flex-axle':'flex-axle',
    'ball-joint':'ball-joint',
    'hinge-joint':'hinge',
  }
  return map[existing.class] || null
}

function bodyPolicy(role, observation) {
  if (['flex-axle','flex-system'].includes(role)) return 'deformable'
  if (['wheel-assembly','universal-joint','shock-absorber','linear-actuator'].includes(role)) {
    return 'compound-candidate'
  }

  const description = `${observation?.name || ''} ${observation?.description || ''}`.toLowerCase()
  if (/\b(?:complete|assembly|shortcut)\b/.test(description) &&
      ['turntable','hinge','ball-joint'].includes(role)) return 'compound-candidate'

  return 'rigid-atomic'
}

export function classifyPartFamily(observation, endpoints = []) {
  if (!observation?.id) throw new TypeError('Part classification requires an observation with id')

  const raw = textOf(observation)
  const endpointRole = roleFromEndpointEvidence(endpoints)
  const textRole = roleFromText(raw)
  const oldRole = existingEvidence(observation)

  let role = 'unknown'
  let confidence = 'unknown'
  let source = 'none'
  let reason = null

  if (textRole !== 'unknown') {
    role = textRole
    confidence = endpointRole === textRole ? 'strong' : 'inferred'
    source = endpointRole === textRole
      ? 'mechanics-next:catalog+endpoint-evidence'
      : 'mechanics-next:catalog-metadata'
    reason = endpointRole && endpointRole !== textRole
      ? 'physical role from metadata; endpoint role retained as mechanism context'
      : 'part name/category metadata'
  } else if (endpointRole) {
    role = endpointRole
    confidence = 'strong'
    source = 'mechanics-next:endpoint-evidence'
    reason = 'special connector group/profile'
  } else if (oldRole) {
    role = oldRole
    confidence = observation.legacyMechanicalIntelligence?.confidence === 'verified' ? 'strong' : 'inferred'
    source = 'catalog-existing-mechanical-intelligence'
    reason = 'temporary migration evidence'
  }

  const teeth = toothCount(raw) ??
    (Number(observation?.legacyMechanicalIntelligence?.properties?.toothCount) ||
      Number(observation?.legacyMechanics?.gear?.teeth) ||
      null)

  const lengthL = axleLength(raw) ??
    (Number(observation?.legacyMechanicalIntelligence?.properties?.lengthL) || null)

  const properties = {
    ...(Number.isFinite(teeth) && teeth > 0 ? { toothCount:teeth } : {}),
    ...(Number.isFinite(lengthL) && lengthL > 0 ? { lengthL } : {}),
    ...(role === 'axle' ? { keyed:true } : {}),
    ...(role === 'bush' ? { retainer:true } : {}),
  }

  return Object.freeze({
    role,
    family:role === 'unknown' ? 'unknown' : role,
    confidence,
    bodyPolicy:bodyPolicy(role, observation),
    contexts:Object.freeze(endpointRole && endpointRole !== role ? [endpointRole] : []),
    capabilities:Object.freeze({
      rotary:ROTARY.has(role),
      transmission:TRANSMISSION.has(role),
      structural:STRUCTURAL.has(role),
      flexible:['flex-axle','flex-system'].includes(role),
      retainer:role === 'bush',
    }),
    properties:Object.freeze(properties),
    evidence:evidence({ source, confidence, reason, detail:{ endpointRole, textRole, migratedRole:oldRole } }),
  })
}
