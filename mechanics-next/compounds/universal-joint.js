import { clamp } from '../math/rigid.js'
import { mechanicalVariable } from '../core/model.js'

export const UNIVERSAL_JOINT_VERSION='mechanics-universal-joint-0.1.0'
const TWO_PI=Math.PI*2
const EPS=1e-9

function wrapPi(angle){
  let value=Number(angle)||0
  while(value>Math.PI)value-=TWO_PI
  while(value<=-Math.PI)value+=TWO_PI
  return value
}

function unwrapNear(angle,reference){
  const wrapped=wrapPi(angle)
  const turns=Math.round((Number(reference)-wrapped)/TWO_PI)
  return wrapped+turns*TWO_PI
}

function safeBend(value){
  const bend=Math.abs(Number(value)||0)
  return clamp(bend,0,Math.PI/2-1e-7)
}

export function universalJointAbsoluteOutputAngle(inputAngle,bendAngleRad){
  const beta=safeBend(bendAngleRad)
  const input=Number(inputAngle)||0
  const principal=Math.atan2(
    Math.cos(beta)*Math.sin(input),
    Math.cos(input),
  )
  return unwrapNear(principal,input)
}

export function universalJointAbsoluteInputAngle(outputAngle,bendAngleRad){
  const beta=safeBend(bendAngleRad)
  const output=Number(outputAngle)||0
  const principal=Math.atan2(
    Math.sin(output),
    Math.cos(beta)*Math.cos(output),
  )
  return unwrapNear(principal,output)
}

export function universalJointOutputDelta(inputDelta,{
  bendAngleRad=0,
  inputPhaseRad=0,
  directionSign=1,
}={}){
  const sign=Number(directionSign)<0?-1:1
  const phase=Number(inputPhaseRad)||0
  const base=universalJointAbsoluteOutputAngle(phase,bendAngleRad)
  const next=universalJointAbsoluteOutputAngle(phase+Number(inputDelta||0),bendAngleRad)
  return sign*(next-base)
}

export function universalJointInputDelta(outputDelta,{
  bendAngleRad=0,
  inputPhaseRad=0,
  directionSign=1,
}={}){
  const sign=Number(directionSign)<0?-1:1
  const phase=Number(inputPhaseRad)||0
  const baseOut=universalJointAbsoluteOutputAngle(phase,bendAngleRad)
  const targetOut=baseOut+sign*Number(outputDelta||0)
  const input=universalJointAbsoluteInputAngle(targetOut,bendAngleRad)
  return input-phase
}

export function universalJointVelocityRatio(inputAbsoluteAngle,{
  bendAngleRad=0,
  directionSign=1,
}={}){
  const sign=Number(directionSign)<0?-1:1
  const beta=safeBend(bendAngleRad)
  const theta=Number(inputAbsoluteAngle)||0
  const cosBeta=Math.cos(beta)
  const denominator=1-Math.sin(beta)**2*Math.sin(theta)**2
  if(Math.abs(denominator)<EPS)return sign*Math.sign(cosBeta||1)*Infinity
  return sign*cosBeta/denominator
}

export function createUniversalJointRelation({
  id,
  inputBody,
  outputBody,
  bendAngleRad=0,
  inputPhaseRad=0,
  directionSign=1,
  metadata=null,
}={}){
  if(!id||!inputBody||!outputBody)throw new TypeError('Universal joint relation requires id/inputBody/outputBody')
  const sign=Number(directionSign)<0?-1:1
  const bend=safeBend(bendAngleRad)
  const phase=Number(inputPhaseRad)||0
  const inputVariable=mechanicalVariable(inputBody,'theta')
  const outputVariable=mechanicalVariable(outputBody,'theta')

  return Object.freeze({
    id:String(id),
    kind:'universal-joint',
    nonlinear:true,
    bidirectional:true,
    inputBody:String(inputBody),
    outputBody:String(outputBody),
    inputVariable,
    outputVariable,
    bendAngleRad:bend,
    inputPhaseRad:phase,
    directionSign:sign,
    metadata,
    forward(value){
      return universalJointOutputDelta(value,{
        bendAngleRad:bend,
        inputPhaseRad:phase,
        directionSign:sign,
      })
    },
    inverse(value){
      return universalJointInputDelta(value,{
        bendAngleRad:bend,
        inputPhaseRad:phase,
        directionSign:sign,
      })
    },
    velocityRatio(inputDelta=0){
      return universalJointVelocityRatio(phase+Number(inputDelta||0),{
        bendAngleRad:bend,
        directionSign:sign,
      })
    },
  })
}
