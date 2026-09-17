export const MULTI_CONTACT_BRIDGE_VERSION_V4='multi-contact-bridge-v4.1.0'

const DEFAULT_MAX_CONTACTS=32
const DEFAULT_CAPTURE_EPS_STUD=0.005
const DEFAULT_ROTATION_EPS_RAD=5e-4

const AXIAL_MULTI_CONTACT_FAMILIES=new Set([
  'technic-pin-hole',
  'technic-axle-keyed-hole',
  'technic-axle-round-hole',
  'bar-round-hole',
  'round-cylindrical-interface',
  'round-revolute-interface',
  'keyed-shaft-interface',
])

function finiteOr(value,fallback){return Number.isFinite(value)?value:fallback}

export function isAxialMultiContactFamilyV4(family){
  return AXIAL_MULTI_CONTACT_FAMILIES.has(String(family||''))
}

export function commitAlignedAxialContactsV4(v4,sourceObject,targetObjects,{
  maxContacts=DEFAULT_MAX_CONTACTS,
  captureEpsilonStud=DEFAULT_CAPTURE_EPS_STUD,
  rotationEpsilonRad=DEFAULT_ROTATION_EPS_RAD,
  minAxisAlignment=0.9999,
}={}){
  if(!v4?.findActiveCandidate||!v4?.commitActiveCandidate||!sourceObject)return{committed:[],attempted:0,stopped:'runtime-unavailable'}
  const targets=[...new Set((targetObjects??[]).filter(object=>object&&object!==sourceObject))]
  if(!targets.length)return{committed:[],attempted:0,stopped:'no-targets'}

  const committed=[]
  const seen=new Set()
  let attempted=0
  let stopped='no-more-aligned-contacts'
  const limit=Math.max(0,Math.min(256,Math.trunc(finiteOr(maxContacts,DEFAULT_MAX_CONTACTS))))

  for(let index=0;index<limit;index+=1){
    let candidate
    try{
      candidate=v4.findActiveCandidate(sourceObject,targets,{
        maxResults:Number.POSITIVE_INFINITY,
        captureDistanceStud:captureEpsilonStud,
        minAxisAlignment,
      })
    }catch(error){
      stopped='candidate-error'
      break
    }
    if(!candidate)break

    const family=candidate.certification?.activation?.family
    if(!isAxialMultiContactFamilyV4(family)){
      stopped='non-axial-family'
      break
    }
    const correction=finiteOr(candidate.solution?.diagnostics?.captureCorrectionStud,Number.POSITIVE_INFINITY)
    const rotation=Math.abs(finiteOr(candidate.solution?.diagnostics?.rotationRad,Number.POSITIVE_INFINITY))
    if(correction>captureEpsilonStud||rotation>rotationEpsilonRad){
      stopped='not-already-aligned'
      break
    }

    const proposalId=candidate.proposal?.id
    if(proposalId&&seen.has(proposalId)){
      stopped='duplicate-candidate'
      break
    }
    if(proposalId)seen.add(proposalId)
    attempted+=1

    let result
    try{result=v4.commitActiveCandidate(candidate)}catch(error){
      stopped='commit-error'
      break
    }
    if(!result?.accepted){
      stopped=result?.reason||'commit-rejected'
      break
    }
    const id=result.connection?.id||proposalId
    if(id)committed.push(id)
  }

  return{committed,attempted,stopped,version:MULTI_CONTACT_BRIDGE_VERSION_V4}
}
