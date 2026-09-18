import * as THREE from 'three'
import { deterministicId } from '../core/model.js'

export const COMPOUND_MEMBER_PHYSICS_PLAN_VERSION='mechanics-compound-member-physics-plan-0.1.0'
const EPS=1e-8

function matrixPose(matrix){
  const position=new THREE.Vector3()
  const quaternion=new THREE.Quaternion()
  const scale=new THREE.Vector3()
  matrix.decompose(position,quaternion,scale)
  return{position,quaternion,scale}
}

function finiteBounds(proxy){
  const raw=proxy?.userData?.mechanicalMemberBoundsLdu
  const center=Array.isArray(raw?.center)?raw.center.map(Number):null
  const size=Array.isArray(raw?.size)?raw.size.map(Number):null
  if(!center||!size||center.length!==3||size.length!==3)return null
  if(!center.every(Number.isFinite)||!size.every(value=>Number.isFinite(value)&&value>0))return null
  return{center,size}
}

function bodySpec(mapped){
  const proxy=mapped?.proxy
  const matrix=proxy?.matrixWorld
  const bounds=finiteBounds(proxy)
  if(!matrix||!bounds)return null
  proxy.updateWorldMatrix?.(true,false)
  const pose=matrixPose(proxy.matrixWorld)
  const signedScale=pose.scale
  const center=new THREE.Vector3(...bounds.center).multiply(signedScale)
  const size=new THREE.Vector3(...bounds.size)
  size.set(
    Math.abs(size.x*signedScale.x),
    Math.abs(size.y*signedScale.y),
    Math.abs(size.z*signedScale.z),
  )
  return Object.freeze({
    id:deterministicId('compound-physics-body',mapped.memberId),
    memberId:mapped.memberId,
    path:mapped.path,
    role:mapped.internalRole,
    position:Object.freeze(pose.position.toArray()),
    quaternion:Object.freeze(pose.quaternion.toArray()),
    collider:Object.freeze({
      kind:'cuboid',
      center:Object.freeze(center.toArray()),
      halfExtents:Object.freeze([size.x/2,size.y/2,size.z/2]),
      source:'ldraw-child-bounds',
    }),
  })
}

function normalize(v){
  const n=Math.hypot(...v)
  return n>EPS?v.map(value=>value/n):null
}

function memberCenter(spec){
  const q=new THREE.Quaternion(...spec.quaternion)
  const c=new THREE.Vector3(...spec.collider.center).applyQuaternion(q)
  return [
    spec.position[0]+c.x,
    spec.position[1]+c.y,
    spec.position[2]+c.z,
  ]
}

function inferredAxis(a,b){
  const pa=memberCenter(a),pb=memberCenter(b)
  return normalize([pb[0]-pa[0],pb[1]-pa[1],pb[2]-pa[2]])
}

function jointForTopology(topology,bodyByMember){
  const result=[]
  const blockers=[]
  for(const joint of topology?.joints||[]){
    const bodyA=bodyByMember.get(joint.bodyA)
    const bodyB=bodyByMember.get(joint.bodyB)
    if(!bodyA||!bodyB){
      blockers.push(Object.freeze({
        code:'compound-joint-member-missing',
        bodyA:joint.bodyA,
        bodyB:joint.bodyB,
      }))
      continue
    }
    let axis=null
    if(['prismatic','revolute','cylindrical'].includes(joint.kind)){
      axis=inferredAxis(bodyA,bodyB)
      if(!axis){
        blockers.push(Object.freeze({
          code:'compound-joint-axis-unresolved',
          bodyA:joint.bodyA,
          bodyB:joint.bodyB,
          jointKind:joint.kind,
        }))
        continue
      }
    }
    const anchor=memberCenter(bodyA).map((value,index)=>
      (value+memberCenter(bodyB)[index])/2)
    result.push(Object.freeze({
      id:deterministicId('compound-internal-joint',joint.kind,joint.bodyA,joint.bodyB),
      kind:joint.kind,
      memberA:joint.bodyA,
      memberB:joint.bodyB,
      anchorWorldStud:Object.freeze(anchor),
      axisWorld:axis?Object.freeze(axis):null,
      source:'shortcut-topology',
    }))
  }
  return{joints:result,blockers}
}

export function buildCompoundMemberPhysicsPlan({
  records=[],
  discovery=null,
}={}){
  const bodies=[]
  const joints=[]
  const dynamics=[]
  const blockers=[]
  const replacements=[]

  const descriptorByRoot=new Map(
    (discovery?.compoundDescriptors||[])
      .filter(item=>item?.bodyId)
      .map(item=>[String(item.bodyId),item]),
  )
  const dynamicByRoot=new Map(
    (discovery?.dynamics||[])
      .filter(item=>item?.bodyId)
      .map(item=>[String(item.bodyId),item]),
  )

  for(const record of records){
    const decomposition=record?.compoundDecomposition
    const sceneMap=record?.compoundSceneMap
    if(!decomposition||!sceneMap)continue
    const rootBodyId=String(record.instance.body.id)
    const descriptor=descriptorByRoot.get(rootBodyId)
    if(!descriptor||descriptor.status!=='decomposed-awaiting-materialization')continue

    if(!sceneMap.complete){
      blockers.push(Object.freeze({
        code:'compound-scene-members-incomplete',
        bodyId:rootBodyId,
        missing:sceneMap.missing,
      }))
      continue
    }

    const ownership=record.compoundEndpointOwnership
    if((record?.instance?.endpoints?.length||0)>0&&!ownership?.complete){
      blockers.push(Object.freeze({
        code:'compound-endpoint-ownership-incomplete',
        bodyId:rootBodyId,
        unresolved:ownership?.unresolved??Object.freeze([]),
      }))
      continue
    }

    const planned=[]
    const bodyByMember=new Map()
    for(const mapped of sceneMap.mapped){
      const spec=bodySpec(mapped)
      if(!spec){
        blockers.push(Object.freeze({
          code:'compound-member-bounds-missing',
          bodyId:rootBodyId,
          memberId:mapped.memberId,
        }))
        continue
      }
      planned.push(spec)
      bodyByMember.set(mapped.memberId,spec)
    }
    if(planned.length!==sceneMap.memberCount)continue

    const topology=decomposition.topology
    const internal=jointForTopology(topology,bodyByMember)
    blockers.push(...internal.blockers)
    bodies.push(...planned)
    joints.push(...internal.joints)
    replacements.push(Object.freeze({
      rootBodyId,
      rootInstanceId:record.instance.body.instanceId,
      rootPartId:record.instance.body.partId,
      memberBodyIds:Object.freeze(planned.map(item=>item.id)),
      memberIds:Object.freeze(planned.map(item=>item.memberId)),
      preferredRootMemberId:
        topology?.housingMemberId ??
        topology?.inputMemberId ??
        planned[0]?.memberId ??
        null,
      endpointOwners:Object.freeze(Object.fromEntries(
        (ownership?.assignments||[]).map(item=>[item.endpointId,item.memberId]),
      )),
    }))

    const dynamic=dynamicByRoot.get(rootBodyId)
    if(dynamic?.kind==='spring-damper'){
      const housing=topology?.housingMemberId
      const rod=topology?.rodMemberId
      if(housing&&rod){
        dynamics.push(Object.freeze({
          ...dynamic,
          bodyId:undefined,
          housingMemberId:housing,
          rodMemberId:rod,
          materialized:true,
        }))
      }
    }
  }

  return Object.freeze({
    version:COMPOUND_MEMBER_PHYSICS_PLAN_VERSION,
    pass:blockers.length===0,
    bodies:Object.freeze(bodies),
    joints:Object.freeze(joints),
    dynamics:Object.freeze(dynamics),
    replacements:Object.freeze(replacements),
    blockers:Object.freeze(blockers),
    stats:Object.freeze({
      bodies:bodies.length,
      joints:joints.length,
      dynamics:dynamics.length,
      replacements:replacements.length,
      blockers:blockers.length,
    }),
  })
}
