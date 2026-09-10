import { findPart } from '../parts.js'
import { validateConnectorV4 } from './schema-v4.js?v=connector-v4-20260910-v3'

export const CONNECTOR_AUDIT_VERSION_V4 = 'connector-audit-v4.1.0'
const DEFAULT_POSITION_TOLERANCE_STUD = 0.18

function distance3(a,b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 3 || b.length !== 3) return Infinity
  return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])
}

function dotAbs(a,b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 3 || b.length !== 3) return 0
  const la=Math.hypot(...a), lb=Math.hypot(...b)
  if (!(la>1e-9 && lb>1e-9)) return 0
  return Math.abs((a[0]*b[0]+a[1]*b[1]+a[2]*b[2])/(la*lb))
}

function shapes(connector) {
  return new Set((connector?.geometry?.sections ?? []).map(section => section.shape === '_L' || section.shape === 'L_' ? 'R' : section.shape))
}

function semanticLegacyMatch(legacy,v4) {
  if (!legacy || !v4) return false
  const s=shapes(v4)
  if (legacy.type === 'stud') return v4.family === 'cylinder' && v4.gender === 'male' && s.has('R')
  if (legacy.type === 'tube') return v4.family === 'cylinder' && v4.gender === 'female'
  if (legacy.type === 'pin-hole') return v4.family === 'cylinder' && v4.gender === 'female' && s.has('R')
  if (legacy.type === 'axle-hole') return v4.family === 'cylinder' && v4.gender === 'female' && s.has('A')
  if (legacy.type === 'pin') return v4.family === 'cylinder' && v4.gender === 'male' && s.has('R')
  if (legacy.type === 'axle') return v4.family === 'cylinder' && v4.gender === 'male' && s.has('A')
  return false
}

function v4Position(connector) { return connector?.frame?.positionStud ?? null }
function v4Axis(connector) { return connector?.frame?.axis ?? null }

function endpointUniqueness(connectors) {
  const ids=new Map()
  const missing=[]
  for (const connector of connectors) {
    const id=String(connector?.endpointId || '')
    if (!id) { missing.push(connector?.source ?? null); continue }
    ids.set(id,(ids.get(id)||0)+1)
  }
  return {
    duplicates:[...ids.entries()].filter(([,count])=>count>1).map(([endpointId,count])=>({endpointId,count})),
    missing,
  }
}

export function auditConnectorDefinitionV4(defOrId,{positionToleranceStud=DEFAULT_POSITION_TOLERANCE_STUD}={}) {
  const def=typeof defOrId === 'string' ? findPart(defOrId) : defOrId
  if (!def) return { auditVersion:CONNECTOR_AUDIT_VERSION_V4,status:'missing-part' }
  const connectivity=def.connectivityV4
  if (!connectivity || connectivity.status !== 'ready') {
    return { auditVersion:CONNECTOR_AUDIT_VERSION_V4,status:connectivity?.status || 'not-hydrated',partId:def.id,file:def.ldraw?.file || null }
  }

  const legacy=Array.isArray(def.connectors) ? def.connectors : []
  const v4=Array.isArray(connectivity.connectors) ? connectivity.connectors : []
  const validationErrors=[]
  for (const connector of v4) {
    const validation=validateConnectorV4(connector)
    if (!validation.valid) validationErrors.push({endpointId:connector.endpointId || null,errors:validation.errors})
  }
  const identities=endpointUniqueness(v4)

  const legacyMatches=legacy.map(item => {
    let best=null
    for (const candidate of v4) {
      if (!semanticLegacyMatch(item,candidate)) continue
      const distanceStud=distance3(item.position,v4Position(candidate))
      if (!best || distanceStud<best.distanceStud) best={endpointId:candidate.endpointId || null,distanceStud,axisAbsDot:dotAbs(item.axis,v4Axis(candidate)),family:candidate.family,gender:candidate.gender}
    }
    return {
      legacyId:item.id,
      legacyType:item.type,
      matched:Boolean(best && best.distanceStud<=positionToleranceStud),
      nearest:best,
    }
  })

  const matchedLegacy=legacyMatches.filter(item=>item.matched).length
  const unmatchedLegacy=legacyMatches.filter(item=>!item.matched)
  const v4Kinds={}
  for (const connector of v4) {
    const key=`${connector.family}:${connector.gender || connector.geometry?.firstGender || 'mixed'}`
    v4Kinds[key]=(v4Kinds[key]||0)+1
  }

  return {
    auditVersion:CONNECTOR_AUDIT_VERSION_V4,
    status:'ready',
    partId:def.id,
    file:def.ldraw?.file || null,
    source:connectivity.source || null,
    systemVersion:connectivity.systemVersion || null,
    counts:{legacy:legacy.length,v4:v4.length,matchedLegacy,unmatchedLegacy:unmatchedLegacy.length},
    coverage:legacy.length ? matchedLegacy/legacy.length : null,
    positionToleranceStud,
    unmatchedLegacy,
    duplicateEndpointIds:identities.duplicates,
    missingEndpointIds:identities.missing,
    validationErrors,
    warnings:connectivity.warnings ?? [],
    v4Kinds,
    pass:identities.duplicates.length===0 && identities.missing.length===0 && validationErrors.length===0 && unmatchedLegacy.length===0,
  }
}

export function auditReadyPartsV4(options={}) {
  const results=[]
  for (const partId of options.partIds ?? []) results.push(auditConnectorDefinitionV4(partId,options))
  return {
    auditVersion:CONNECTOR_AUDIT_VERSION_V4,
    total:results.length,
    passed:results.filter(item=>item.pass).length,
    failed:results.filter(item=>item.status==='ready' && !item.pass).length,
    pending:results.filter(item=>item.status!=='ready').length,
    results,
  }
}
