import * as THREE from 'three'
import {
  disposeRapierMechanicsPlan,
  materializeRapierMechanicsPlan,
} from './rapier-adapter.js'

export const COMPOUND_MEMBER_MATERIALIZER_VERSION='mechanics-compound-member-materializer-0.1.0'

const vec=a=>({x:Number(a[0]),y:Number(a[1]),z:Number(a[2])})
const quat=a=>({x:Number(a[0]),y:Number(a[1]),z:Number(a[2]),w:Number(a[3])})

function worldMatrixFor(spec){
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...spec.position),
    new THREE.Quaternion(...spec.quaternion),
    new THREE.Vector3(1,1,1),
  )
}

function createMember(session,spec,worldUnitsPerStud){
  const RAPIER=session.RAPIER
  const world=session.world
  if(!RAPIER?.RigidBodyDesc?.dynamic||!RAPIER?.ColliderDesc?.cuboid){
    throw new Error('Rapier rigid-body/collider constructors unavailable')
  }

  const bodyDesc=RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(...spec.position.map(value=>value*worldUnitsPerStud))
    .setRotation(quat(spec.quaternion))
    .setCanSleep(false)
  const body=world.createRigidBody(bodyDesc)
  if(!body)throw new Error(`Could not create compound body ${spec.memberId}`)

  const h=spec.collider.halfExtents
  const collider=RAPIER.ColliderDesc.cuboid(
      h[0]*worldUnitsPerStud,
      h[1]*worldUnitsPerStud,
      h[2]*worldUnitsPerStud,
    )
    .setTranslation(...spec.collider.center.map(value=>value*worldUnitsPerStud))
    .setFriction(.9)
    .setRestitution(.02)
    .setDensity(.7)
  world.createCollider(collider,body)

  const bodyWorldMatrix=worldMatrixFor(spec)
  const bodyWorldRotation=new THREE.Quaternion(...spec.quaternion)
  const component={
    id:spec.memberId,
    body,
    bodyWorldMatrix,
    bodyWorldInverse:bodyWorldMatrix.clone().invert(),
    bodyWorldRotation,
    members:[],
    mechanicsNextCompound:true,
  }
  const member={
    object:spec.sceneProxy??null,
    body,
    component,
    relativeMatrix:new THREE.Matrix4(),
    mechanicsNextCompound:true,
    memberId:spec.memberId,
    path:spec.path,
  }
  component.members.push(member)
  return{spec,body,component,member}
}

function removeBody(session,entry){
  try{session.world?.removeRigidBody?.(entry.body)}catch{}
}

function internalStructuralPlan(plan){
  return Object.freeze({
    blockers:Object.freeze([]),
    joints:Object.freeze((plan.joints||[]).map(item=>Object.freeze({
      id:item.id,
      kind:item.kind,
      bodyA:item.memberA,
      bodyB:item.memberB,
      frame:Object.freeze({
        positionStud:item.anchorWorldStud,
        axisWorld:item.axisWorld??Object.freeze([0,1,0]),
        degraded:false,
      }),
      limits:null,
      dynamics:null,
      release:Object.freeze({
        mode:'persistent',
        sourceConstraintIds:Object.freeze([]),
      }),
      contacts:'disabled-for-connected-pair',
    }))),
    transmissions:Object.freeze([]),
    dynamics:Object.freeze([]),
  })
}

function localPoint(entry,worldPointStud,worldUnitsPerStud){
  return new THREE.Vector3(...worldPointStud)
    .applyMatrix4(entry.component.bodyWorldInverse)
    .multiplyScalar(worldUnitsPerStud)
}

function bodyCenter(entry){
  const t=entry.body.translation?.()
  if(t)return new THREE.Vector3(t.x,t.y,t.z)
  return new THREE.Vector3().setFromMatrixPosition(entry.component.bodyWorldMatrix)
}

function materializeSpring(session,dynamic,createdById,worldUnitsPerStud){
  const housing=createdById.get(dynamic.housingMemberId)
  const rod=createdById.get(dynamic.rodMemberId)
  if(!housing||!rod)throw new Error('Spring-damper members are unavailable')
  if(typeof session.RAPIER?.JointData?.spring!=='function'){
    throw new Error('Rapier spring joint unavailable')
  }
  const centerA=bodyCenter(housing)
  const centerB=bodyCenter(rod)
  const distance=centerA.distanceTo(centerB)
  const rest=Number.isFinite(Number(dynamic.restLengthStud))
    ?Number(dynamic.restLengthStud)*worldUnitsPerStud
    :distance
  const stiffness=Number(dynamic.springStiffness)
  const damping=Number(dynamic.damping)
  if(!(Number.isFinite(stiffness)&&stiffness>=0&&Number.isFinite(damping)&&damping>=0)){
    throw new Error('Spring-damper parameters are not verified')
  }
  // Rapier body translations are already in physics units, but component matrices
  // intentionally stay in scene studs for editor/world-frame math. Spring anchors
  // are the member origins, so local zero is exact and avoids cross-unit inversion.
  const anchorA=new THREE.Vector3()
  const anchorB=new THREE.Vector3()
  const data=session.RAPIER.JointData.spring(
    rest,stiffness,damping,vec(anchorA.toArray()),vec(anchorB.toArray()),
  )
  const handle=session.world.createImpulseJoint(data,housing.body,rod.body,true)
  if(!handle)throw new Error('Rapier failed to create spring joint')
  handle.setContactsEnabled?.(false)
  return{dynamic,handle,housing,rod}
}

export function preflightCompoundMemberMaterialization(session,plan){
  const failures=[]
  if(!session?.world||!session?.RAPIER){
    failures.push(Object.freeze({code:'rapier-session-missing'}))
  }
  for(const blocker of plan?.blockers||[])failures.push(blocker)
  for(const replacement of plan?.replacements||[]){
    if(session?.members?.has?.(replacement.rootInstanceId)){
      failures.push(Object.freeze({
        code:'opaque-root-body-still-present',
        rootInstanceId:replacement.rootInstanceId,
        rootBodyId:replacement.rootBodyId,
      }))
    }
  }
  return Object.freeze({
    pass:failures.length===0,
    failures:Object.freeze(failures),
  })
}

export function materializeCompoundMemberPhysics(session,plan,{
  worldUnitsPerStud=.008,
}={}){
  const preflight=preflightCompoundMemberMaterialization(session,plan)
  if(!preflight.pass){
    const error=new Error(`Compound member materialization blocked: ${preflight.failures.length}`)
    error.failures=preflight.failures
    throw error
  }

  session.members??=new Map()
  session.components??=[]
  const created=[]
  const createdById=new Map()
  let internalJoints=null
  const springJoints=[]

  try{
    for(const spec of plan.bodies||[]){
      const entry=createMember(session,spec,worldUnitsPerStud)
      created.push(entry)
      createdById.set(spec.memberId,entry)
      session.members.set(spec.memberId,entry.member)
      session.components.push(entry.component)
    }

    const structural=internalStructuralPlan(plan)
    internalJoints=materializeRapierMechanicsPlan(session,structural,{
      resolveMember:id=>createdById.get(id)?.member??null,
      worldUnitsPerStud,
      contactsEnabled:false,
    })

    for(const dynamic of plan.dynamics||[]){
      if(dynamic.kind!=='spring-damper')continue
      springJoints.push(materializeSpring(session,dynamic,createdById,worldUnitsPerStud))
    }

    const replacementMap=new Map()
    for(const replacement of plan.replacements||[]){
      replacementMap.set(replacement.rootBodyId,Object.freeze({
        ...replacement,
        resolveEndpoint(endpointId){
          const memberId=replacement.endpointOwners?.[endpointId]??replacement.preferredRootMemberId
          return memberId?createdById.get(memberId)?.member??null:null
        },
        preferredMember:replacement.preferredRootMemberId
          ?createdById.get(replacement.preferredRootMemberId)?.member??null
          :null,
      }))
    }

    return Object.freeze({
      version:COMPOUND_MEMBER_MATERIALIZER_VERSION,
      members:Object.freeze(created),
      internalJoints,
      springJoints:Object.freeze(springJoints),
      replacements:replacementMap,
      resolveMember(memberId){return createdById.get(memberId)?.member??null},
    })
  }catch(error){
    if(internalJoints)disposeRapierMechanicsPlan(session,internalJoints)
    for(const spring of springJoints){
      try{session.world.removeImpulseJoint?.(spring.handle,true)}catch{}
    }
    for(const entry of [...created].reverse()){
      session.members.delete(entry.spec.memberId)
      const index=session.components.indexOf(entry.component)
      if(index>=0)session.components.splice(index,1)
      removeBody(session,entry)
    }
    throw error
  }
}

export function disposeCompoundMemberPhysics(session,state){
  let removed=0
  if(state?.internalJoints)removed+=disposeRapierMechanicsPlan(session,state.internalJoints)
  for(const spring of state?.springJoints||[]){
    try{
      session.world?.removeImpulseJoint?.(spring.handle,true)
      removed+=1
    }catch{}
  }
  for(const entry of state?.members||[]){
    session.members?.delete?.(entry.spec.memberId)
    const index=session.components?.indexOf?.(entry.component)??-1
    if(index>=0)session.components.splice(index,1)
    removeBody(session,entry)
    removed+=1
  }
  return removed
}
