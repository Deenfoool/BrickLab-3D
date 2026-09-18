import { sectionProfileFit } from './profile-matcher.js'

export const AXIAL_FIT_VERSION = 'mechanics-axial-fit-0.1.0'
const EPS=1e-7

function sectionsWithIntervals(endpoint){
  const sections=Array.isArray(endpoint?.profile?.sections)?endpoint.profile.sections:[]
  const total=sections.reduce((sum,section)=>sum+Math.max(0,Number(section.lengthLdu)||0),0)
  let cursor=endpoint?.profile?.centered ? -total/2 : 0
  return sections.map((section,index)=>{
    const length=Math.max(0,Number(section.lengthLdu)||0)
    const value={index,section,start:cursor,end:cursor+length}
    cursor+=length
    return value
  })
}
function overlapLength(a0,a1,b0,b1){return Math.max(0,Math.min(a1,b1)-Math.max(a0,b0))}
function uniqueSorted(values){
  return [...new Set(values.filter(Number.isFinite).map(value=>Math.round(value*1e8)/1e8))].sort((a,b)=>a-b)
}

export function evaluateAxialOffset(male,female,offsetLdu,{
  minimumEngagementLdu=1,
  collisionEpsilonLdu=1e-5,
}={}){
  const maleSections=sectionsWithIntervals(male)
  const femaleSections=sectionsWithIntervals(female)
  let engagement=0
  const contacts=[]
  const collisions=[]

  for(const m of maleSections){
    const ms=m.start+offsetLdu, me=m.end+offsetLdu
    for(const f of femaleSections){
      const overlap=overlapLength(ms,me,f.start,f.end)
      if(overlap<=collisionEpsilonLdu)continue
      const fit=sectionProfileFit(m.section,f.section)
      const record={maleIndex:m.index,femaleIndex:f.index,overlapLdu:overlap,fit}
      if(fit.compatible){
        engagement+=overlap
        contacts.push(record)
      }else collisions.push(record)
    }
  }
  return Object.freeze({
    valid:collisions.length===0&&engagement+EPS>=minimumEngagementLdu,
    offsetLdu:Number(offsetLdu),
    engagementLdu:engagement,
    contacts:Object.freeze(contacts),
    collisions:Object.freeze(collisions),
    reason:collisions.length?'profile-collision':engagement+EPS<minimumEngagementLdu?'insufficient-engagement':'ok',
  })
}

export function axialCriticalOffsets(male,female){
  const m=sectionsWithIntervals(male), f=sectionsWithIntervals(female)
  const values=[]
  for(const ms of m){
    for(const fs of f){
      for(const mb of [ms.start,ms.end]){
        for(const fb of [fs.start,fs.end]) values.push(fb-mb)
      }
    }
  }
  return uniqueSorted(values)
}

export function solveAxialFit(male,female,{
  requestedOffsetLdu=0,
  minimumEngagementLdu=1,
  searchMarginLdu=40,
}={}){
  if(!male||!female)return Object.freeze({valid:false,reason:'missing-endpoint',solutions:Object.freeze([])})
  const critical=axialCriticalOffsets(male,female)
  if(!critical.length)return Object.freeze({valid:false,reason:'profile-empty',solutions:Object.freeze([])})

  const min=critical[0]-Math.abs(searchMarginLdu)
  const max=critical.at(-1)+Math.abs(searchMarginLdu)
  const samples=[requestedOffsetLdu,...critical]
  const boundaries=[min,...critical,max]
  for(let i=0;i<boundaries.length-1;i+=1){
    const a=boundaries[i], b=boundaries[i+1]
    if(b-a>EPS)samples.push((a+b)/2)
  }

  const validSamples=uniqueSorted(samples)
    .map(offset=>evaluateAxialOffset(male,female,offset,{minimumEngagementLdu}))
    .filter(result=>result.valid)
  if(!validSamples.length){
    const requested=evaluateAxialOffset(male,female,requestedOffsetLdu,{minimumEngagementLdu})
    return Object.freeze({
      valid:false,
      reason:requested.reason,
      requested,
      solutions:Object.freeze([]),
      criticalOffsets:Object.freeze(critical),
    })
  }

  validSamples.sort((a,b)=>{
    const da=Math.abs(a.offsetLdu-requestedOffsetLdu), db=Math.abs(b.offsetLdu-requestedOffsetLdu)
    if(Math.abs(da-db)>EPS)return da-db
    return b.engagementLdu-a.engagementLdu
  })
  return Object.freeze({
    valid:true,
    reason:'ok',
    requestedOffsetLdu,
    best:validSamples[0],
    solutions:Object.freeze(validSamples),
    criticalOffsets:Object.freeze(critical),
  })
}
