import {
  add3,
  dot3,
  len3,
  norm3,
  quatFromAxisAngle,
  quatFromUnitVectors,
  quatMultiply,
  quaternionAngle,
  rotate3,
  scale3,
  signedAngleAround,
  sub3,
} from '../math/rigid.js'
import { solveAxialFit } from './axial-fit.js'
import { matchMechanicalEndpoints } from './profile-matcher.js'

export const PLACEMENT_SOLVER_VERSION='mechanics-placement-solver-0.1.0'

function nearestKeyedCorrection(angle,symmetry){
  if(!Number.isFinite(symmetry)||symmetry<=1)return angle
  const step=Math.PI*2/symmetry
  return angle-Math.round(angle/step)*step
}

function orientationSolution(sourceFrame,targetFrame,match,objectPose,{
  axisPolarity=1,
  twistCorrectionRad=null,
  preserveOrientation=false,
}={}){
  const desiredAxis=scale3(targetFrame.axis,axisPolarity<0?-1:1)
  if(preserveOrientation||match?.freeOrientation){
    return{
      rotationDelta:[0,0,0,1],
      desiredQuaternion:[...objectPose.quaternion],
      desiredAxis,
      twistCorrectionRad:0,
    }
  }

  const align=quatFromUnitVectors(sourceFrame.axis,desiredAxis)
  let delta=align
  let desired=quatMultiply(align,objectPose.quaternion)
  let appliedTwist=0
  const alignedReference=rotate3(align,sourceFrame.reference)

  if(!match?.freeTwist){
    const raw=Number.isFinite(twistCorrectionRad)
      ?Number(twistCorrectionRad)
      :signedAngleAround(alignedReference,targetFrame.reference,desiredAxis)
    const correction=match?.keyed
      ?nearestKeyedCorrection(raw,match.rotationalSymmetry)
      :raw
    if(Math.abs(correction)>1e-10){
      const twist=quatFromAxisAngle(desiredAxis,correction)
      delta=quatMultiply(twist,delta)
      desired=quatMultiply(twist,desired)
      appliedTwist=correction
    }
  }

  return{
    rotationDelta:delta,
    desiredQuaternion:desired,
    desiredAxis,
    twistCorrectionRad:appliedTwist,
  }
}

function axialSolution(source,target,match,requestedOffsetLdu){
  if(!match?.requiresAxialFit)return{
    valid:true,
    offsetLdu:0,
    sourceOffsetLdu:0,
    engagementLdu:0,
    fit:null,
  }

  const male=match.male
  const female=match.female
  const result=solveAxialFit(male,female,{requestedOffsetLdu})
  if(!result.valid)return{valid:false,reason:result.reason,fit:result}

  const offset=result.best.offsetLdu
  const sourceIsMale=source===male
  return{
    valid:true,
    offsetLdu:offset,
    sourceOffsetLdu:sourceIsMale?offset:-offset,
    engagementLdu:result.best.engagementLdu,
    fit:result,
  }
}

export function solveMechanicalPlacement({
  source,
  target,
  sourceFrame,
  targetFrame,
  objectPose,
  match=null,
  requestedOffsetLdu=null,
  axisPolarity=1,
  twistCorrectionRad=null,
  preserveOrientation=false,
}={}){
  const resolvedMatch=match??matchMechanicalEndpoints(source,target)
  if(!resolvedMatch?.compatible)return Object.freeze({
    valid:false,
    reason:resolvedMatch?.reason||'incompatible',
    match:resolvedMatch,
  })
  if(!sourceFrame||!targetFrame||!objectPose)return Object.freeze({
    valid:false,
    reason:'frames-or-pose-missing',
    match:resolvedMatch,
  })

  const delta=sub3(sourceFrame.position,targetFrame.position)
  const initialAxial=dot3(delta,targetFrame.axis)
  const lateral=sub3(delta,scale3(targetFrame.axis,initialAxial))
  const requested=Number.isFinite(requestedOffsetLdu)
    ?Number(requestedOffsetLdu)
    :initialAxial*20

  const axial=axialSolution(source,target,resolvedMatch,requested)
  if(!axial.valid)return Object.freeze({
    valid:false,
    reason:'axial-profile-no-fit',
    match:resolvedMatch,
    axial,
  })

  const orientation=orientationSolution(
    sourceFrame,targetFrame,resolvedMatch,objectPose,
    {axisPolarity,twistCorrectionRad,preserveOrientation},
  )

  const rotatedSourceOffset=rotate3(
    orientation.rotationDelta,
    sub3(sourceFrame.position,objectPose.position),
  )
  const desiredConnectorPosition=add3(
    targetFrame.position,
    scale3(targetFrame.axis,axial.sourceOffsetLdu/20),
  )
  const desiredObjectPosition=sub3(desiredConnectorPosition,rotatedSourceOffset)

  return Object.freeze({
    valid:true,
    reason:'solved',
    solverVersion:PLACEMENT_SOLVER_VERSION,
    match:resolvedMatch,
    axial,
    axisPolarity:axisPolarity<0?-1:1,
    worldPosition:Object.freeze(desiredObjectPosition),
    worldQuaternion:Object.freeze(orientation.desiredQuaternion),
    desiredConnectorPosition:Object.freeze(desiredConnectorPosition),
    targetAxis:Object.freeze([...targetFrame.axis]),
    diagnostics:Object.freeze({
      initialConnectorDistanceStud:len3(delta),
      initialLateralDistanceStud:len3(lateral),
      initialAxialSeparationStud:initialAxial,
      translationStud:len3(sub3(desiredObjectPosition,objectPose.position)),
      rotationRad:quaternionAngle(orientation.rotationDelta),
      twistCorrectionRad:orientation.twistCorrectionRad,
      engagementLdu:axial.engagementLdu,
      axisDot:dot3(norm3(sourceFrame.axis),norm3(targetFrame.axis)),
    }),
  })
}
