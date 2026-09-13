export const TESTLAB_SCHEMA_VERSION = 2
export const TESTLAB_PROFILE_KEY = 'bricklab.test.profiles.v2'
export const TESTLAB_RUNS_KEY = 'bricklab.test.runs.v2'
export const TESTLAB_SELECTED_KEY = 'bricklab.test.scenario.v1'
export const TESTLAB_MAX_RUNS = 24

const SURFACES = new Set(['concrete', 'asphalt', 'dirt', 'gravel', 'mud', 'ice'])
const METRICS = new Set(['time', 'force', 'power'])
const TYPES = new Set(['incline', 'step', 'articulation', 'cross-bump', 'bridge', 'surface-zone', 'towing-load', 'dyno-brake', 'checkpoint'])
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const clamp = (value, min, max) => Math.max(min, Math.min(max, number(value, min)))
const text = (value, fallback = '') => String(value ?? fallback).trim()
const idSafe = value => text(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
const clone = value => JSON.parse(JSON.stringify(value))

export const BUILTIN_TEST_PROFILES = Object.freeze({
  'hill-climb': Object.freeze({ version:2, id:'hill-climb', builtin:true, short:'HILL', name:'Hill Climb 22°', statusTitle:'HILL CLIMB', metric:'time', surface:'concrete', modules:[{type:'incline',angleDeg:22,lengthStud:18,widthStud:8,startZStud:3},{type:'checkpoint',zStud:18,label:'FINISH'}] }),
  'torque-pull': Object.freeze({ version:2, id:'torque-pull', builtin:true, short:'PULL', name:'Pull / Torque Bench', statusTitle:'PULL / TORQUE', metric:'force', surface:'asphalt', modules:[{type:'towing-load',startForceN:.1,maxForceN:3.5,rampRateN:.32}] }),
  'obstacle-course': Object.freeze({ version:2, id:'obstacle-course', builtin:true, short:'OBST', name:'Obstacle Course', statusTitle:'OBSTACLE COURSE', metric:'time', surface:'concrete', modules:[{type:'step',zStud:4.2,heightStud:.34,widthStud:6.5,depthStud:.8},{type:'articulation',zStud:8.4,heightStud:.65,widthStud:2.3,depthStud:2.1,staggerStud:2.2},{type:'cross-bump',zStud:12.3,heightStud:.72,widthStud:6.8},{type:'bridge',zStud:16.2,heightStud:.72,lengthStud:4.4,widthStud:6.2},{type:'checkpoint',zStud:20,label:'FINISH'}] }),
  'dyno-bench': Object.freeze({ version:2, id:'dyno-bench', builtin:true, short:'DYNO', name:'Dyno Bench', statusTitle:'DYNO BENCH', metric:'power', surface:'concrete', modules:[{type:'dyno-brake',maxDuration:12,brakeGain:.012,maxBrakeTorqueNm:.1}] }),
})

function normalizeModule(raw = {}) {
  const type = text(raw.type).toLowerCase()
  if (!TYPES.has(type)) return null
  if (type === 'incline') return { type, angleDeg:clamp(raw.angleDeg, 1, 35), lengthStud:clamp(raw.lengthStud, 2, 60), widthStud:clamp(raw.widthStud, 2, 16), startZStud:clamp(raw.startZStud, -20, 80) }
  if (type === 'step') return { type, zStud:clamp(raw.zStud, -20, 100), xStud:clamp(raw.xStud ?? 0, -20, 20), heightStud:clamp(raw.heightStud, .05, 3), widthStud:clamp(raw.widthStud ?? 6, .5, 16), depthStud:clamp(raw.depthStud ?? .8, .2, 8) }
  if (type === 'articulation') return { type, zStud:clamp(raw.zStud, -20, 100), heightStud:clamp(raw.heightStud, .05, 3), widthStud:clamp(raw.widthStud ?? 2.4, .5, 8), depthStud:clamp(raw.depthStud ?? 2, .5, 8), staggerStud:clamp(raw.staggerStud ?? 2.2, .25, 10) }
  if (type === 'cross-bump') return { type, zStud:clamp(raw.zStud, -20, 100), heightStud:clamp(raw.heightStud, .05, 3), widthStud:clamp(raw.widthStud ?? 6.5, 1, 16), depthStud:clamp(raw.depthStud ?? .7, .2, 3), angleDeg:clamp(raw.angleDeg ?? 14, 0, 45) }
  if (type === 'bridge') return { type, zStud:clamp(raw.zStud, -20, 100), heightStud:clamp(raw.heightStud, .1, 5), lengthStud:clamp(raw.lengthStud ?? 6, 2, 24), widthStud:clamp(raw.widthStud ?? 6, 1, 16) }
  if (type === 'surface-zone') return { type, surface:SURFACES.has(raw.surface) ? raw.surface : 'concrete', startZStud:clamp(raw.startZStud, -40, 120), endZStud:clamp(raw.endZStud, -40, 120), widthStud:clamp(raw.widthStud ?? 8, 1, 20) }
  if (type === 'towing-load') return { type, startForceN:clamp(raw.startForceN ?? .1, 0, 100), maxForceN:clamp(raw.maxForceN ?? 3.5, .05, 100), rampRateN:clamp(raw.rampRateN ?? .32, .01, 20) }
  if (type === 'dyno-brake') return { type, maxDuration:clamp(raw.maxDuration ?? 12, 2, 120), brakeGain:clamp(raw.brakeGain ?? .012, .0001, .5), maxBrakeTorqueNm:clamp(raw.maxBrakeTorqueNm ?? .1, .001, 10) }
  return { type, zStud:clamp(raw.zStud, -20, 120), label:text(raw.label, 'CHECKPOINT').slice(0, 32) || 'CHECKPOINT' }
}

export function normalizeTestProfile(raw = {}, { id = raw.id, builtin = false } = {}) {
  const modules = (Array.isArray(raw.modules) ? raw.modules : []).map(normalizeModule).filter(Boolean).slice(0, 24)
  const resolvedId = idSafe(id) || `custom-${Date.now()}`
  const profile = {
    version: TESTLAB_SCHEMA_VERSION,
    id: resolvedId,
    builtin: Boolean(builtin || raw.builtin),
    short: text(raw.short, 'LAB').slice(0, 6).toUpperCase() || 'LAB',
    name: text(raw.name, 'Custom test').slice(0, 80) || 'Custom test',
    statusTitle: text(raw.statusTitle, raw.name || 'CUSTOM TEST').slice(0, 80).toUpperCase() || 'CUSTOM TEST',
    metric: METRICS.has(raw.metric) ? raw.metric : 'time',
    surface: SURFACES.has(raw.surface) ? raw.surface : 'concrete',
    modules,
    updatedAt: Math.max(0, number(raw.updatedAt, 0)),
  }
  return profile
}

export function profileMetricKind(profile) {
  return normalizeTestProfile(profile, { id:profile?.id, builtin:profile?.builtin }).metric
}

export function testProfiles(storage = globalThis.localStorage) {
  const custom = readCustomProfiles(storage)
  return [...Object.values(BUILTIN_TEST_PROFILES).map(clone), ...custom]
}

export function readCustomProfiles(storage = globalThis.localStorage) {
  if (!storage) return []
  try {
    const value = JSON.parse(storage.getItem(TESTLAB_PROFILE_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.map(item => normalizeTestProfile(item, { id:item?.id })).filter(item => !BUILTIN_TEST_PROFILES[item.id])
  } catch { return [] }
}

export function saveTestProfile(storage, raw, { now = Date.now() } = {}) {
  if (!storage) throw new Error('Test profile storage unavailable')
  const base = normalizeTestProfile(raw, { id: raw?.id && !BUILTIN_TEST_PROFILES[raw.id] ? raw.id : `custom-${idSafe(raw?.name) || 'test'}-${now}` })
  const profile = { ...base, builtin:false, short:'LAB', updatedAt:now }
  const current = readCustomProfiles(storage).filter(item => item.id !== profile.id)
  current.unshift(profile)
  storage.setItem(TESTLAB_PROFILE_KEY, JSON.stringify(current.slice(0, 24)))
  return clone(profile)
}

export function deleteTestProfile(storage, id) {
  if (!storage || BUILTIN_TEST_PROFILES[id]) return false
  const before = readCustomProfiles(storage)
  const after = before.filter(item => item.id !== id)
  if (after.length === before.length) return false
  storage.setItem(TESTLAB_PROFILE_KEY, JSON.stringify(after))
  return true
}

export function findTestProfile(id, storage = globalThis.localStorage) {
  if (BUILTIN_TEST_PROFILES[id]) return clone(BUILTIN_TEST_PROFILES[id])
  return readCustomProfiles(storage).find(item => item.id === id) ?? null
}

export function readTestRuns(storage = globalThis.localStorage) {
  if (!storage) return []
  try {
    const value = JSON.parse(storage.getItem(TESTLAB_RUNS_KEY) || '[]')
    return Array.isArray(value) ? value.filter(item => item && item.id && item.profileId).slice(0, TESTLAB_MAX_RUNS) : []
  } catch { return [] }
}

export function recordTestRun(storage, raw, { maxRuns = TESTLAB_MAX_RUNS } = {}) {
  if (!storage) return null
  const run = {
    id:text(raw.id) || `run-${Date.now()}`,
    profileId:text(raw.profileId), profileName:text(raw.profileName, raw.profileId), projectName:text(raw.projectName, 'Untitled'),
    createdAt:Math.max(0, number(raw.createdAt, Date.now())), status:['PASSED','STALLED'].includes(raw.status) ? raw.status : 'UNKNOWN',
    metric:METRICS.has(raw.metric) ? raw.metric : 'time', primary:Math.max(0, number(raw.primary, 0)), elapsedSeconds:Math.max(0, number(raw.elapsedSeconds, 0)),
    peakForceN:Math.max(0, number(raw.peakForceN, 0)), peakPowerW:Math.max(0, number(raw.peakPowerW, 0)), topSpeedMps:Math.max(0, number(raw.topSpeedMps, 0)),
    maxRpm:Math.max(0, number(raw.maxRpm, 0)), avgSlipPct:Math.max(0, number(raw.avgSlipPct, 0)), peakWheelLoadN:Math.max(0, number(raw.peakWheelLoadN, 0)),
    trace:(Array.isArray(raw.trace) ? raw.trace : []).slice(-180).map(sample => ({
      t:Math.max(0, number(sample.t, 0)), speed:Math.max(0, number(sample.speed, 0)), rpm:Math.max(0, number(sample.rpm, 0)), power:Math.max(0, number(sample.power, 0)), slip:Math.max(0, number(sample.slip, 0)), wheelLoad:Math.max(0, number(sample.wheelLoad, 0)),
    })),
  }
  if (!run.profileId) return null
  const runs = readTestRuns(storage).filter(item => item.id !== run.id)
  runs.unshift(run)
  storage.setItem(TESTLAB_RUNS_KEY, JSON.stringify(runs.slice(0, Math.max(2, maxRuns))))
  return clone(run)
}

const pct = (current, baseline) => baseline > 0 ? ((current - baseline) / baseline) * 100 : null
export function compareTestRuns(current, baseline) {
  if (!current || !baseline) return null
  return {
    profileId:current.profileId,
    sameProfile:current.profileId === baseline.profileId,
    elapsedPct:pct(current.elapsedSeconds, baseline.elapsedSeconds),
    peakForcePct:pct(current.peakForceN, baseline.peakForceN),
    peakPowerPct:pct(current.peakPowerW, baseline.peakPowerW),
    topSpeedPct:pct(current.topSpeedMps, baseline.topSpeedMps),
    maxRpmPct:pct(current.maxRpm, baseline.maxRpm),
    avgSlipPct:pct(current.avgSlipPct, baseline.avgSlipPct),
    peakWheelLoadPct:pct(current.peakWheelLoadN, baseline.peakWheelLoadN),
    primaryPct:pct(current.primary, baseline.primary),
  }
}

export function defaultCustomProfile() {
  return normalizeTestProfile({
    id:'custom-draft', name:'Custom proving ground', metric:'time', surface:'concrete',
    modules:[
      {type:'step',zStud:5,heightStud:.4,widthStud:6.5,depthStud:.8},
      {type:'surface-zone',surface:'gravel',startZStud:8,endZStud:14,widthStud:8},
      {type:'checkpoint',zStud:18,label:'FINISH'},
    ],
  }, { id:'custom-draft' })
}
