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
import * as transmissionMath from './transmission-math-v1.js'

export const BRICKLAB_TECHNIC_RUNTIME_VERSION = 'bricklab-technic-runtime-v1.1.0'

function definitionOf(value) {
  if (!value) return null
  if (typeof value === 'string') return findPart(value) ?? null
  return value
}

function v4() { return globalThis.BrickLabConnectorV4 ?? null }

function profile(value) {
  const definition = definitionOf(value)
  return technicPartProfileV1(definition || (typeof value === 'string' ? { id:value } : value || {}))
}

function endpoint(partId, endpointId) {
  const connector = v4()?.getConnector?.(partId, endpointId) ?? null
  return connector ? classifyTechnicEndpointV1(connector) : null
}

function connection(record) {
  const connectorA = record?.a ? v4()?.getConnector?.(record.a.partId, record.a.endpointId) : null
  const connectorB = record?.b ? v4()?.getConnector?.(record.b.partId, record.b.endpointId) : null
  if (!connectorA || !connectorB) return null
  return classifyTechnicConnectionV1(connectorA, connectorB, {
    activationFamily:record?.activation?.family || record?.metadata?.activation?.family || null,
  })
}

function analyze({ objects = null, connections = null } = {}) {
  const runtime = v4()
  const sceneObjects = objects ?? runtime?.objects?.() ?? []
  const records = connections ?? runtime?.projectConnections?.() ?? []
  return analyzeTechnicAssemblyV1({
    objects:sceneObjects,
    connections:records,
    getDefinition:findPart,
    getConnector:(partId, endpointId) => runtime?.getConnector?.(partId, endpointId) ?? null,
  })
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
  grammar:BrickLabTechnicMechanicalGrammar,
  math:Object.freeze({ ...transmissionMath }),
  profile,
  hints(value) { return technicMechanicalHintsV1(definitionOf(value) || (typeof value === 'string' ? { id:value } : value || {})) },
  endpoint,
  connection,
  analyze,
  coverage,
  syncMechanicalHints,
  // Backward-compatible name retained for callers created during the first Technic pass.
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
  },
}))
