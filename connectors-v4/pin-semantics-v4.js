export const PIN_SEMANTICS_VERSION_V4 = 'pin-semantics-v4.1.0'

const RADIUS_EPS_LDU = 0.18
const CORE_RADIUS_LDU = 6
const SHOULDER_RADIUS_LDU = 8
const MIN_PIN_CORE_LENGTH_LDU = 8

const approx = (a,b,eps=RADIUS_EPS_LDU) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= eps
const rigidShape = section => section?.shape === '_L' || section?.shape === 'L_' ? 'R' : section?.shape

function profile(connector) {
  if (!connector || connector.family !== 'cylinder') return null
  const sections=Array.isArray(connector.geometry?.sections)?connector.geometry.sections:[]
  if (!sections.length) return null
  const round=sections.every(section=>rigidShape(section)==='R')
  const elastic=sections.some(section=>section?.elastic===true || section?.shape==='_L' || section?.shape==='L_')
  const radii=sections.map(section=>Number(section.radiusLdu)).filter(Number.isFinite)
  const coreLength=sections.reduce((sum,section)=>sum+(rigidShape(section)==='R'&&approx(section.radiusLdu,CORE_RADIUS_LDU)?Math.max(0,Number(section.lengthLdu)||0):0),0)
  const shoulderLength=sections.reduce((sum,section)=>sum+(rigidShape(section)==='R'&&Number(section.radiusLdu)>=SHOULDER_RADIUS_LDU-RADIUS_EPS_LDU?Math.max(0,Number(section.lengthLdu)||0):0),0)
  return {
    sections,
    round,
    elastic,
    coreLength,
    shoulderLength,
    minRadius:radii.length?Math.min(...radii):Infinity,
    maxRadius:radii.length?Math.max(...radii):-Infinity,
    centered:connector.geometry?.centered===true,
    caps:String(connector.geometry?.caps||'none').toLowerCase(),
    slide:connector.snap?.slide===true,
  }
}

function plausibleTechnicRadius(p) {
  return p.minRadius >= CORE_RADIUS_LDU-0.25 && p.maxRadius <= SHOULDER_RADIUS_LDU+0.4
}

export function classifyTechnicPinInterfaceV4(connector) {
  const p=profile(connector)
  if (!p || !p.round || !plausibleTechnicRadius(p)) return null

  // Male Technic pins expose a nominal 6 LDU cylindrical core plus one or more
  // elastic latch/friction sections (L_ / _L in LDCad). This deliberately does
  // not infer from the part name, so unrelated round shafts are not promoted.
  if (
    connector.gender==='male' && p.elastic && p.coreLength>=MIN_PIN_CORE_LENGTH_LDU
  ) {
    return Object.freeze({
      role:'technic-pin',
      gender:'male',
      confidence:'profile-verified',
      frictionFit:true,
      coreRadiusLdu:CORE_RADIUS_LDU,
      coreLengthLdu:p.coreLength,
      shoulderLengthLdu:p.shoulderLength,
    })
  }

  // The canonical Technic pin receiver is an open, centered, sliding round bore
  // with a 6 LDU throat and wider ~8 LDU entry shoulders (connhole-style).
  // Simple R6 bores remain generic technic-round-hole receivers instead.
  if (
    connector.gender==='female' && p.slide && p.centered && p.caps==='none' &&
    p.coreLength>=MIN_PIN_CORE_LENGTH_LDU && p.shoulderLength>0
  ) {
    return Object.freeze({
      role:'technic-pin-hole',
      gender:'female',
      confidence:'profile-verified',
      frictionFit:false,
      throatRadiusLdu:CORE_RADIUS_LDU,
      throatLengthLdu:p.coreLength,
      shoulderLengthLdu:p.shoulderLength,
    })
  }

  return null
}

export function technicPinPairV4(a,b) {
  const aa=classifyTechnicPinInterfaceV4(a)
  const bb=classifyTechnicPinInterfaceV4(b)
  const male=aa?.role==='technic-pin'?aa:bb?.role==='technic-pin'?bb:null
  const female=aa?.role==='technic-pin-hole'?aa:bb?.role==='technic-pin-hole'?bb:null
  if (!male || !female) return null
  return Object.freeze({
    family:'technic-pin-hole',
    maleRole:male.role,
    femaleRole:female.role,
    confidence:'profile-verified',
    evidence:'ldcad-shadow:technic-pin-gender-profile',
  })
}
