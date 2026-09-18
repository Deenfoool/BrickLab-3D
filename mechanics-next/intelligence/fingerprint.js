import { deterministicId } from '../core/model.js'
import { endpointSemanticKind } from './endpoint-semantics.js'

function round(value, digits = 4) {
  if (!Number.isFinite(Number(value))) return null
  const factor = 10 ** digits
  return Math.round(Number(value) * factor) / factor
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}

export function canonicalMechanicalJson(value) {
  return JSON.stringify(canonical(value))
}

function endpointAxis(endpoint) {
  const o = endpoint?.frame?.orientationBrickLab ?? endpoint?.frame?.orientation
  if (!Array.isArray(o) || o.length !== 9) return null
  // LDCad connector axis convention is local -Y.
  const axis = [-Number(o[1]), -Number(o[4]), -Number(o[7])]
  const length = Math.hypot(...axis)
  if (!(length > 1e-9)) return null
  return axis.map(value => round(value / length))
}

function sectionSignature(section) {
  return {
    shape:String(section?.shape || '?'),
    radiusLdu:round(section?.radiusLdu),
    lengthLdu:round(section?.lengthLdu),
    elastic:section?.elastic === true,
  }
}

export function endpointMechanicalSignature(endpoint) {
  const position = endpoint?.frame?.positionLdu ?? endpoint?.frame?.positionStud
  return canonical({
    semantic:endpointSemanticKind(endpoint),
    family:endpoint?.family || 'unknown',
    gender:endpoint?.gender || null,
    group:endpoint?.metadata?.group || null,
    position:Array.isArray(position) ? position.map(value => round(value)) : null,
    axis:endpointAxis(endpoint),
    slide:endpoint?.capabilities?.includes?.('slide') === true,
    profile:{
      centered:endpoint?.profile?.centered === true,
      caps:endpoint?.profile?.caps ?? null,
      radiusLdu:round(endpoint?.profile?.radiusLdu),
      lengthLdu:round(endpoint?.profile?.lengthLdu),
      sections:Array.isArray(endpoint?.profile?.sections)
        ? endpoint.profile.sections.map(sectionSignature)
        : null,
      sequenceLdu:Array.isArray(endpoint?.profile?.sequenceLdu)
        ? endpoint.profile.sequenceLdu.map(value => round(value))
        : null,
    },
  })
}

export function buildMechanicalFingerprint({
  classification,
  endpoints = [],
} = {}) {
  const semanticCounts = {}
  const familyCounts = {}
  const signatures = endpoints.map(endpointMechanicalSignature)
  for (const endpoint of endpoints) {
    const semantic = endpointSemanticKind(endpoint)
    const family = endpoint?.family || 'unknown'
    semanticCounts[semantic] = (semanticCounts[semantic] || 0) + 1
    familyCounts[family] = (familyCounts[family] || 0) + 1
  }

  signatures.sort((a, b) => canonicalMechanicalJson(a).localeCompare(canonicalMechanicalJson(b)))

  const payload = canonical({
    role:classification?.role || 'unknown',
    bodyPolicy:classification?.bodyPolicy || 'rigid-atomic',
    properties:classification?.properties || {},
    semanticCounts,
    familyCounts,
    endpoints:signatures,
  })
  const serialized = canonicalMechanicalJson(payload)

  return Object.freeze({
    id:deterministicId('mechanical-fingerprint', serialized),
    payload:Object.freeze(payload),
    serialized,
    semanticCounts:Object.freeze(canonical(semanticCounts)),
    familyCounts:Object.freeze(canonical(familyCounts)),
  })
}
