import * as THREE from 'three'
import { worldConnectorFrame } from '../connectors/world-frame.js'

export const MECHANICS_MOTOR_RUNTIME_VERSION='mechanics-motor-runtime-0.1.0'
const TWO_PI=Math.PI*2
const EPS=1e-9
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value))
const vec=value=>({x:value.x,y:value.y,z:value.z})

function recordMap(records=[]){
  return new Map(records.map(record=>[String(record?.instance?.body?.id||''),record]).filter(([id])=>id))
}

function motorFrame(record,endpointId){
  const endpoint=record?.instance?.endpoints?.find(item=>item.id===endpointId)
  if(!endpoint)return null
  try{
    return worldConnectorFrame(record.pose,endpoint,{
      visualOffsetStud:record.visualOffsetStud||[0,0,0],
    })
  }catch{return null}
}

export function buildMechanicsMotorPlan({graph,records=[]}={}){
  const byBody=recordMap(records)
  const drives=[]
  const blockers=[]
  for(const edge of graph?.edges?.('constraint')||[]){
    const drive=edge?.metadata?.motorDrive
    if(!drive)continue
    const motorRecord=byBody.get(String(drive.motorBodyId))
    const drivenRecord=byBody.get(String(drive.drivenBodyId))
    const params=motorRecord?.instance?.descriptor?.classification?.properties?.motor
    const frame=motorFrame(motorRecord,drive.motorEndpointId)
    if(!motorRecord||!drivenRecord){
      blockers.push(Object.freeze({
        code:'motor-record-missing',
        constraintId:edge.id,
        motorBodyId:drive.motorBodyId,
        drivenBodyId:drive.drivenBodyId,
      }))
      continue
    }
    if(!params||!Number.isFinite(Number(params.rpm))||!Number.isFinite(Number(params.stallTorque))){
      blockers.push(Object.freeze({
        code:'motor-parameters-missing',
        constraintId:edge.id,
        motorBodyId:drive.motorBodyId,
      }))
      continue
    }
    if(!frame?.axis){
      blockers.push(Object.freeze({
        code:'motor-axis-missing',
        constraintId:edge.id,
        motorBodyId:drive.motorBodyId,
      }))
      continue
    }
    drives.push(Object.freeze({
      id:`motor-drive:${edge.id}`,
      constraintId:edge.id,
      motorBodyId:String(drive.motorBodyId),
      drivenBodyId:String(drive.drivenBodyId),
      axisWorld:Object.freeze([...frame.axis]),
      controlId:String(drive.motorInstanceId??motorRecord.instance.body.instanceId),
      defaultRpm:Math.abs(Number(params.rpm)),
      defaultDirection:Number(params.direction)<0?-1:1,
      targetRpm:Number(params.rpm)*(Number(params.direction)<0?-1:1),
      stallTorque:Math.max(0,Number(params.stallTorque)),
      damping:Number.isFinite(Number(params.damping))?Math.max(0,Number(params.damping)):1,
      freeCurrent:Number.isFinite(Number(params.freeCurrent))?Number(params.freeCurrent):null,
      stallCurrent:Number.isFinite(Number(params.stallCurrent))?Number(params.stallCurrent):null,
      voltage:Number.isFinite(Number(params.voltage))?Math.max(0,Number(params.voltage)):9,
      nominalEfficiency:Number.isFinite(Number(params.nominalEfficiency))
        ?Math.min(1,Math.max(0,Number(params.nominalEfficiency))):null,
    }))
  }
  return Object.freeze({
    version:MECHANICS_MOTOR_RUNTIME_VERSION,
    pass:blockers.length===0,
    drives:Object.freeze(drives),
    blockers:Object.freeze(blockers),
    stats:Object.freeze({drives:drives.length,blockers:blockers.length}),
  })
}

function bodyRotation(body){
  const q=body.rotation()
  return new THREE.Quaternion(q.x,q.y,q.z,q.w)
}
function angular(body){
  const v=body.angvel()
  return new THREE.Vector3(v.x,v.y,v.z)
}
function localAxis(member,axisWorld){
  return new THREE.Vector3(...axisWorld).normalize()
    .applyQuaternion(member.component.bodyWorldRotation.clone().invert())
    .normalize()
}
function dynamic(body){
  if(typeof body?.isDynamic==='function')return body.isDynamic()
  return body?.isDynamic!==false
}

export function createMechanicsMotorRuntime(plan,{
  resolveMember,
  controlState=null,
  isDriveEnabled=()=>true,
}={}){
  if(!plan?.pass)throw new Error('Cannot create motor runtime from blocked plan')
  if(typeof resolveMember!=='function')throw new TypeError('resolveMember(bodyId) is required')

  const drives=plan.drives.map(item=>{
    const motor=resolveMember(item.motorBodyId)
    const driven=resolveMember(item.drivenBodyId)
    if(!motor||!driven)throw new Error(`Motor physics member missing: ${item.id}`)
    return{
      ...item,
      motor,
      driven,
      localAxisMotor:localAxis(motor,item.axisWorld),
      actualRpm:0,
      load:0,
      torque:0,
      current:item.freeCurrent,
      stalled:false,
      stallTime:0,
      powerW:0,
      inputPowerW:0,
      efficiency:0,
      externalBrakeTorqueNm:0,
      externalBrakePowerW:0,
    }
  })

  return Object.freeze({
    version:MECHANICS_MOTOR_RUNTIME_VERSION,
    drives:Object.freeze(drives),
    step(dt){
      if(!(Number.isFinite(dt)&&dt>0))return Object.freeze({applied:0})
      let applied=0
      for(const drive of drives){
        const axis=drive.localAxisMotor.clone().applyQuaternion(bodyRotation(drive.motor.body)).normalize()
        const relative=angular(drive.driven.body).sub(angular(drive.motor.body)).dot(axis)
        const actualRpm=relative*60/TWO_PI
        const state=typeof controlState==='function'?controlState(drive.controlId):null
        const liveRpm=state?.type==='motor'&&Number.isFinite(Number(state.rpm))
          ?Math.max(0,Number(state.rpm))
          :drive.defaultRpm
        const liveDirection=state?.type==='motor'
          ?(Number(state.direction)>0?1:Number(state.direction)<0?-1:0)
          :drive.defaultDirection
        const enabled=Boolean(isDriveEnabled(drive,state))
        const targetRpm=enabled?liveRpm*liveDirection:0
        drive.targetRpm=targetRpm
        drive.controlDirection=liveDirection
        drive.controlRunning=enabled&&liveDirection!==0
        const targetOmega=targetRpm*TWO_PI/60
        const error=targetOmega-relative
        const denominator=Math.max(Math.abs(targetOmega),1)
        const normalized=clamp(Math.abs(error)/denominator,0,1)
        const torqueMagnitude=drive.stallTorque*normalized
        const sign=Math.sign(error||targetOmega||1)
        const torque=axis.clone().multiplyScalar(torqueMagnitude*sign)

        if(dynamic(drive.driven.body))drive.driven.body.addTorque?.(vec(torque),true)
        if(dynamic(drive.motor.body))drive.motor.body.addTorque?.(vec(torque.clone().multiplyScalar(-1)),true)

        drive.actualRpm=actualRpm
        drive.torque=torqueMagnitude
        drive.load=drive.stallTorque>EPS?clamp(torqueMagnitude/drive.stallTorque,0,1):0
        if(drive.freeCurrent!=null&&drive.stallCurrent!=null){
          drive.current=drive.freeCurrent+(drive.stallCurrent-drive.freeCurrent)*drive.load
        }
        drive.powerW=Math.abs(torqueMagnitude*relative)
        drive.inputPowerW=drive.current==null?0:drive.voltage*drive.current
        drive.efficiency=drive.inputPowerW>EPS
          ?clamp(drive.powerW/drive.inputPowerW,0,1)
          :0
        drive.externalBrakeTorqueNm=0
        drive.externalBrakePowerW=0
        const lowSpeed=Math.abs(targetRpm)>10&&Math.abs(actualRpm)<Math.abs(targetRpm)*.12
        drive.stallTime=lowSpeed&&drive.load>.82?drive.stallTime+dt:0
        drive.stalled=drive.stallTime>.65
        applied+=1
      }
      return Object.freeze({applied})
    },
    applyExternalBrake({
      controlId=null,
      maxTorqueNm=0,
      gain=0,
    }={}){
      const target=controlId==null
        ?drives[0]
        :drives.find(drive=>String(drive.controlId)===String(controlId))
      if(!target)return Object.freeze({applied:false,reason:'motor-drive-missing'})
      const axis=target.localAxisMotor.clone()
        .applyQuaternion(bodyRotation(target.motor.body)).normalize()
      const relative=angular(target.driven.body).sub(angular(target.motor.body)).dot(axis)
      const capacity=Math.max(0,Number(maxTorqueNm)||0)
      const brakeGain=Math.max(0,Number(gain)||0)
      const torque=Math.min(capacity,Math.abs(relative)*brakeGain)
      if(!(torque>EPS)||Math.abs(relative)<=EPS){
        target.externalBrakeTorqueNm=0
        target.externalBrakePowerW=0
        return Object.freeze({
          applied:false,
          controlId:target.controlId,
          actualRpm:target.actualRpm,
          torqueNm:0,
          powerW:0,
        })
      }
      const signed=-Math.sign(relative)*torque
      if(dynamic(target.driven.body)){
        target.driven.body.addTorque?.(vec(axis.clone().multiplyScalar(signed)),true)
      }
      target.externalBrakeTorqueNm=torque
      target.externalBrakePowerW=Math.abs(torque*relative)
      return Object.freeze({
        applied:true,
        controlId:target.controlId,
        actualRpm:target.actualRpm,
        torqueNm:torque,
        powerW:target.externalBrakePowerW,
      })
    },
    snapshot(){
      return Object.freeze(drives.map(drive=>Object.freeze({
        id:drive.id,
        controlId:drive.controlId,
        targetRpm:drive.targetRpm,
        controlDirection:drive.controlDirection??drive.defaultDirection,
        running:drive.controlRunning??true,
        actualRpm:drive.actualRpm,
        load:drive.load,
        torque:drive.torque,
        current:drive.current,
        powerW:drive.powerW,
        inputPowerW:drive.inputPowerW,
        efficiency:drive.efficiency,
        externalBrakeTorqueNm:drive.externalBrakeTorqueNm,
        externalBrakePowerW:drive.externalBrakePowerW,
        stalled:drive.stalled,
      })))
    },
  })
}
