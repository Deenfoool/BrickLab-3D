export const THROUGH_HOLE_VERSION_V4 = 'through-hole-v4.1.0'

const PROFILE_EPS_LDU = 0.08

const approx=(a,b,eps=PROFILE_EPS_LDU)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=eps
const rigidShape=section=>section?.shape==='_L'||section?.shape==='L_'?'R':section?.shape
const normalizeToken=value=>String(value||'').trim().toLowerCase().replace(/\\/g,'/').split('/').pop()?.replace(/\.dat$/,'').replace(/[^a-z0-9]/g,'')||''

function sectionEquivalent(a,b){
  return rigidShape(a)===rigidShape(b)
    && approx(Number(a?.radiusLdu),Number(b?.radiusLdu))
    && approx(Number(a?.lengthLdu),Number(b?.lengthLdu))
}

export function symmetricCylinderProfileV4(connector){
  if(connector?.family!=='cylinder')return false
  const sections=Array.isArray(connector.geometry?.sections)?connector.geometry.sections:[]
  if(!sections.length)return false
  if(sections.length===1)return true
  for(let i=0;i<Math.floor(sections.length/2);i+=1){
    if(!sectionEquivalent(sections[i],sections[sections.length-1-i]))return false
  }
  return true
}

export function explicitOneSidedCylinderReceiverV4(connector){
  const tokens=[
    connector?.id,
    connector?.source?.primitive,
    connector?.source?.file,
  ].map(normalizeToken)
  return tokens.includes('connhol3')
}

export function bidirectionalCylinderReceiverV4(connector){
  if(connector?.family!=='cylinder'||connector?.gender!=='female')return false
  if(String(connector.geometry?.caps||'one').trim().toLowerCase()!=='none')return false
  if(explicitOneSidedCylinderReceiverV4(connector))return false
  return symmetricCylinderProfileV4(connector)
}
