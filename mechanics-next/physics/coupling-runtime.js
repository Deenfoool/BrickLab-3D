import * as THREE from 'three'

export const MECHANICS_COUPLING_RUNTIME_VERSION='mechanics-coupling-runtime-0.1.0'
const EPS=1e-10

const vec=v=>({x:v.x,y:v.y,z:v.z})

function bodyRotation(body){
  const q=body.rotation()
  return new THREE.Quaternion(q.x,q.y,q.z,q.w)
}

function bodyAngular(body){
  const value=body.angvel()
  return new THREE.Vector3(value.x,value.y,value.z)
}

function bodyLinear(body){
  const value=body.linvel()
  return new THREE.Vector3(value.x,value.y,value.z)
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

export function inverseAngularMass(body,worldJacobian){
  if(!body||!dynamic(body)||worldJacobian.lengthSq()<=EPS)return 0
  const inv=body.invPrincipalInertia?.()
  if(!inv)return 0

  let frame=bodyRotation(body)
  const principal=body.principalInertiaLocalFrame?.()
  if(principal){
    frame=frame.multiply(new THREE.Quaternion(
      principal.x,principal.y,principal.z,principal.w,
    ))
  }
  const local=worldJacobian.clone().applyQuaternion(frame.invert())
  const ix=Number(inv.x)||0,iy=Number(inv.y)||0,iz=Number(inv.z)||0
  return local.x*local.x*ix+local.y*local.y*iy+local.z*local.z*iz
}

function localAxis(member,axisWorld){
  return new THREE.Vector3(...axisWorld).normalize()
    .applyQuaternion(member.component.bodyWorldRotation.clone().invert())
    .normalize()
}

function worldAxis(body,axisLocal){
  return axisLocal.clone().applyQuaternion(bodyRotation(body)).normalize()
}

function bodyIdKey(body){
  if(body?.handle!=null)return`handle:${body.handle}`
  return body
}

function addVector(map,key,body,field,value){
  let entry=map.get(key)
  if(!entry){
    entry={
      body,
      angular:new THREE.Vector3(),
      linear:new THREE.Vector3(),
    }
    map.set(key,entry)
  }
  entry[field].add(value)
}

function prepareTerm(term,resolveMember){
  const member=resolveMember(term.bodyId)
  if(!member)throw new Error(`Coupling member missing: ${term.bodyId}`)
  const reference=term.referenceBodyId?resolveMember(term.referenceBodyId):null
  if(term.referenceBodyId&&!reference){
    throw new Error(`Coupling reference member missing: ${term.referenceBodyId}`)
  }
  return Object.freeze({
    ...term,
    member,
    reference,
    axisLocal:localAxis(member,term.axisWorld),
    referenceAxisLocal:reference?localAxis(reference,term.axisWorld):null,
  })
}

function prepareCoupler(coupler,resolveMember){
  return{
    ...coupler,
    terms:coupler.terms.map(term=>prepareTerm(term,resolveMember)),
    phaseDeltaRad:0,
    lastResidual:0,
    lastImpulse:0,
    lastEffectiveInverseMass:0,
    lastRatio:coupler.nonlinearRelation?.velocityRatio?.(0)??null,
    lastControlMode:coupler.controlledTransmission?.defaultMode??null,
    controlDisconnected:false,
  }
}

function coefficientFor(runtimeTerm,coupler){
  if(coupler.controlledTransmission){
    const control=coupler.controlledTransmission
    const ratio=Number(coupler.lastRatio)
    if(runtimeTerm.coordinate!=='angular')return Number(runtimeTerm.coefficient)
    if(runtimeTerm.bodyId===control.bodyA)return-ratio
    if(runtimeTerm.bodyId===control.bodyB)return 1
  }
  if(!coupler.nonlinearRelation)return Number(runtimeTerm.coefficient)
  const relation=coupler.nonlinearRelation
  if(runtimeTerm.coordinate!=='angular')return Number(runtimeTerm.coefficient)
  if(runtimeTerm.bodyId===relation.inputBody){
    const ratio=Number(relation.velocityRatio(coupler.phaseDeltaRad))
    coupler.lastRatio=ratio
    return-ratio
  }
  if(runtimeTerm.bodyId===relation.outputBody)return 1
  return Number(runtimeTerm.coefficient)
}

function generalizedJacobian(coupler){
  const bodies=new Map()

  for(const term of coupler.terms){
    const coefficient=coefficientFor(term,coupler)
    const axis=worldAxis(term.member.body,term.axisLocal)
    const primaryKey=bodyIdKey(term.member.body)

    if(term.coordinate==='angular'){
      addVector(
        bodies,
        primaryKey,
        term.member.body,
        'angular',
        axis.clone().multiplyScalar(coefficient),
      )
      if(term.reference){
        const refAxis=worldAxis(term.reference.body,term.referenceAxisLocal)
        addVector(
          bodies,
          bodyIdKey(term.reference.body),
          term.reference.body,
          'angular',
          refAxis.multiplyScalar(-coefficient),
        )
      }
    }else{
      addVector(
        bodies,
        primaryKey,
        term.member.body,
        'linear',
        axis.clone().multiplyScalar(coefficient),
      )
      if(term.reference){
        const refAxis=worldAxis(term.reference.body,term.referenceAxisLocal)
        addVector(
          bodies,
          bodyIdKey(term.reference.body),
          term.reference.body,
          'linear',
          refAxis.multiplyScalar(-coefficient),
        )
      }
    }
  }
  return bodies
}

function residualAndEffectiveMass(bodies){
  let residual=0
  let inverseEffective=0
  for(const entry of bodies.values()){
    if(entry.angular.lengthSq()>EPS){
      residual+=bodyAngular(entry.body).dot(entry.angular)
      inverseEffective+=inverseAngularMass(entry.body,entry.angular)
    }
    if(entry.linear.lengthSq()>EPS){
      residual+=bodyLinear(entry.body).dot(entry.linear)
      inverseEffective+=inverseMass(entry.body)*entry.linear.lengthSq()
    }
  }
  return{residual,inverseEffective}
}

function applyAngularImpulse(body,impulse,dt){
  if(!dynamic(body)||impulse.lengthSq()===0)return
  if(typeof body.applyTorqueImpulse==='function'){
    body.applyTorqueImpulse(vec(impulse),true)
    return
  }
  if(typeof body.addTorque==='function'&&dt>0){
    body.addTorque(vec(impulse.clone().multiplyScalar(1/dt)),true)
    return
  }
  throw new Error('Rapier angular impulse API unavailable')
}

function applyLinearImpulse(body,impulse,dt){
  if(!dynamic(body)||impulse.lengthSq()===0)return
  if(typeof body.applyImpulse==='function'){
    body.applyImpulse(vec(impulse),true)
    return
  }
  if(typeof body.addForce==='function'&&dt>0){
    body.addForce(vec(impulse.clone().multiplyScalar(1/dt)),true)
    return
  }
  throw new Error('Rapier linear impulse API unavailable')
}

function primaryInputVelocity(coupler){
  const relation=coupler.nonlinearRelation
  if(!relation)return 0
  const term=coupler.terms.find(item=>
    item.coordinate==='angular'&&item.bodyId===relation.inputBody)
  if(!term)return 0
  const axis=worldAxis(term.member.body,term.axisLocal)
  let value=bodyAngular(term.member.body).dot(axis)
  if(term.reference){
    const refAxis=worldAxis(term.reference.body,term.referenceAxisLocal)
    value-=bodyAngular(term.reference.body).dot(refAxis)
  }
  return value
}

export function createMechanicsCouplingRuntime(couplingPlan,{
  resolveMember,
  stabilization=1,
  controlState=null,
}={}){
  if(!couplingPlan?.pass){
    throw new Error('Cannot create coupling runtime from blocked plan')
  }
  if(typeof resolveMember!=='function')throw new TypeError('resolveMember(bodyId) is required')
  const gain=Math.max(0,Math.min(1,Number(stabilization)))
  const couplers=couplingPlan.couplers.map(item=>prepareCoupler(item,resolveMember))

  const updateControlledTransmission=coupler=>{
    const control=coupler.controlledTransmission
    if(!control)return true
    const state=typeof controlState==='function'?controlState(control.controlId):null
    const mode=String(state?.mode||control.defaultMode||'forward')
    const ratio=Number(control.modeRatios?.[mode]??control.modeRatios?.forward??0)
    coupler.lastControlMode=mode
    coupler.lastRatio=Number.isFinite(ratio)?ratio:0
    coupler.controlDisconnected=!Number.isFinite(ratio)||Math.abs(ratio)<=EPS
    return !coupler.controlDisconnected
  }

  return Object.freeze({
    version:MECHANICS_COUPLING_RUNTIME_VERSION,
    couplers:Object.freeze(couplers),
    step(dt,{advancePhase=true}={}){
      if(!(Number.isFinite(dt)&&dt>0))return Object.freeze({applied:0,skipped:couplers.length})
      let applied=0,skipped=0
      for(const coupler of couplers){
        if(!updateControlledTransmission(coupler)){
          coupler.lastResidual=0
          coupler.lastImpulse=0
          coupler.lastEffectiveInverseMass=0
          skipped+=1
          continue
        }
        if(coupler.nonlinearRelation&&advancePhase){
          coupler.phaseDeltaRad+=primaryInputVelocity(coupler)*dt
        }

        const bodies=generalizedJacobian(coupler)
        const state=residualAndEffectiveMass(bodies)
        coupler.lastResidual=state.residual
        coupler.lastEffectiveInverseMass=state.inverseEffective

        if(!(state.inverseEffective>EPS)||Math.abs(state.residual)<=1e-10){
          coupler.lastImpulse=0
          skipped+=1
          continue
        }

        const lambda=-state.residual/state.inverseEffective*gain
        coupler.lastImpulse=lambda
        for(const entry of bodies.values()){
          if(entry.angular.lengthSq()>EPS){
            applyAngularImpulse(entry.body,entry.angular.clone().multiplyScalar(lambda),dt)
          }
          if(entry.linear.lengthSq()>EPS){
            applyLinearImpulse(entry.body,entry.linear.clone().multiplyScalar(lambda),dt)
          }
        }
        applied+=1
      }
      return Object.freeze({applied,skipped})
    },
    snapshot(){
      return Object.freeze(couplers.map(coupler=>Object.freeze({
        id:coupler.id,
        kind:coupler.kind,
        equationId:coupler.equationId,
        lastResidual:coupler.lastResidual,
        lastImpulse:coupler.lastImpulse,
        effectiveInverseMass:coupler.lastEffectiveInverseMass,
        phaseDeltaRad:coupler.phaseDeltaRad,
        instantaneousRatio:coupler.lastRatio,
        controlMode:coupler.lastControlMode,
        disconnected:coupler.controlDisconnected,
      })))
    },
  })
}
