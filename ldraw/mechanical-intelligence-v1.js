export const LDRAW_MECHANICAL_INTELLIGENCE_VERSION = 'ldraw-mechanical-intelligence-v1.0.0'

export const MECHANICAL_CONFIDENCE = Object.freeze({
  VERIFIED:'verified',
  INFERRED:'inferred',
  UNKNOWN:'unknown',
})

export const MECHANICAL_CLASSES = Object.freeze([
  'tire',
  'rim',
  'wheel-assembly',
  'axle',
  'bush',
  'spur-gear',
  'bevel-gear',
  'rack',
  'universal-joint',
  'shock-absorber',
  'steering-hub',
  'suspension-arm',
  'differential-like',
  'gearbox-like',
  'power-unit',
])

const CLASS_SET = new Set(MECHANICAL_CLASSES)

const BUILTIN_OVERRIDES = new Map([
  ['3647', { class:'spur-gear', properties:{ toothCount:8, pitchStuds:.5 } }],
  ['4019', { class:'spur-gear', properties:{ toothCount:16, pitchStuds:1 } }],
  ['3648', { class:'spur-gear', properties:{ toothCount:24, pitchStuds:1.5 } }],
  ['3649', { class:'spur-gear', properties:{ toothCount:40, pitchStuds:2.5 } }],
  ['32270', { class:'bevel-gear', properties:{ toothCount:12 } }],
  ['32269', { class:'bevel-gear', properties:{ toothCount:20 } }],
  ['3704', { class:'axle', properties:{ lengthL:2, keyed:true } }],
  ['4519', { class:'axle', properties:{ lengthL:3, keyed:true } }],
  ['3705', { class:'axle', properties:{ lengthL:4, keyed:true } }],
  ['32073', { class:'axle', properties:{ lengthL:5, keyed:true } }],
  ['3706', { class:'axle', properties:{ lengthL:6, keyed:true } }],
  ['44294', { class:'axle', properties:{ lengthL:7, keyed:true } }],
  ['3707', { class:'axle', properties:{ lengthL:8, keyed:true } }],
  ['3737', { class:'axle', properties:{ lengthL:10, keyed:true } }],
  ['3708', { class:'axle', properties:{ lengthL:12, keyed:true } }],
  ['3713', { class:'bush', properties:{ stopper:true } }],
  ['4265c', { class:'bush', properties:{ half:true, stopper:true } }],
])

const RUNTIME_OVERRIDES = new Map()
let installed = null

function normalizeCode(value) {
  return String(value || '')
    .replace(/^ldraw-/i, '')
    .replace(/^parts\//i, '')
    .replace(/\\/g, '/')
    .split('/').pop()
    ?.replace(/\.dat$/i, '')
    .trim()
    .toLowerCase() || ''
}

function clone(value) {
  if (value == null) return value
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value) } catch {}
  }
  return JSON.parse(JSON.stringify(value))
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) deepFreeze(nested)
  return Object.freeze(value)
}

function snapshot(value) {
  return deepFreeze(clone(value))
}

function record({ mechanicalClass = 'unknown', confidence = MECHANICAL_CONFIDENCE.UNKNOWN, source = 'none', evidence = [], properties = {} } = {}) {
  return snapshot({
    class:mechanicalClass,
    confidence,
    source,
    evidence:[...new Set(evidence.filter(Boolean).map(String))],
    properties:{ ...properties },
  })
}

function validateOverride(value) {
  if (!value || typeof value !== 'object') throw new TypeError('LDraw mechanical override must be an object')
  if (!CLASS_SET.has(value.class)) throw new TypeError(`Unsupported LDraw mechanical class: ${value.class}`)
  return {
    class:value.class,
    properties:value.properties && typeof value.properties === 'object' ? clone(value.properties) : {},
    evidence:Array.isArray(value.evidence) ? value.evidence.map(String) : [],
  }
}

export function registerLDrawMechanicalOverride(code, value) {
  const normalized = normalizeCode(code)
  if (!normalized) throw new TypeError('LDraw mechanical override requires a part code')
  const next = validateOverride(value)
  RUNTIME_OVERRIDES.set(normalized, next)
  installed?.sync?.()
  return getLDrawMechanicalOverride(normalized)
}

export function getLDrawMechanicalOverride(code) {
  const normalized = normalizeCode(code)
  const runtime = RUNTIME_OVERRIDES.get(normalized)
  const builtin = BUILTIN_OVERRIDES.get(normalized)
  const value = runtime || builtin
  return value ? snapshot({ code:normalized, ...value, source:runtime ? 'bricklab-runtime-override' : 'bricklab-registry-v1' }) : null
}

export function listLDrawMechanicalOverrides() {
  const codes = new Set([...BUILTIN_OVERRIDES.keys(), ...RUNTIME_OVERRIDES.keys()])
  return Object.freeze([...codes].sort().map(code => getLDrawMechanicalOverride(code)))
}

function definitionCode(definition) {
  return normalizeCode(definition?.ldraw?.code || definition?.ldraw?.file || definition?.id || definition?.code)
}

function textEvidence(definition) {
  const values = [
    definition?.name,
    definition?.description,
    definition?.category,
    ...(Array.isArray(definition?.tags) ? definition.tags : []),
  ].filter(Boolean).map(String)
  return values.join(' | ')
}

function toothCount(text) {
  const patterns = [
    /\bgear\s+(\d{1,3})\s*(?:tooth|teeth|t)\b/i,
    /\b(\d{1,3})\s*(?:tooth|teeth)\b[^|]{0,24}\bgear\b/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value >= 6 && value <= 80) return value
  }
  return null
}

function axleLength(text) {
  const patterns = [
    /\b(?:technic\s+)?axle\s+(\d+(?:\.5)?)\s*l?\b/i,
    /\b(\d+(?:\.5)?)\s*l\s+(?:technic\s+)?axle\b/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value) && value > 0 && value <= 32) return value
  }
  return null
}

function namedDimensionsMm(text, prefix) {
  const match = text.match(new RegExp(`\\b${prefix}\\s+(\\d+(?:\\.\\d+)?)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)`, 'i'))
  if (!match) return null
  const diameter = Number(match[1])
  const width = Number(match[2])
  if (!Number.isFinite(diameter) || !Number.isFinite(width) || diameter <= 0 || width <= 0) return null
  return { catalogDiameterMm:diameter, catalogWidthMm:width }
}

function inferred(mechanicalClass, evidence, properties = {}) {
  return record({ mechanicalClass, confidence:MECHANICAL_CONFIDENCE.INFERRED, source:'ldraw-metadata-v1', evidence, properties })
}

export function classifyLDrawDefinition(definition = {}) {
  const code = definitionCode(definition)
  const override = getLDrawMechanicalOverride(code)
  if (override) {
    return record({
      mechanicalClass:override.class,
      confidence:MECHANICAL_CONFIDENCE.VERIFIED,
      source:override.source,
      evidence:[`ldraw-id:${code}`, ...(override.evidence || [])],
      properties:override.properties,
    })
  }

  const raw = textEvidence(definition)
  const lower = raw.toLowerCase()
  const category = String(definition?.category || '').trim().toLowerCase()
  const evidence = raw ? [`metadata:${raw.slice(0, 240)}`] : []

  if (/\bwheel\s+(?:assembly|with\s+(?:tyre|tire))\b/i.test(raw)) {
    return inferred('wheel-assembly', evidence)
  }

  if (category === 'tyre' || /^\s*(?:tyre|tire)\b/i.test(String(definition?.name || definition?.description || ''))) {
    return inferred('tire', evidence, namedDimensionsMm(raw, '(?:Tyre|Tire)') || {})
  }

  if (category === 'wheel' || /^\s*(?:wheel|rim)\b/i.test(String(definition?.name || definition?.description || ''))) {
    return inferred('rim', evidence, namedDimensionsMm(raw, '(?:Wheel|Rim)') || {})
  }

  if (/\b(?:technic\s+)?axle\b/i.test(raw) && !/\b(?:hole|connector|joiner|coupler|gear|rack)\b/i.test(lower)) {
    const lengthL = axleLength(raw)
    return inferred('axle', evidence, { keyed:true, ...(lengthL ? { lengthL } : {}) })
  }

  if (/\b(?:half\s+)?bush(?:ing)?\b|\baxle\s+stop(?:per)?\b/i.test(raw)) {
    return inferred('bush', evidence, { stopper:true, half:/\bhalf\b/i.test(raw) })
  }

  if (/\b(?:universal\s+joint|cardan\s+joint)\b/i.test(raw)) return inferred('universal-joint', evidence)
  if (/\bshock\s+absorber\b/i.test(raw)) return inferred('shock-absorber', evidence)
  if (/\bsteering\s+(?:hub|carrier|knuckle)\b/i.test(raw)) return inferred('steering-hub', evidence)
  if (/\bsuspension\s+(?:arm|wishbone|control\s+arm)\b/i.test(raw)) return inferred('suspension-arm', evidence)
  if (/\bdifferential\b/i.test(raw)) return inferred('differential-like', evidence)
  if (/\b(?:gearbox|transmission)\b/i.test(raw)) return inferred('gearbox-like', evidence)
  if (/\b(?:gear\s+rack|rack\s+gear|rack\s+and\s+pinion)\b/i.test(raw)) return inferred('rack', evidence)

  const teeth = toothCount(raw)
  if (/\bbevel\b/i.test(raw) && /\bgear\b/i.test(raw)) {
    return inferred('bevel-gear', evidence, teeth ? { toothCount:teeth } : {})
  }
  if ((teeth || /\bspur\s+gear\b/i.test(raw)) && /\bgear\b/i.test(raw) && !/\b(?:worm|rack|crown|clutch|differential|knob|turntable)\b/i.test(raw)) {
    return inferred('spur-gear', evidence, teeth ? { toothCount:teeth, pitchStuds:teeth / 16 } : {})
  }

  if ((category === 'electric' && /\bmotor\b/i.test(raw)) || /\b(?:electric|powered\s+up|power\s+functions)\s+motor\b/i.test(raw)) {
    return inferred('power-unit', evidence)
  }

  return record({ mechanicalClass:'unknown', confidence:MECHANICAL_CONFIDENCE.UNKNOWN, source:'none', evidence, properties:{} })
}

function hasSnapCapability(definition) {
  if (Array.isArray(definition?.connectors) && definition.connectors.length) return true
  if (definition?.connectivityV4?.status === 'ready' && definition.connectivityV4.connectors?.length) return true
  return definition?.ldraw?.level === 'snap' || definition?.ldraw?.level === 'mechanical'
}

function classificationChanged(previous, next) {
  return JSON.stringify(previous || null) !== JSON.stringify(next || null)
}

export function syncLDrawMechanicalDefinition(definition) {
  if (!definition?.id?.startsWith?.('ldraw-')) return false
  const next = classifyLDrawDefinition(definition)
  const changed = classificationChanged(definition.mechanicalIntelligence, next)
  definition.mechanicalIntelligence = next
  definition.ldraw ??= {}
  definition.ldraw.mechanicalClass = next.class
  definition.ldraw.mechanicalConfidence = next.confidence
  definition.ldraw.mechanicalSource = next.source

  const mechanics = definition.mechanics && typeof definition.mechanics === 'object' ? { ...definition.mechanics } : {}
  if (next.confidence === MECHANICAL_CONFIDENCE.UNKNOWN) delete mechanics.classification
  else mechanics.classification = next

  // Preserve the one safe legacy semantic that BrickLab already inferred from explicit
  // LDraw naming. Do not invent motor torque, suspension rates, tyre grip, differential
  // ratios, bevel/rack constraints or other physics behavior here.
  if (next.class === 'axle') mechanics.shaft = mechanics.shaft ?? true

  definition.mechanics = Object.keys(mechanics).length ? mechanics : undefined
  return changed
}

export function ldrawMechanicalCoverage(parts = []) {
  const ldraw = [...parts].filter(definition => definition?.id?.startsWith?.('ldraw-'))
  const result = {
    version:LDRAW_MECHANICAL_INTELLIGENCE_VERSION,
    scope:'registered-ldraw-parts',
    total:ldraw.length,
    capabilities:{ visual:0, snap:0, mechanical:0 },
    confidence:{ verified:0, inferred:0, unknown:0 },
    classes:{},
  }

  for (const definition of ldraw) {
    const classification = definition.mechanicalIntelligence || classifyLDrawDefinition(definition)
    if (typeof definition.create === 'function') result.capabilities.visual += 1
    if (hasSnapCapability(definition)) result.capabilities.snap += 1
    result.confidence[classification.confidence] = (result.confidence[classification.confidence] || 0) + 1
    if (classification.confidence !== MECHANICAL_CONFIDENCE.UNKNOWN) {
      result.capabilities.mechanical += 1
      result.classes[classification.class] = (result.classes[classification.class] || 0) + 1
    }
  }

  return snapshot(result)
}

export function installLDrawMechanicalIntelligence(parts, globals = globalThis) {
  if (!Array.isArray(parts)) throw new TypeError('LDraw Mechanical Intelligence requires the live PARTS array')
  if (installed?.parts === parts) return installed.api

  const sync = () => {
    let changed = 0
    for (const definition of parts) if (syncLDrawMechanicalDefinition(definition)) changed += 1
    if (changed) globals.dispatchEvent?.(new CustomEvent('bricklab:mechanicalintelligencechange', { detail:{ changed, coverage:ldrawMechanicalCoverage(parts) } }))
    return changed
  }

  let queued = false
  const scheduleSync = () => {
    if (queued) return
    queued = true
    const enqueue = typeof queueMicrotask === 'function' ? queueMicrotask : callback => Promise.resolve().then(callback)
    enqueue(() => { queued = false; sync() })
  }

  globals.addEventListener?.('bricklab:partcatalogchange', scheduleSync)
  globals.addEventListener?.('bricklab:ldrawlegacyready', scheduleSync)
  globals.addEventListener?.('bricklab:ldrawloaded', scheduleSync)

  const api = Object.freeze({
    version:LDRAW_MECHANICAL_INTELLIGENCE_VERSION,
    confidence:MECHANICAL_CONFIDENCE,
    classes:MECHANICAL_CLASSES,
    classify:classifyLDrawDefinition,
    sync,
    coverage:() => ldrawMechanicalCoverage(parts),
    getOverride:getLDrawMechanicalOverride,
    listOverrides:listLDrawMechanicalOverrides,
    registerOverride:registerLDrawMechanicalOverride,
  })

  installed = { parts, api, sync }
  globals.BrickLabLDrawMechanicalIntelligence = api
  sync()
  globals.dispatchEvent?.(new CustomEvent('bricklab:mechanicalintelligenceready', { detail:{ version:api.version, coverage:api.coverage() } }))
  return api
}
