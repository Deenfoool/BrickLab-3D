import * as THREE from 'three'

export const JOINT_DYNAMICS_VERSION='mechanics-joint-dynamics-0.1.0'
const EPS=1e-10

const vec=v=>({x:v.x,y:v.y,z:v.z})

const NORMALIZED_RATES=Object.freeze({
  rotational:Object.freeze({
    low:.25,
    'part-fit':1.0,
    'part-variant':1.1,
    clutch:2.1,
    high:3.2,
    'clip-friction':1.5,
    'socket-friction':.9,
    detent:0,
  }),
  axial:Object.freeze({
    low:.18,
    'part-fit':.8,
    'actuator-guide':.55,
    'seal-friction':1.5,
    'clip-friction':1.2,
    'detent-or-fit':.9,
  }),
})

function bodyRotation(body){
  const q=body.rotation()
  return new THREE.Quaternion(q.x,q.y,q.z,q.w)
}

function axisWorld(monitor){
  const a=monitor.localAxisA.clone().applyQuaternion(bodyRotation(monitor.memberA.body)).normalize()
  const b=monitor.localAxisB.clone().applyQuaternion(bodyRotation(monitor.memberB.body)).normalize()
  if(a.dot(b)<0)b.multiplyScalar(-1)
  const axis=a.add(b)
  return axis.lengthSq()>EPS?axis.normalize():a
}

function dynamic(body){
  if(!body)return false
  if(typeof body.isDynamic==='function')return body.isDynamic()
  if(typeof body.isDynamic==='boolean')return body.isDynamic
  return true
}

function inverseMass(body){
  if(!body||!dynamic(body))return 0
  const direct=Number(body.invMass?.())
  if(Number.isFinite(direct)&&direct>=0)return direct
  const mass=Number(body.mass?.())
  return Number.isFinite(mass)&&mass>EPS?1/mass:0
}

function inverseAngularMass(body,axis){
  if(!body||!dynamic(body))return 0
  const inv=body.invPrincipalInertia?.()
  if(!inv)return 0
  let frame=bodyRotation(body)
  const principal=body.principalInertiaLocalFrame?.()
  if(principal){
    frame=frame.multiply(new THREE.Quaternion(principal.x,principal.y,principal.z,principal.w))
  }
  const local=axis.clone().applyQuaternion(frame.invert())
  return local.x*local.x*(Number(inv.x)||0)+
    local.y*local.y*(Number(inv.y)||0)+
    local.z*local.z*(Number(inv.z)||0)
}

function angularVelocity(body){
  const v=body.angvel()
  return new THREE.Vector3(v.x,v.y,v.z)
}

function linearVelocity(body){
  const v=body.linvel()
  return new THREE.Vector3(v.x,v.y,v.z)
}

function applyTorqueImpulse(body,impulse,dt){
  if(!dynamic(body)||impulse.lengthSq()<=EPS)return
  if(typeof body.applyTorqueImpulse==='function'){
    body.applyTorqueImpulse(vec(impulse),true)
    return
  }
  if(typeof body.addTorque==='function'&&dt>0){
    body.addTorque(vec(impulse.clone().multiplyScalar(1/dt)),true)
  }
}

function applyLinearImpulse(body,impulse,dt){
  if(!dynamic(body)||impulse.lengthSq()<=EPS)return
  if(typeof body.applyImpulse==='function'){
    body.applyImpulse(vec(impulse),true)
    return
  }
  if(typeof body.addForce==='function'&&dt>0){
    body.addForce(vec(impulse.clone().multiplyScalar(1/dt)),true)
  }
}

function rateFor(value,domain){
  if(value==null)return 0
  if(Number.isFinite(Number(value)))return Math.max(0,Number(value))
  return NORMALIZED_RATES[domain]?.[String(value)]??0
}

function cancellationFraction(rate,dt){
  return rate>0&&dt>0?1-Math.exp(-rate*dt):0
}

function resistRotation(monitor,dt){
  const label=monitor.item?.dynamics?.rotationalResistance
  const rate=rateFor(label,'rotational')
  if(!(rate>0))return 0

  const axis=axisWorld(monitor)
  const relative=angularVelocity(monitor.memberB.body)
    .sub(angularVelocity(monitor.memberA.body))
    .dot(axis)
  if(Math.abs(relative)<=EPS)return 0

  const inverse=inverseAngularMass(monitor.memberA.body,axis)+
    inverseAngularMass(monitor.memberB.body,axis)
  if(!(inverse>EPS))return 0
  const effective=1/inverse
  const impulseMagnitude=-relative*effective*cancellationFraction(rate,dt)
  const impulse=axis.clone().multiplyScalar(impulseMagnitude)
  applyTorqueImpulse(monitor.memberB.body,impulse,dt)
  applyTorqueImpulse(monitor.memberA.body,impulse.clone().multiplyScalar(-1),dt)
  return Math.abs(impulseMagnitude)
}

function resistAxial(monitor,dt){
  const label=monitor.item?.dynamics?.axialResistance
  const rate=rateFor(label,'axial')
  if(!(rate>0))return 0

  const axis=axisWorld(monitor)
  const relative=linearVelocity(monitor.memberB.body)
    .sub(linearVelocity(monitor.memberA.body))
    .dot(axis)
  if(Math.abs(relative)<=EPS)return 0

  const inverse=inverseMass(monitor.memberA.body)+inverseMass(monitor.memberB.body)
  if(!(inverse>EPS))return 0
  const effective=1/inverse
  const impulseMagnitude=-relative*effective*cancellationFraction(rate,dt)
  const impulse=axis.clone().multiplyScalar(impulseMagnitude)
  applyLinearImpulse(monitor.memberB.body,impulse,dt)
  applyLinearImpulse(monitor.memberA.body,impulse.clone().multiplyScalar(-1),dt)
  return Math.abs(impulseMagnitude)
}

export function applyMechanicsJointResistance(state,dt){
  if(!(Number.isFinite(dt)&&dt>0))return Object.freeze({applied:0,totalImpulse:0})
  let applied=0,totalImpulse=0
  for(const monitor of state?.monitors||[]){
    if(monitor.released)continue
    const rotational=resistRotation(monitor,dt)
    const axial=resistAxial(monitor,dt)
    monitor.lastResistanceImpulse=rotational+axial
    if(monitor.lastResistanceImpulse>0){
      applied+=1
      totalImpulse+=monitor.lastResistanceImpulse
    }
  }
  return Object.freeze({applied,totalImpulse})
}

export function validateAndReleaseMechanicsJoints(session,state,{
  validateJoint,
  confirmFrames=2,
}={}){
  if(typeof validateJoint!=='function')return Object.freeze({released:0,events:Object.freeze([])})
  const needed=Math.max(1,Math.floor(confirmFrames))
  const events=[]

  for(const monitor of state?.monitors||[]){
    if(monitor.released||monitor.item?.release?.mode!=='revalidate-profile')continue
    let validation
    try{
      validation=validateJoint(monitor.item)
    }catch(error){
      validation={valid:false,reason:`validation-error:${error?.message||error}`}
    }
    if(validation?.valid){
      monitor.invalidFrames=0
      continue
    }

    monitor.invalidFrames=(monitor.invalidFrames||0)+1
    if(monitor.invalidFrames<needed)continue

    try{
      if(monitor.handle?.isValid?.()!==false){
        session?.world?.removeImpulseJoint?.(monitor.handle,true)
      }
    }catch{}
    monitor.released=true
    monitor.releaseReason=validation?.reason||'profile-disengaged'
    events.push(Object.freeze({
      jointId:monitor.item.id,
      constraintIds:monitor.item.sourceConstraintIds,
      reason:monitor.releaseReason,
    }))
  }

  return Object.freeze({
    released:events.length,
    events:Object.freeze(events),
  })
}

export const NORMALIZED_JOINT_RESISTANCE=Object.freeze({
  model:'exponential-relative-velocity-damping',
  claim:'simulation-normalized-not-measured-lego-friction',
  rates:NORMALIZED_RATES,
})
