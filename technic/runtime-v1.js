import { PARTS, findPart } from '../parts.js'
import { BrickLabTechnicMechanicalGrammar, TECHNIC_MECHANICAL_GRAMMAR_VERSION } from './mechanical-grammar-v1.js'
import { analyzeTechnicAssemblyV1, TECHNIC_ASSEMBLY_ANALYSIS_VERSION } from './assembly-analysis-v1.js'
import {
  classifyTechnicConnectionV1,
  classifyTechnicEndpointV1,
  TECHNIC_INTERFACE_SEMANTICS_VERSION,
} from './interface-semantics-v1.js'
import {
  technicPartProfileV1,
  technicProfileIsGear,
  technicProfileIsRotary,
  technicProfileIsStructural,
  TECHNIC_PART_PROFILE_VERSION,
} from './part-profile-v1.js'
import {
  applyTechnicMechanicalHintsV1,
  technicMechanicalHintsV1,
  TECHNIC_MECHANICAL_HINTS_VERSION,
} from './mechanical-hints-v1.js'
import {
  TECHNIC_CAPABILITIES_VERSION,
  TECHNIC_MECHANISM_CAPABILITIES,
  technicCapabilitySummaryV1,
  technicCapabilityV1,
} from './capabilities-v1.js'
import {
  TECHNIC_UPSTREAM_SHADOW_VERSION,
  TECHNIC_SHADOW_GROUPS,
  TECHNIC_SHADOW_IDS,
  classifyTechnicShadowGroupV1,
  classifyTechnicShadowIdV1,
} from './upstream-shadow-v1.js'
import {
  detectRackPinionMeshesV1,
  TECHNIC_RACK_PINION_DETECT_VERSION,
} from './rack-pinion-detect-v1.js?v=technic-rack-pinion-20260915-v2'
import * as transmissionMath from './transmission-math-v1.js'

export const BRICKLAB_TECHNIC_RUNTIME_VERSION = 'bricklab-technic-runtime-v1.3.0'

function definitionOf(value) {
  if (!value) return null
  if (typeof value === 'string') return findPart(value) ?? null
  return value
}

function profile(value) {
  const definition = definitionOf(value)
  return technicPartProfileV1(definition || (typeof value === 'string' ? { id:value } : value || {}))
}

function connector(partId, endpointId) {
  return definitionOf(partId)?.connectivityV4?.connectors?.find(item => item.endpointId === endpointId) ?? null
}

function endpoint(partId, endpointId) {
  const connectorRecord = connector(partId, endpointId)
  return connectorRecord ? classifyTechnicEndpointV1(connectorRecord) : null
}

function connection(record) {
  const connectorA = record?.a ? connector(record.a.partId, record.a.endpointId) : null
  const connectorB = record?.b ? connector(record.b.partId, record.b.endpointId) : null
  if (!connectorA || !connectorB) return null
  return classifyTechnicConnectionV1(connectorA, connectorB, {
    activationFamily:record?.activation?.family || record?.metadata?.activation?.family || null,
  })
}

function analyze({ objects = null, connections = null, drivetrain = null } = {}) {
  const sceneObjects = objects ?? globalThis.BrickLabSubsystems?.editor?.objects?.() ?? []
  const records = connections ?? globalThis.BrickLabMechanicsNext?.projectConnections?.() ?? []
  return analyzeTechnicAssemblyV1({
    objects:sceneObjects,
    connections:records,
    getDefinition:findPart,
    getConnector:connector,
    drivetrain,
  })
}

function detectRackPinion(objects = null, options = {}) {
  const sceneObjects = objects ?? globalThis.BrickLabSubsystems?.editor?.objects?.() ?? []
  return detectRackPinionMeshesV1(sceneObjects, options)
}

function applyMechanicalHints(definition) {
  return applyTechnicMechanicalHintsV1(definition)
}

function syncMechanicalHints() {
  let changed = 0
  for (const definition of PARTS) if (applyMechanicalHints(definition)) changed += 1
  return changed
}

let syncQueued = false
function scheduleMechanicalHints() {
  if (syncQueued) return
  syncQueued = true
  queueMicrotask(() => { syncQueued = false; syncMechanicalHints() })
}

function coverage() {
  const entries = PARTS.map(definition => ({ definition, profile:profile(definition) }))
  const recognized = entries.filter(item => item.profile.role !== 'unknown')
  const roleCounts = {}
  const confidence = {}
  for (const item of recognized) {
    roleCounts[item.profile.role] = (roleCounts[item.profile.role] || 0) + 1
    confidence[item.profile.confidence] = (confidence[item.profile.confidence] || 0) + 1
  }
  return Object.freeze({
    version:BRICKLAB_TECHNIC_RUNTIME_VERSION,
    registeredParts:PARTS.length,
    recognizedParts:recognized.length,
    rotaryParts:recognized.filter(item => item.profile.rotary).length,
    structuralParts:recognized.filter(item => item.profile.structural).length,
    transmissionParts:recognized.filter(item => item.profile.transmission).length,
    hintedGears:entries.filter(item => Boolean(item.definition?.mechanics?.gear?.source?.startsWith?.(TECHNIC_MECHANICAL_HINTS_VERSION))).length,
    mechanisms:technicCapabilitySummaryV1(),
    upstreamShadow:Object.freeze({ ids:Object.keys(TECHNIC_SHADOW_IDS).length, groups:Object.keys(TECHNIC_SHADOW_GROUPS).length }),
    roles:Object.freeze({ ...roleCounts }),
    confidence:Object.freeze({ ...confidence }),
  })
}

export const BrickLabTechnic = Object.freeze({
  version:BRICKLAB_TECHNIC_RUNTIME_VERSION,
  grammarVersion:TECHNIC_MECHANICAL_GRAMMAR_VERSION,
  interfaceVersion:TECHNIC_INTERFACE_SEMANTICS_VERSION,
  profileVersion:TECHNIC_PART_PROFILE_VERSION,
  assemblyVersion:TECHNIC_ASSEMBLY_ANALYSIS_VERSION,
  hintsVersion:TECHNIC_MECHANICAL_HINTS_VERSION,
  capabilitiesVersion:TECHNIC_CAPABILITIES_VERSION,
  upstreamShadowVersion:TECHNIC_UPSTREAM_SHADOW_VERSION,
  rackPinionDetectVersion:TECHNIC_RACK_PINION_DETECT_VERSION,
  grammar:BrickLabTechnicMechanicalGrammar,
  capabilities:TECHNIC_MECHANISM_CAPABILITIES,
  capability:technicCapabilityV1,
  capabilitySummary:technicCapabilitySummaryV1,
  shadow:Object.freeze({
    ids:TECHNIC_SHADOW_IDS,
    groups:TECHNIC_SHADOW_GROUPS,
    classifyId:classifyTechnicShadowIdV1,
    classifyGroup:classifyTechnicShadowGroupV1,
  }),
  math:Object.freeze({ ...transmissionMath }),
  profile,
  hints(value) { return technicMechanicalHintsV1(definitionOf(value) || (typeof value === 'string' ? { id:value } : value || {})) },
  endpoint,
  connection,
  analyze,
  detectRackPinion,
  coverage,
  syncMechanicalHints,
  syncKinematicSelectionHints:syncMechanicalHints,
  isGear(value) { return technicProfileIsGear(profile(value)) },
  isRotary(value) { return technicProfileIsRotary(profile(value)) },
  isStructural(value) { return technicProfileIsStructural(profile(value)) },
})

syncMechanicalHints()
globalThis.addEventListener?.('bricklab:partcatalogchange', scheduleMechanicalHints)
globalThis.addEventListener?.('bricklab:ldrawlegacyready', scheduleMechanicalHints)
globalThis.addEventListener?.('bricklab:ldrawloaded', event => applyMechanicalHints(findPart(event.detail?.id)))

globalThis.BrickLabTechnic = BrickLabTechnic
globalThis.dispatchEvent?.(new CustomEvent('bricklab:technicready', {
  detail:{
    version:BRICKLAB_TECHNIC_RUNTIME_VERSION,
    grammarVersion:TECHNIC_MECHANICAL_GRAMMAR_VERSION,
    interfaceVersion:TECHNIC_INTERFACE_SEMANTICS_VERSION,
    profileVersion:TECHNIC_PART_PROFILE_VERSION,
    assemblyVersion:TECHNIC_ASSEMBLY_ANALYSIS_VERSION,
    hintsVersion:TECHNIC_MECHANICAL_HINTS_VERSION,
    capabilitiesVersion:TECHNIC_CAPABILITIES_VERSION,
    upstreamShadowVersion:TECHNIC_UPSTREAM_SHADOW_VERSION,
    rackPinionDetectVersion:TECHNIC_RACK_PINION_DETECT_VERSION,
  },
}))
