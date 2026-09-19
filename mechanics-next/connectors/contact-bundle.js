import { endpointSemanticKind } from '../intelligence/endpoint-semantics.js'
import { matchMechanicalEndpoints } from './profile-matcher.js'

export const STUD_BUNDLE_POSITION_EPS=.045
export const STUD_BUNDLE_AXIS_DOT=.997

export function endpointByObservedId(instance,endpointId){
  const wanted=String(endpointId||'')
  return instance?.endpoints?.find(endpoint=>
    String(endpoint?.id||'')===wanted||
    String(endpoint?.metadata?.legacyEndpointId||'')===wanted||
    String(endpoint?.metadata?.compatibilityEndpointId||'')===wanted||
    String(endpoint?.metadata?.sourceEndpointId||'')===wanted||
    String(endpoint?.metadata?.templateKey||'')===wanted
  )??null
}

export function validateStudContactBundle(bundle,{
  instanceA,
  instanceB,
  frameAForEndpoint,
  frameBForEndpoint,
}={}){
  const contacts=Array.isArray(bundle?.contacts)?bundle.contacts:[]
  if(bundle?.kind!=='stud-bundle'||contacts.length<2||Number(bundle?.contactCount)!==contacts.length){
    return Object.freeze({valid:false,reason:'bundle-shape'})
  }
  if(typeof frameAForEndpoint!=='function'||typeof frameBForEndpoint!=='function'){
    return Object.freeze({valid:false,reason:'bundle-frame-provider-missing'})
  }

  const seenA=new Set(),seenB=new Set(),verified=[]
  for(const contact of contacts){
    const idA=String(contact?.sourceEndpointId||'')
    const idB=String(contact?.targetEndpointId||'')
    if(!idA||!idB||seenA.has(idA)||seenB.has(idB)){
      return Object.freeze({valid:false,reason:'bundle-endpoint-identity'})
    }
    const endpointA=endpointByObservedId(instanceA,idA)
    const endpointB=endpointByObservedId(instanceB,idB)
    if(!endpointA||!endpointB){
      return Object.freeze({valid:false,reason:'bundle-endpoint-missing',endpointA:idA,endpointB:idB})
    }
    const match=matchMechanicalEndpoints(endpointA,endpointB,{
      classificationA:instanceA?.descriptor?.classification,
      classificationB:instanceB?.descriptor?.classification,
    })
    const pair=new Set(match?.interfacePair||[])
    if(!match?.compatible||!match?.interfaceRule||
       !pair.has('stud')||!pair.has('anti-stud')||
       match.interfaceRule?.topology?.bundleCanBecomeRigid!==true){
      return Object.freeze({valid:false,reason:'bundle-interface-mismatch',endpointA:idA,endpointB:idB})
    }

    const frameA=frameAForEndpoint(endpointA)
    const frameB=frameBForEndpoint(endpointB)
    if(!frameA||!frameB){
      return Object.freeze({valid:false,reason:'bundle-frame-missing',endpointA:idA,endpointB:idB})
    }
    const dx=frameA.position[0]-frameB.position[0]
    const dy=frameA.position[1]-frameB.position[1]
    const dz=frameA.position[2]-frameB.position[2]
    const distance=Math.hypot(dx,dy,dz)
    const axis=Math.abs(
      frameA.axis[0]*frameB.axis[0]+
      frameA.axis[1]*frameB.axis[1]+
      frameA.axis[2]*frameB.axis[2]
    )
    if(distance>STUD_BUNDLE_POSITION_EPS||axis<STUD_BUNDLE_AXIS_DOT){
      return Object.freeze({
        valid:false,
        reason:'bundle-geometry-mismatch',
        endpointA:idA,
        endpointB:idB,
        distanceStud:distance,
        axisAlignment:axis,
      })
    }

    seenA.add(idA);seenB.add(idB)
    verified.push(Object.freeze({
      sourceEndpointId:idA,
      targetEndpointId:idB,
      sourceSemantic:endpointSemanticKind(endpointA),
      targetSemantic:endpointSemanticKind(endpointB),
    }))
  }

  return Object.freeze({
    valid:true,
    bundle:Object.freeze({
      kind:'stud-bundle',
      contactCount:verified.length,
      contacts:Object.freeze(verified),
    }),
  })
}
