import * as THREE from 'three'
import { worldConnectorFrame } from '../connectors/world-frame.js'

export const COMPOUND_ENDPOINT_OWNERSHIP_VERSION='mechanics-compound-endpoint-ownership-0.1.0'

function boundsOf(proxy){
  const value=proxy?.userData?.mechanicalMemberBoundsLdu
  if(!Array.isArray(value?.center)||!Array.isArray(value?.size))return null
  const center=value.center.map(Number),size=value.size.map(Number)
  if(center.length!==3||size.length!==3||!center.every(Number.isFinite)||
     !size.every(item=>Number.isFinite(item)&&item>0))return null
  return{center,size}
}

function boxDistance(point,bounds){
  let sq=0
  let inside=true
  let normalizedSq=0
  for(let i=0;i<3;i+=1){
    const half=bounds.size[i]/2
    const delta=Math.abs(point[i]-bounds.center[i])
    const outside=Math.max(0,delta-half)
    if(outside>0)inside=false
    sq+=outside*outside
    normalizedSq+=(delta/Math.max(half,1e-9))**2
  }
  return{inside,distanceLdu:Math.sqrt(sq),normalizedDistance:Math.sqrt(normalizedSq)}
}

function endpointWorldPosition(record,endpoint){
  const frame=worldConnectorFrame(
    record.pose,
    endpoint,
    {visualOffsetStud:record.visualOffsetStud||[0,0,0]},
  )
  return frame.position
}

export function assignCompoundEndpointOwnership(record,{
  nearToleranceLdu=4,
  ambiguityEpsilon=.08,
}={}){
  const sceneMap=record?.compoundSceneMap
  if(!sceneMap?.complete)return Object.freeze({
    version:COMPOUND_ENDPOINT_OWNERSHIP_VERSION,
    complete:false,
    assignments:Object.freeze([]),
    unresolved:Object.freeze((record?.instance?.endpoints||[]).map(endpoint=>Object.freeze({
      endpointId:endpoint.id,
      reason:'compound-scene-map-incomplete',
    }))),
  })

  const candidates=sceneMap.mapped.map(mapped=>{
    const proxy=mapped.proxy
    const bounds=boundsOf(proxy)
    proxy?.updateWorldMatrix?.(true,false)
    return{
      mapped,
      bounds,
      inverse:proxy?.matrixWorld?.clone?.().invert?.()??null,
    }
  }).filter(item=>item.bounds&&item.inverse)

  const assignments=[]
  const unresolved=[]
  for(const endpoint of record?.instance?.endpoints||[]){
    let world
    try{world=endpointWorldPosition(record,endpoint)}
    catch(error){
      unresolved.push(Object.freeze({
        endpointId:endpoint.id,
        reason:'endpoint-world-frame-unavailable',
        detail:String(error?.message||error),
      }))
      continue
    }

    const scored=candidates.map(candidate=>{
      const local=new THREE.Vector3(...world).applyMatrix4(candidate.inverse).toArray()
      const distance=boxDistance(local,candidate.bounds)
      return{
        candidate,
        local,
        ...distance,
      }
    }).sort((a,b)=>
      Number(b.inside)-Number(a.inside) ||
      a.distanceLdu-b.distanceLdu ||
      a.normalizedDistance-b.normalizedDistance ||
      a.candidate.mapped.memberId.localeCompare(b.candidate.mapped.memberId))

    const best=scored[0]
    if(!best||(!best.inside&&best.distanceLdu>nearToleranceLdu)){
      unresolved.push(Object.freeze({
        endpointId:endpoint.id,
        reason:'no-near-physical-member',
        nearestMemberId:best?.candidate?.mapped?.memberId??null,
        distanceLdu:best?.distanceLdu??null,
      }))
      continue
    }

    const second=scored[1]
    const ambiguous=Boolean(
      second &&
      second.inside===best.inside &&
      Math.abs(second.distanceLdu-best.distanceLdu)<=ambiguityEpsilon &&
      Math.abs(second.normalizedDistance-best.normalizedDistance)<=ambiguityEpsilon
    )
    if(ambiguous){
      unresolved.push(Object.freeze({
        endpointId:endpoint.id,
        reason:'member-ownership-ambiguous',
        candidates:Object.freeze(scored.slice(0,2).map(item=>Object.freeze({
          memberId:item.candidate.mapped.memberId,
          inside:item.inside,
          distanceLdu:item.distanceLdu,
          normalizedDistance:item.normalizedDistance,
        }))),
      }))
      continue
    }

    assignments.push(Object.freeze({
      endpointId:endpoint.id,
      memberId:best.candidate.mapped.memberId,
      internalRole:best.candidate.mapped.internalRole,
      confidence:best.inside?'contained':'near',
      localPositionLdu:Object.freeze(best.local),
      distanceLdu:best.distanceLdu,
    }))
  }

  return Object.freeze({
    version:COMPOUND_ENDPOINT_OWNERSHIP_VERSION,
    complete:unresolved.length===0,
    assignments:Object.freeze(assignments),
    unresolved:Object.freeze(unresolved),
  })
}
