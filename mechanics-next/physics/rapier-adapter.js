import * as THREE from 'three'

export const MECHANICS_RAPIER_ADAPTER_VERSION='mechanics-rapier-adapter-0.1.0'
export const DEFAULT_STUD_METERS=.008

// Rapier GenericJoint axesMask describes LOCKED axes. The joint-frame X axis
// is aligned to the Mechanics Next joint axis.
export const RAPIER_LOCK_MASKS=Object.freeze({
  prismaticX:2|4|8|16|32,
  cylindricalX:2|4|16|32,
})

const vec=v=>({x:v.x,y:v.y,z:v.z})
const quat=q=>({x:q.x,y:q.y,z:q.z,w:q.w})

function finiteVector(value,label){
  const values=Array.isArray(value)?value.map(Number):null
  if(!values||values.length!==3||!values.every(Number.isFinite)){
    throw new Error(`${label} must be a finite vec3`)
  }
  return new THREE.Vector3(...values)
}

function memberComponent(member,label){
  if(!member?.body||!member?.component?.bodyWorldInverse||!member?.component?.bodyWorldRotation){
    throw new Error(`${label} lacks Rapier component transform metadata`)
  }
  return member.component
}

function localPoint(member,worldPointStud,studMeters){
  const component=memberComponent(member,'member')
  return worldPointStud.clone()
    .applyMatrix4(component.bodyWorldInverse)
    .multiplyScalar(studMeters)
}

function localDirection(member,worldDirection){
  const component=memberComponent(member,'member')
  return worldDirection.clone()
    .applyQuaternion(component.bodyWorldRotation.clone().invert())
    .normalize()
}

function axesCompatible(a,b,tolerance=1e-5){
  const aa=a.clone().normalize()
  const bb=b.clone().normalize()
  return aa.distanceToSquared(bb)<=tolerance*tolerance
}

function worldJointQuaternion(axisWorld){
  const x=axisWorld.clone().normalize()
  const seed=Math.abs(x.y)<.85
    ?new THREE.Vector3(0,1,0)
    :new THREE.Vector3(0,0,1)
  let y=seed.clone().projectOnPlane(x)
  if(y.lengthSq()<1e-10)y=new THREE.Vector3(1,0,0).projectOnPlane(x)
  y.normalize()
  const z=x.clone().cross(y).normalize()
  y=z.clone().cross(x).normalize()
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(x,y,z),
  ).normalize()
}

function localFrameQuaternion(member,worldQuaternion){
  return member.component.bodyWorldRotation.clone()
    .invert()
    .multiply(worldQuaternion)
    .normalize()
}

function resolveMembers(joint,resolveMember){
  const memberA=resolveMember(joint.bodyA)
  const memberB=resolveMember(joint.bodyB)
  if(!memberA||!memberB){
    throw new Error(`Physics member missing for ${joint.id}`)
  }
  return{memberA,memberB}
}

function configureContacts(jointHandle,enabled){
  if(typeof jointHandle?.setContactsEnabled!=='function'){
    throw new Error('Rapier joint contact-control API unavailable')
  }
  jointHandle.setContactsEnabled(Boolean(enabled))
}

function configureLimits(handle,item){
  if(!item.limits)return
  if(item.kind!=='revolute'&&item.kind!=='prismatic'){
    throw new Error(`Limits unsupported for ${item.kind}`)
  }
  if(typeof handle?.setLimits!=='function'){
    throw new Error('Rapier joint limits API unavailable')
  }
  let min=Number(item.limits.min)
  let max=Number(item.limits.max)
  if(item.kind==='prismatic'){
    const scale=Number(item.studMeters)||DEFAULT_STUD_METERS
    min*=scale
    max*=scale
  }
  if(!(Number.isFinite(min)&&Number.isFinite(max)&&min<=max)){
    throw new Error(`Invalid limits for ${item.id}`)
  }
  handle.setLimits(min,max)
}

function createJointData(RAPIER,item,memberA,memberB,{
  studMeters=DEFAULT_STUD_METERS,
}={}){
  const axisWorld=finiteVector(item.frame.axisWorld,'joint axis').normalize()
  const pointWorld=finiteVector(item.frame.positionStud,'joint anchor')
  const anchorA=localPoint(memberA,pointWorld,studMeters)
  const anchorB=localPoint(memberB,pointWorld,studMeters)
  const axisA=localDirection(memberA,axisWorld)
  const axisB=localDirection(memberB,axisWorld)
  const worldFrame=worldJointQuaternion(axisWorld)
  const frameA=localFrameQuaternion(memberA,worldFrame)
  const frameB=localFrameQuaternion(memberB,worldFrame)

  let data=null
  if(item.kind==='spherical'){
    if(typeof RAPIER.JointData.spherical!=='function')throw new Error('Rapier spherical joint unavailable')
    data=RAPIER.JointData.spherical(vec(anchorA),vec(anchorB))
  }else if(item.kind==='revolute'){
    if(typeof RAPIER.JointData.revoluteWithAxes==='function'){
      data=RAPIER.JointData.revoluteWithAxes(
        vec(anchorA),vec(anchorB),vec(axisA),vec(axisB),
      )
    }else{
      if(!axesCompatible(axisA,axisB)){
        throw new Error('Rapier revolute fallback cannot represent different local axes')
      }
      if(typeof RAPIER.JointData.revolute!=='function')throw new Error('Rapier revolute joint unavailable')
      data=RAPIER.JointData.revolute(vec(anchorA),vec(anchorB),vec(axisA))
    }
  }else if(item.kind==='prismatic'||item.kind==='cylindrical'){
    if(!axesCompatible(axisA,axisB)){
      throw new Error(`Rapier ${item.kind} GenericJoint cannot represent different local axes`)
    }
    if(typeof RAPIER.JointData.generic!=='function')throw new Error('Rapier GenericJoint unavailable')
    const mask=item.kind==='prismatic'
      ?RAPIER_LOCK_MASKS.prismaticX
      :RAPIER_LOCK_MASKS.cylindricalX
    data=RAPIER.JointData.generic(vec(anchorA),vec(anchorB),vec(axisA),mask)
  }else{
    throw new Error(`Unsupported Mechanics Next Rapier joint kind: ${item.kind}`)
  }

  return{
    data,
    anchorA,
    anchorB,
    axisA,
    axisB,
    frameA,
    frameB,
    axisWorld,
    pointWorld,
  }
}

function sameRapierBody(memberA,memberB){
  return memberA?.body&&memberA.body===memberB?.body
}

export function preflightRapierMechanicsPlan(plan,{
  resolveMember,
  studMeters=DEFAULT_STUD_METERS,
}={}){
  if(!plan)throw new TypeError('Physics plan is required')
  if(typeof resolveMember!=='function')throw new TypeError('resolveMember(bodyId) is required')
  const failures=[]

  if(!(Number.isFinite(studMeters)&&studMeters>0)){
    failures.push(Object.freeze({code:'invalid-unit-scale',studMeters}))
  }
  for(const blocker of plan.blockers||[])failures.push(blocker)

  const seenPairs=new Set()
  for(const item of plan.joints||[]){
    let memberA,memberB
    try{
      ;({memberA,memberB}=resolveMembers(item,resolveMember))
      memberComponent(memberA,'memberA')
      memberComponent(memberB,'memberB')
    }catch(error){
      failures.push(Object.freeze({
        code:'member-preflight',
        jointId:item.id,
        detail:String(error?.message||error),
      }))
      continue
    }

    if(sameRapierBody(memberA,memberB)){
      failures.push(Object.freeze({
        code:'joint-collapsed-inside-rapier-body',
        jointId:item.id,
        bodyA:item.bodyA,
        bodyB:item.bodyB,
      }))
    }

    const key=[memberA.body?.handle??memberA.body,item.kind,memberB.body?.handle??memberB.body]
      .map(String).sort().join('|')
    if(seenPairs.has(key)){
      failures.push(Object.freeze({
        code:'duplicate-rapier-joint-pair',
        jointId:item.id,
        key,
      }))
    }
    seenPairs.add(key)

    try{
      const axisWorld=finiteVector(item.frame?.axisWorld,'joint axis').normalize()
      finiteVector(item.frame?.positionStud,'joint anchor')
      const axisA=localDirection(memberA,axisWorld)
      const axisB=localDirection(memberB,axisWorld)
      if(['prismatic','cylindrical'].includes(item.kind)&&!axesCompatible(axisA,axisB)){
        failures.push(Object.freeze({
          code:'rapier-generic-local-axis-mismatch',
          jointId:item.id,
          jointKind:item.kind,
          localAxisA:Object.freeze(axisA.toArray()),
          localAxisB:Object.freeze(axisB.toArray()),
        }))
      }
    }catch(error){
      failures.push(Object.freeze({
        code:'joint-frame-preflight',
        jointId:item.id,
        detail:String(error?.message||error),
      }))
    }
  }

  return Object.freeze({
    pass:failures.length===0,
    version:MECHANICS_RAPIER_ADAPTER_VERSION,
    failures:Object.freeze(failures),
    stats:Object.freeze({
      plannedJoints:plan.joints?.length||0,
      failures:failures.length,
    }),
  })
}

export function materializeRapierMechanicsPlan(session,plan,{
  resolveMember,
  studMeters=DEFAULT_STUD_METERS,
  contactsEnabled=false,
}={}){
  if(!session?.world||!session?.RAPIER){
    throw new TypeError('Rapier session with world and RAPIER is required')
  }
  const preflight=preflightRapierMechanicsPlan(plan,{resolveMember,studMeters})
  if(!preflight.pass){
    const error=new Error(`Mechanics Next Rapier preflight failed: ${preflight.failures.length} blocker(s)`)
    error.failures=preflight.failures
    throw error
  }

  const created=[]
  try{
    for(const item of plan.joints){
      const{memberA,memberB}=resolveMembers(item,resolveMember)
      const frames=createJointData(session.RAPIER,item,memberA,memberB,{studMeters})
      const handle=session.world.createImpulseJoint(
        frames.data,
        memberA.body,
        memberB.body,
        true,
      )
      if(!handle)throw new Error(`Rapier failed to create joint ${item.id}`)
      try{
        configureContacts(handle,contactsEnabled)
        configureLimits(handle,{...item,studMeters})
      }catch(error){
        session.world.removeImpulseJoint?.(handle,true)
        throw error
      }
      created.push({
        item,
        handle,
        memberA,
        memberB,
        localAxisA:frames.axisA.clone(),
        localAxisB:frames.axisB.clone(),
        released:false,
        invalidFrames:0,
        releaseReason:null,
        lastResistanceImpulse:0,
      })
    }
  }catch(error){
    for(const monitor of created){
      try{
        if(monitor.handle?.isValid?.()!==false){
          session.world.removeImpulseJoint?.(monitor.handle,true)
        }
      }catch{}
    }
    throw error
  }

  return Object.freeze({
    version:MECHANICS_RAPIER_ADAPTER_VERSION,
    studMeters,
    monitors:Object.freeze(created),
    active:created.length,
    transmissions:plan.transmissions?.length||0,
    dynamics:plan.dynamics?.length||0,
  })
}

export function disposeRapierMechanicsPlan(session,state){
  let removed=0
  for(const monitor of state?.monitors||[]){
    if(monitor.released)continue
    try{
      if(monitor.handle?.isValid?.()!==false){
        session?.world?.removeImpulseJoint?.(monitor.handle,true)
      }
      monitor.released=true
      removed+=1
    }catch{}
  }
  return removed
}
