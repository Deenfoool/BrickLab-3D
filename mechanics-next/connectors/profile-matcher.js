import { endpointSemanticKind } from '../intelligence/endpoint-semantics.js'
import { mechanicalInterfaceRule } from '../intelligence/interface-rules.js'
import { semanticInterfaceVariants } from '../intelligence/interface-variants.js'

export const PROFILE_MATCHER_VERSION = 'mechanics-profile-matcher-0.1.0'
export const PROFILE_TOLERANCES = Object.freeze({
  radiusLdu:.35,
  lengthLdu:.5,
})

const rigidShape = section => ['_L','L_'].includes(section?.shape) ? 'R' : section?.shape
const approx = (a,b,tolerance=PROFILE_TOLERANCES.radiusLdu) =>
  Number.isFinite(Number(a)) && Number.isFinite(Number(b)) &&
  Math.abs(Number(a)-Number(b)) <= tolerance

function group(endpoint) {
  return String(endpoint?.metadata?.group || '')
}

function groupCompatible(a,b) {
  const ga=group(a), gb=group(b)
  return !ga && !gb ? true : ga===gb
}

function maleFemale(a,b) {
  if (a?.gender==='male' && b?.gender==='female') return { male:a, female:b, reversed:false }
  if (b?.gender==='male' && a?.gender==='female') return { male:b, female:a, reversed:true }
  return null
}

export function sectionProfileFit(maleSection, femaleSection) {
  const maleShape=rigidShape(maleSection)
  const femaleShape=rigidShape(femaleSection)
  const maleRadius=Number(maleSection?.radiusLdu)
  const femaleRadius=Number(femaleSection?.radiusLdu)
  if (!(Number.isFinite(maleRadius) && Number.isFinite(femaleRadius))) {
    return Object.freeze({compatible:false,reason:'radius-missing'})
  }
  if (maleRadius > femaleRadius + PROFILE_TOLERANCES.radiusLdu) {
    return Object.freeze({compatible:false,reason:'radius',clearanceLdu:femaleRadius-maleRadius})
  }

  if (maleShape==='R' && ['R','S'].includes(femaleShape)) {
    return Object.freeze({compatible:true,keyed:false,mode:'round-round',clearanceLdu:femaleRadius-maleRadius})
  }
  if (maleShape==='A' && femaleShape==='A') {
    return Object.freeze({compatible:true,keyed:true,symmetry:4,mode:'axle-axle',clearanceLdu:femaleRadius-maleRadius})
  }
  if (maleShape==='S' && femaleShape==='S') {
    return Object.freeze({compatible:true,keyed:true,symmetry:4,mode:'square-square',clearanceLdu:femaleRadius-maleRadius})
  }
  if (['A','S'].includes(maleShape) && femaleShape==='R') {
    return Object.freeze({
      compatible:true,
      keyed:false,
      symmetry:Infinity,
      mode:`${maleShape.toLowerCase()}-round`,
      clearanceLdu:femaleRadius-maleRadius,
    })
  }
  return Object.freeze({compatible:false,reason:'shape',mode:`${maleShape || '?'}-${femaleShape || '?'}`})
}

function cylinderProfile(endpoint) {
  return Array.isArray(endpoint?.profile?.sections) ? endpoint.profile.sections : []
}

function intendedInterfaceRule(a,b,{classificationA=null,classificationB=null}={}) {
  const semanticA=endpointSemanticKind(a)
  const semanticB=endpointSemanticKind(b)

  if(semanticA==='rim-tire-interface'&&semanticB==='rim-tire-interface'){
    const roleA=classificationA?.role
    const roleB=classificationB?.role
    if(roleA==='tire'&&roleB==='rim'){
      const rule=mechanicalInterfaceRule('tyre','rim')
      return {rule,pair:rule?['tyre','rim']:null,semanticA,semanticB}
    }
    if(roleA==='rim'&&roleB==='tire'){
      const rule=mechanicalInterfaceRule('rim','tyre')
      return {rule,pair:rule?['rim','tyre']:null,semanticA,semanticB}
    }
    return {rule:null,pair:null,semanticA,semanticB}
  }

  for (const left of semanticInterfaceVariants(semanticA,{endpoint:a})) {
    for (const right of semanticInterfaceVariants(semanticB,{endpoint:b})) {
      const rule=mechanicalInterfaceRule(left,right)
      if (rule) return {rule,pair:[left,right],semanticA,semanticB}
    }
  }
  return {rule:null,pair:null,semanticA,semanticB}
}

function cylinderMatch(a,b,context={}) {
  const pair=maleFemale(a,b)
  if (!pair) return {compatible:false,reason:'cylinder-gender'}
  const maleSections=cylinderProfile(pair.male)
  const femaleSections=cylinderProfile(pair.female)
  if (!maleSections.length || !femaleSections.length) return {compatible:false,reason:'cylinder-profile-empty'}

  const compatiblePairs=[]
  const incompatiblePairs=[]
  for (let mi=0;mi<maleSections.length;mi+=1) {
    for (let fi=0;fi<femaleSections.length;fi+=1) {
      const fit=sectionProfileFit(maleSections[mi],femaleSections[fi])
      const record={maleIndex:mi,femaleIndex:fi,fit}
      ;(fit.compatible?compatiblePairs:incompatiblePairs).push(record)
    }
  }
  if (!compatiblePairs.length) return {compatible:false,reason:'cylinder-profile'}

  compatiblePairs.sort((x,y)=>{
    const keyedDelta=Number(Boolean(y.fit.keyed))-Number(Boolean(x.fit.keyed))
    if (keyedDelta) return keyedDelta
    return Math.abs(x.fit.clearanceLdu)-Math.abs(y.fit.clearanceLdu)
  })
  const best=compatiblePairs[0]
  const slide=Boolean(a?.capabilities?.includes?.('slide') || b?.capabilities?.includes?.('slide'))
  const semantic=intendedInterfaceRule(a,b,context)

  return {
    compatible:true,
    family:'cylinder',
    reason:best.fit.mode,
    male:pair.male,
    female:pair.female,
    reversed:pair.reversed,
    keyed:Boolean(best.fit.keyed),
    rotationalSymmetry:best.fit.symmetry ?? (best.fit.keyed?4:Infinity),
    axialSlide:slide,
    freeTwist:!best.fit.keyed,
    compatiblePairs:Object.freeze(compatiblePairs),
    incompatiblePairs:Object.freeze(incompatiblePairs),
    requiresAxialFit:true,
    interfaceRule:semantic.rule,
    interfacePair:semantic.pair,
    semanticA:semantic.semanticA,
    semanticB:semantic.semanticB,
  }
}

function clipCylinderMatch(a,b,context={}) {
  const clip=a?.family==='clip'?a:b?.family==='clip'?b:null
  const cylinder=a?.family==='cylinder'?a:b?.family==='cylinder'?b:null
  if (!clip || !cylinder || cylinder.gender!=='male') return {compatible:false,reason:'clip-pair'}
  const clipRadius=Number(clip?.profile?.radiusLdu)
  const candidates=cylinderProfile(cylinder)
    .filter(section=>rigidShape(section)==='R')
    .map((section,index)=>({section,index,clearance:clipRadius-Number(section.radiusLdu)}))
    .filter(candidate=>Number.isFinite(candidate.clearance) && Math.abs(candidate.clearance)<=PROFILE_TOLERANCES.radiusLdu)
    .sort((x,y)=>Math.abs(x.clearance)-Math.abs(y.clearance))
  if (!candidates.length) return {compatible:false,reason:'clip-radius'}
  const semantic=intendedInterfaceRule(a,b,context)
  return {
    compatible:true,
    family:'clip-cylinder',
    reason:'round-clip',
    keyed:false,
    rotationalSymmetry:Infinity,
    axialSlide:Boolean(clip?.capabilities?.includes?.('slide') || cylinder?.capabilities?.includes?.('slide')),
    freeTwist:true,
    requiresAxialFit:true,
    fit:Object.freeze(candidates[0]),
    interfaceRule:semantic.rule,
    interfacePair:semantic.pair,
    semanticA:semantic.semanticA,
    semanticB:semantic.semanticB,
  }
}

function fingerSegments(endpoint) {
  const sequence=endpoint?.profile?.sequenceLdu || []
  const total=sequence.reduce((sum,value)=>sum+Number(value||0),0)
  let cursor=endpoint?.profile?.centered ? -total/2 : 0
  let gender=endpoint?.profile?.firstGender || 'male'
  return sequence.map(length=>{
    const segment={start:cursor,end:cursor+Number(length),gender}
    cursor+=Number(length)
    gender=gender==='male'?'female':'male'
    return segment
  })
}

function fingersMatch(a,b,context={}) {
  if (a?.family!=='fingers' || b?.family!=='fingers') return {compatible:false,reason:'fingers-pair'}
  if (!groupCompatible(a,b)) return {compatible:false,reason:'group'}
  if (!approx(a?.profile?.radiusLdu,b?.profile?.radiusLdu)) return {compatible:false,reason:'finger-radius'}
  const aa=fingerSegments(a), bb=fingerSegments(b)
  const boundaries=[...new Set([...aa.flatMap(x=>[x.start,x.end]),...bb.flatMap(x=>[x.start,x.end])])].sort((x,y)=>x-y)
  for (let index=0;index<boundaries.length-1;index+=1) {
    const mid=(boundaries[index]+boundaries[index+1])/2
    const sa=aa.find(x=>mid>x.start+1e-6&&mid<x.end-1e-6)
    const sb=bb.find(x=>mid>x.start+1e-6&&mid<x.end-1e-6)
    if (sa&&sb&&sa.gender===sb.gender) return {compatible:false,reason:'finger-overlap'}
  }
  const semantic=intendedInterfaceRule(a,b,context)
  return {
    compatible:true,
    family:'fingers',
    reason:'interlocking-fingers',
    keyed:false,
    rotationalSymmetry:Infinity,
    axialSlide:false,
    freeTwist:true,
    requiresAxialFit:false,
    interfaceRule:semantic.rule,
    interfacePair:semantic.pair,
    semanticA:semantic.semanticA,
    semanticB:semantic.semanticB,
  }
}

function boundingKind(value){return value?.kind||'point'}
function close(a,b,tolerance){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance}
function boundingCompatible(a,b,mode) {
  const ka=boundingKind(a), kb=boundingKind(b)
  if (mode==='group') return true
  if (ka!==kb) return false
  if (mode==='shape') return true
  if (ka==='point') return true
  if (ka==='sphere') return close(a.radiusLdu,b.radiusLdu,PROFILE_TOLERANCES.radiusLdu)
  if (ka==='cube') return close(a.halfSizeLdu,b.halfSizeLdu,PROFILE_TOLERANCES.lengthLdu)
  if (ka==='cylinder') return close(a.radiusLdu,b.radiusLdu,PROFILE_TOLERANCES.radiusLdu)&&close(a.lengthLdu,b.lengthLdu,PROFILE_TOLERANCES.lengthLdu)
  if (ka==='box') return Array.isArray(a.halfExtentsLdu)&&Array.isArray(b.halfExtentsLdu)&&a.halfExtentsLdu.every((value,index)=>close(value,b.halfExtentsLdu[index],PROFILE_TOLERANCES.lengthLdu))
  return false
}
function genericMode(a,b){
  const rank={group:0,shape:1,size:2}
  const ma=String(a?.metadata?.snap?.match||'shape').toLowerCase()
  const mb=String(b?.metadata?.snap?.match||'shape').toLowerCase()
  return (rank[ma]??1)>=(rank[mb]??1)?ma:mb
}
function genericMatch(a,b,context={}){
  if(a?.family!=='generic'||b?.family!=='generic')return{compatible:false,reason:'generic-pair'}
  if(a?.profile?.kind==='linear-guide'||b?.profile?.kind==='linear-guide'){
    const types=new Set([a?.metadata?.builtinType,b?.metadata?.builtinType])
    if(a?.profile?.kind!=='linear-guide'||b?.profile?.kind!=='linear-guide'||
      !types.has('slider')||!types.has('slider-rail'))return{compatible:false,reason:'linear-guide-pair'}
    const semantic=intendedInterfaceRule(a,b,context)
    return{compatible:true,family:'generic',reason:'linear-guide',keyed:true,
      rotationalSymmetry:1,freeOrientation:false,freeTwist:false,requiresAxialFit:false,
      interfaceRule:semantic.rule,interfacePair:semantic.pair,
      semanticA:semantic.semanticA,semanticB:semantic.semanticB}
  }
  if(!maleFemale(a,b))return{compatible:false,reason:'generic-gender'}
  if(group(a)!==group(b))return{compatible:false,reason:'group'}
  const mode=genericMode(a,b)
  if(!boundingCompatible(a?.profile?.bounding,b?.profile?.bounding,mode))return{compatible:false,reason:`generic-${mode}`}
  const pa=String(a?.metadata?.snap?.placement||'aligned').toLowerCase()
  const pb=String(b?.metadata?.snap?.placement||'aligned').toLowerCase()
  const free=pa==='free'||pb==='free'
  const retained=pa==='retain'||pb==='retain'
  return{
    compatible:true,family:'generic',reason:`generic-${mode}`,matchMode:mode,
    keyed:!(free||retained),rotationalSymmetry:free||retained?Infinity:1,
    freeOrientation:free,retainOrientation:retained,freeTwist:free||retained,
    requiresAxialFit:false,
  }
}
function sphereMatch(a,b,context={}){
  if(a?.family!=='sphere'||b?.family!=='sphere')return{compatible:false,reason:'sphere-pair'}
  if(!maleFemale(a,b))return{compatible:false,reason:'sphere-gender'}
  if(!groupCompatible(a,b))return{compatible:false,reason:'group'}
  if(!approx(a?.profile?.radiusLdu,b?.profile?.radiusLdu))return{compatible:false,reason:'sphere-radius'}
  const semantic=intendedInterfaceRule(a,b,context)
  return{
    compatible:true,family:'sphere',reason:'ball-socket',keyed:false,
    rotationalSymmetry:Infinity,freeOrientation:true,freeTwist:true,requiresAxialFit:false,
    interfaceRule:semantic.rule,interfacePair:semantic.pair,
    semanticA:semantic.semanticA,semanticB:semantic.semanticB,
  }
}

export function matchMechanicalEndpoints(a,b,context={}){
  if(!a||!b)return Object.freeze({compatible:false,reason:'missing'})
  if(!groupCompatible(a,b))return Object.freeze({compatible:false,reason:'group'})
  let result
  if(a.family==='cylinder'&&b.family==='cylinder')result=cylinderMatch(a,b,context)
  else if((a.family==='clip'&&b.family==='cylinder')||(b.family==='clip'&&a.family==='cylinder'))result=clipCylinderMatch(a,b,context)
  else if(a.family==='fingers'&&b.family==='fingers')result=fingersMatch(a,b,context)
  else if(a.family==='generic'&&b.family==='generic')result=genericMatch(a,b,context)
  else if(a.family==='sphere'&&b.family==='sphere')result=sphereMatch(a,b,context)
  else result={compatible:false,reason:'family'}
  return Object.freeze(result)
}
