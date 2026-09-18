import * as THREE from 'three'

export const MECHANICS_SUSPENSION_RUNTIME_VERSION='mechanics-suspension-runtime-0.1.0'
const EPS=1e-9

function bodyRotation(body){
  const q=body?.rotation?.()
  return q
    ?new THREE.Quaternion(q.x,q.y,q.z,q.w).normalize()
    :new THREE.Quaternion()
}

function relativeQuaternion(memberA,memberB){
  return bodyRotation(memberA.body).invert().multiply(bodyRotation(memberB.body)).normalize()
}

function signedTwistAngle(delta,axis){
  const normalized=axis.clone().normalize()
  const projection=delta.x*normalized.x+delta.y*normalized.y+delta.z*normalized.z
  const w=Number(delta.w)
  let angle=2*Math.atan2(projection,w)
  while(angle>Math.PI)angle-=Math.PI*2
  while(angle<-Math.PI)angle+=Math.PI*2
  return Number.isFinite(angle)?angle:0
}

function physicalAngle(entry){
  const current=relativeQuaternion(entry.monitor.memberA,entry.monitor.memberB)
  const delta=entry.initialRelative.clone().invert().multiply(current).normalize()
  const jointAngle=signedTwistAngle(delta,entry.monitor.localAxisA)
  return jointAngle*entry.coordinateSign
}

function worldX(entry){
  const body=entry.armMember?.body
  const p=body?.translation?.()
  return Number.isFinite(Number(p?.x))?Number(p.x):0
}

function finiteOr(value,fallback){
  const n=Number(value)
  return Number.isFinite(n)?n:fallback
}

export function createMechanicsSuspensionRuntime(jointState,{session}={}){
  const entries=[]
  const failures=[]

  for(const monitor of jointState?.monitors||[]){
    const motor=monitor?.item?.dynamics?.suspensionMotor
    if(!motor)continue
    if(monitor.item.kind!=='revolute'){
      failures.push(Object.freeze({
        code:'suspension-joint-not-revolute',
        jointId:monitor.item.id,
        jointKind:monitor.item.kind,
      }))
      continue
    }
    if(!monitor.handle||typeof monitor.handle.configureMotorPosition!=='function'){
      failures.push(Object.freeze({
        code:'suspension-motor-api-unavailable',
        jointId:monitor.item.id,
      }))
      continue
    }
    const armBodyId=String(motor.armBodyId||'')
    const armIsA=String(monitor.item.bodyA)===armBodyId
    const armIsB=String(monitor.item.bodyB)===armBodyId
    if(!armIsA&&!armIsB){
      failures.push(Object.freeze({
        code:'suspension-arm-body-not-in-joint',
        jointId:monitor.item.id,
        armBodyId,
      }))
      continue
    }

    const coordinateSign=Number(motor.coordinateSign)<0?-1:1
    const physicalMin=finiteOr(motor.physicalMinAngle,-Math.PI*55/180)
    const physicalMax=finiteOr(motor.physicalMaxAngle,Math.PI*55/180)
    const entry={
      id:`suspension:${monitor.item.id}`,
      jointId:monitor.item.id,
      armBodyId,
      armInstanceId:String(motor.armInstanceId||''),
      monitor,
      armMember:armIsA?monitor.memberA:monitor.memberB,
      coordinateSign,
      initialRelative:relativeQuaternion(monitor.memberA,monitor.memberB),
      restAngle:finiteOr(motor.restAngle,0),
      preload:finiteOr(motor.preload,0),
      stiffness:Math.max(0,finiteOr(motor.stiffness,.12)),
      damping:Math.max(0,finiteOr(motor.damping,.01)),
      springRate:Number.isFinite(Number(motor.springRate))?Math.max(0,Number(motor.springRate)):null,
      compressionDamping:Number.isFinite(Number(motor.compressionDamping))
        ?Math.max(0,Number(motor.compressionDamping)):null,
      reboundDamping:Number.isFinite(Number(motor.reboundDamping))
        ?Math.max(0,Number(motor.reboundDamping)):null,
      bumpStop:Math.min(.999,Math.max(0,finiteOr(motor.bumpStop,.88))),
      physicalMinAngle:Math.min(physicalMin,physicalMax),
      physicalMaxAngle:Math.max(physicalMin,physicalMax),
      physicalAngle:0,
      previousPhysicalAngle:0,
      angularVelocity:0,
      compression:false,
      effectiveStiffness:0,
      effectiveDamping:0,
      antiRoll:0,
      targetJointAngle:0,
    }

    monitor.handle.configureMotorModel?.(session?.RAPIER?.MotorModel?.ForceBased??1)
    entries.push(entry)
  }

  function step(dt){
    if(!(Number.isFinite(dt)&&dt>0)){
      return Object.freeze({applied:0,entries:entries.length})
    }

    for(const entry of entries){
      const angle=physicalAngle(entry)
      const previous=entry.physicalAngle
      entry.previousPhysicalAngle=previous
      entry.physicalAngle=angle
      entry.angularVelocity=(angle-previous)/Math.max(dt,EPS)
      entry.compression=Math.abs(angle)>Math.abs(previous)

      const baseK=entry.springRate??entry.stiffness
      const damping=entry.compression
        ?entry.compressionDamping??entry.damping
        :entry.reboundDamping??entry.damping
      const limitMagnitude=Math.max(
        Math.abs(entry.physicalMinAngle),
        Math.abs(entry.physicalMaxAngle),
        .001,
      )
      const ratio=Math.abs(angle)/limitMagnitude
      entry.effectiveStiffness=ratio>entry.bumpStop
        ?baseK*(1+Math.pow((ratio-entry.bumpStop)/Math.max(1-entry.bumpStop,.01),2)*5)
        :baseK
      entry.effectiveDamping=damping
      entry.antiRoll=0
    }

    const ordered=[...entries].sort((a,b)=>worldX(a)-worldX(b))
    for(let index=0;index+1<ordered.length;index+=2){
      const a=ordered[index]
      const b=ordered[index+1]
      const diff=b.physicalAngle-a.physicalAngle
      const offset=Math.max(-.12,Math.min(.12,diff*.18))
      a.antiRoll=-offset
      b.antiRoll=offset
    }

    let applied=0
    for(const entry of entries){
      if(entry.monitor.released)continue
      const jointTarget=
        entry.restAngle+
        entry.preload+
        entry.antiRoll*entry.coordinateSign
      entry.targetJointAngle=jointTarget
      entry.monitor.handle.configureMotorPosition(
        jointTarget,
        entry.effectiveStiffness,
        entry.effectiveDamping,
      )
      applied+=1
    }

    return Object.freeze({applied,entries:entries.length})
  }

  function snapshot(){
    return Object.freeze(entries.map(entry=>Object.freeze({
      id:entry.id,
      jointId:entry.jointId,
      armBodyId:entry.armBodyId,
      armInstanceId:entry.armInstanceId,
      angleRad:entry.physicalAngle,
      angularVelocity:entry.angularVelocity,
      compression:entry.compression,
      effectiveStiffness:entry.effectiveStiffness,
      effectiveDamping:entry.effectiveDamping,
      antiRoll:entry.antiRoll,
      targetJointAngle:entry.targetJointAngle,
      minAngle:entry.physicalMinAngle,
      maxAngle:entry.physicalMaxAngle,
      released:Boolean(entry.monitor.released),
    })))
  }

  return Object.freeze({
    version:MECHANICS_SUSPENSION_RUNTIME_VERSION,
    pass:failures.length===0,
    failures:Object.freeze(failures),
    entries:Object.freeze(entries),
    step,
    snapshot,
  })
}
