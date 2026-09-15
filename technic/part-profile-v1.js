export const TECHNIC_PART_PROFILE_VERSION = 'technic-part-profile-v1.0.0'

const VERIFIED = Object.freeze({
  '3647': { role:'spur-gear', toothCount:8 },
  '4019': { role:'spur-gear', toothCount:16 },
  '3648': { role:'spur-gear', toothCount:24 },
  '3649': { role:'spur-gear', toothCount:40 },
  '32270': { role:'bevel-gear', toothCount:12 },
  '32269': { role:'bevel-gear', toothCount:20 },
  '3704': { role:'axle', lengthL:2 },
  '4519': { role:'axle', lengthL:3 },
  '3705': { role:'axle', lengthL:4 },
  '32073': { role:'axle', lengthL:5 },
  '3706': { role:'axle', lengthL:6 },
  '44294': { role:'axle', lengthL:7 },
  '3707': { role:'axle', lengthL:8 },
  '3737': { role:'axle', lengthL:10 },
  '3708': { role:'axle', lengthL:12 },
  '3713': { role:'bush', retainer:true },
  '4265c': { role:'bush', retainer:true, half:true },
})

const SPECIAL_GROUP_ROLE = Object.freeze({
  diffhouse:'differential', drivingring1:'driving-ring', drivingring2:'driving-ring',
  linact1:'linear-actuator', linact2:'linear-actuator', linearactbody:'linear-actuator',
  cylslide:'linear-slider', pneucyl:'pneumatic', steerhold1:'steering-hub', steerhub1:'steering-hub',
  techballjnt:'ball-joint', nudge1:'ball-joint', nudge2:'ball-joint', unijnt:'universal-joint',
  techgearrack:'rack', techtrntbl60:'turntable', turntablepin:'turntable', turntable5x5:'turntable',
  z28turntable:'turntable', z56turntablet1:'turntable', wpaxhole:'wheel-hub', sglwhlaxle:'wheel-hub',
  techwhlcon1:'wheel-hub', techengine:'engine', techflexend:'flex-system',
})

function specialRole(definition) {
  for (const connector of definition?.connectivityV4?.connectors || []) {
    const group=String(connector?.group||'').toLowerCase().replace(/[^a-z0-9]/g,'')
    if (SPECIAL_GROUP_ROLE[group]) return SPECIAL_GROUP_ROLE[group]
  }
  return null
}

function codeOf(definition) {
  return String(definition?.ldraw?.code || definition?.ldraw?.file || definition?.id || '')
    .replace(/^ldraw-/i, '').replace(/^parts[\\/]/i, '').replace(/\\/g,'/').split('/').pop()
    ?.replace(/\.dat$/i,'').toLowerCase() || ''
}

function textOf(definition) {
  return [definition?.name,definition?.description,definition?.category,...(definition?.tags || [])]
    .filter(Boolean).join(' | ')
}

function teethFrom(text) {
  const patterns = [
    /\bgear\s+(\d{1,3})\s*(?:tooth|teeth|t)\b/i,
    /\b(\d{1,3})\s*(?:tooth|teeth|t)\b[^|]{0,32}\bgear\b/i,
    /\b(?:sprocket|gear)\b[^|]{0,20}\b(\d{1,3})\s*t\b/i,
  ]
  for (const pattern of patterns) {
    const match = String(text).match(pattern)
    if (!match) continue
    const value = Number(match[1])
    if (value >= 4 && value <= 168) return value
  }
  return null
}

function mechanicalClass(definition) {
  return definition?.mechanicalIntelligence?.class || definition?.ldraw?.mechanicalClass || definition?.mechanics?.classification?.class || null
}

function fromExisting(definition) {
  const cls = mechanicalClass(definition)
  const props = definition?.mechanicalIntelligence?.properties || definition?.mechanics?.classification?.properties || {}
  const map = {
    'spur-gear':'spur-gear','bevel-gear':'bevel-gear','rack':'rack','axle':'axle','bush':'bush',
    'universal-joint':'universal-joint','shock-absorber':'shock-absorber','steering-hub':'steering-hub',
    'suspension-arm':'suspension-arm','differential-like':'differential','gearbox-like':'gearbox',
    'power-unit':'motor','rim':'rim','tire':'tire','wheel-assembly':'wheel',
  }
  return cls && map[cls] ? { role:map[cls], ...props } : null
}

function inferredRole(text, category = '') {
  const value = `${category} ${text}`.toLowerCase()
  if (/\b(?:universal\s+joint|cardan)\b/.test(value)) return 'universal-joint'
  if (/\b(?:flex(?:ible)?\s+axle|flex-system)\b/.test(value)) return 'flex-axle'
  if (/\b(?:cv\s+joint|constant\s+velocity)\b/.test(value)) return 'cv-joint'
  if (/\bdifferential\b/.test(value)) return 'differential'
  if (/\bdriving\s+ring\b|\bclutch\s+ring\b/.test(value)) return 'driving-ring'
  if (/\blinear\s+actuator\b/.test(value)) return 'linear-actuator'
  if (/\bpneumatic\s+(?:cylinder|pump)\b/.test(value)) return 'pneumatic'
  if (/\b(?:turntable|turn\s*table)\b/.test(value)) return 'turntable'
  if (/\b(?:shock\s+absorber|spring\s+damper)\b/.test(value)) return 'shock-absorber'
  if (/\b(?:steering\s+hub|steering\s+arm|steering\s+knuckle|hub\s+carrier)\b/.test(value)) return 'steering-hub'
  if (/\b(?:suspension\s+arm|wishbone|control\s+arm)\b/.test(value)) return 'suspension-arm'
  if (/\b(?:gear\s*rack|rack\s+gear|rack\s+and\s+pinion)\b/.test(value)) return 'rack'
  if (/\bknob\s+(?:wheel|gear)\b/.test(value)) return 'knob-wheel'
  if (/\bclutch\s+gear\b/.test(value)) return 'clutch-gear'
  if (/\bworm\b/.test(value) && /\bgear|wheel|screw/.test(value)) return 'worm'
  if (/\bcrown\b/.test(value) && /\bgear\b/.test(value)) return 'crown-gear'
  if (/\bbevel\b/.test(value) && /\bgear\b/.test(value)) return 'bevel-gear'
  if (/\b(?:sprocket|chain\s+wheel)\b/.test(value)) return 'sprocket'
  if (/\b(?:pulley|belt\s+wheel)\b/.test(value)) return 'pulley'
  if (/\bgear\b/.test(value) && !/\bgearbox|rack|worm|differential|clutch|driving\s+ring|knob/.test(value)) return 'spur-gear'
  if (/\b(?:half\s+)?bush(?:ing)?\b|axle\s+stop/.test(value)) return 'bush'
  if (/\baxle\s+(?:joiner|connector|coupler)\b/.test(value)) return 'axle-coupler'
  if (/\b(?:technic\s+)?axle\b/.test(value) && !/\bhole|connector|joiner|gear|rack/.test(value)) return 'axle'
  if (/\b(?:technic\s+)?pin\b/.test(value) && !/\bhole/.test(value)) return 'pin'
  if (/\b(?:technic\s+frame|frame\s+technic)\b/.test(value)) return 'technic-frame'
  if (/\b(?:liftarm|technic\s+beam|beam)\b/.test(value)) return 'beam'
  if (/\btechnic\s+brick\b/.test(value)) return 'technic-brick'
  if (/\bconnector|joiner|perpendicular/.test(value)) return 'connector'
  if (/\b(?:wheel\s+hub|hub)\b/.test(value)) return 'wheel-hub'
  if (/\b(?:wheel|rim)\b/.test(value) && !/\bgear|pulley/.test(value)) return 'rim'
  if (/\b(?:tyre|tire)\b/.test(value)) return 'tire'
  if (/\bmotor\b/.test(value)) return 'motor'
  if (/\bengine\b/.test(value)) return 'engine'
  return 'unknown'
}

const ROTARY = new Set(['axle','axle-coupler','bush','spur-gear','bevel-gear','crown-gear','clutch-gear','knob-wheel','worm','sprocket','pulley','rim','wheel-hub','driving-ring'])
const STRUCTURAL = new Set(['beam','technic-brick','technic-frame','connector'])
const TRANSMISSION = new Set(['spur-gear','bevel-gear','crown-gear','clutch-gear','knob-wheel','worm','rack','sprocket','pulley','differential','driving-ring','universal-joint','cv-joint','gearbox'])

export function technicPartProfileV1(definition = {}) {
  const code = codeOf(definition)
  const verified = VERIFIED[code]
  const existing = fromExisting(definition)
  const text = textOf(definition)
  const category = String(definition?.category || '')
  const special = specialRole(definition)
  const base = verified || existing || { role:special || inferredRole(text, category) }
  const toothCount = base.toothCount ?? base.teeth ?? teethFrom(text)
  const role = base.role || 'unknown'
  const mechanics = definition?.mechanics || {}
  const rotary = ROTARY.has(role) || mechanics.shaft === true || Boolean(mechanics.gear) || Boolean(mechanics.wheel)
  const structural = STRUCTURAL.has(role)
  return Object.freeze({
    version:TECHNIC_PART_PROFILE_VERSION,
    code,
    role,
    confidence:verified ? 'verified-id' : existing ? 'existing-mechanical-intelligence' : role !== 'unknown' ? 'metadata-classification' : 'unknown',
    toothCount:toothCount || null,
    pitchRadiusStuds:toothCount && ['spur-gear','bevel-gear','crown-gear','clutch-gear','knob-wheel'].includes(role) ? toothCount / 16 : (base.pitchStuds ?? base.pitchRadius ?? null),
    lengthL:base.lengthL ?? null,
    retainer:Boolean(base.retainer || base.stopper || role === 'bush'),
    rotary,
    structural,
    transmission:TRANSMISSION.has(role),
    rawClass:mechanicalClass(definition),
  })
}

export function technicProfileIsGear(profile) {
  return ['spur-gear','bevel-gear','crown-gear','clutch-gear','knob-wheel'].includes(profile?.role)
}

export function technicProfileIsRotary(profile) { return Boolean(profile?.rotary) }
export function technicProfileIsStructural(profile) { return Boolean(profile?.structural) }
