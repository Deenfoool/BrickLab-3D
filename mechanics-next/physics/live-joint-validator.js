import { rigidPoseFromMatrix4 } from '../math/rigid.js'
import { worldConnectorFrame } from '../connectors/world-frame.js'
import { matchMechanicalEndpoints } from '../connectors/profile-matcher.js'
import { evaluateAxialOffset } from '../connectors/axial-fit.js'

export const LIVE_JOINT_VALIDATOR_VERSION='mechanics-live-joint-validator-0.1.0'
const EPS=1e-8

function dot3(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function sub3(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]]}
function len3(a){return Math.hypot(a[0],a[1],a[2])}
function scale3(a,s){return[a[0]*s,a[1]*s,a[2]*s]}

function recordIndex(records=[]){
  return new Map(
    records
      .filter(record=>record?.instance?.body?.id)
      .map(record=>[String(record.instance.body.id),record]),
  )
}

function endpointById(record,id){
  const wanted=String(id||'')
  return record?.instance?.endpoints?.find(endpoint=>String(endpoint?.id||'')===wanted)??null
}

function livePose(record){
  const object=record?.object
  object?.updateWorldMatrix?.(true,false)
  const elements=object?.matrixWorld?.elements
  if(elements?.length===16)return rigidPoseFromMatrix4(Array.from(elements))
  return record?.pose??null
}

function liveFrame(record,endpoint){
  const pose=livePose(record)
  if(!pose||!endpoint)return null
  return worldConnectorFrame(pose,endpoint,{
    visualOffsetStud:record?.visualOffsetStud||[0,0,0],
  })
}

function endpointRadiusStud(endpoint){
  const sections=endpoint?.profile?.sections||[]
  const radii=sections.map(section=>Number(section.radiusLdu)).filter(Number.isFinite)
  const direct=Number(endpoint?.profile?.radiusLdu)
  if(Number.isFinite(direct))radii.push(direct)
  return radii.length?Math.max(...radii)/20:0
}

function intervalDistance(a,b){
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==2||b.length!==2)return Infinity
  return Math.abs(Number(a[0])-Number(b[0]))+Math.abs(Number(a[1])-Number(b[1]))
}

function savedMaleInterval(constraint){
  const reservations=constraint?.metadata?.occupancy?.axialReservations
  if(!Array.isArray(reservations)||!reservations.length)return null
  const value=reservations[0]?.interval
  return Array.isArray(value)&&value.length===2?value.map(Number):null
}

function cylinderOffset(match,frameA,frameB,endpointA,sign=1){
  const maleIsA=match.male===endpointA
  const maleFrame=maleIsA?frameA:frameB
  const femaleFrame=maleIsA?frameB:frameA
  const delta=sub3(maleFrame.position,femaleFrame.position)
  return dot3(delta,femaleFrame.axis)*20*sign
}

function calibrationForCylinder(constraint,match,frameA,frameB,endpointA){
  const saved=savedMaleInterval(constraint)
  const candidates=[1,-1].map(sign=>{
    const offset=cylinderOffset(match,frameA,frameB,endpointA,sign)
    const fit=evaluateAxialOffset(match.male,match.female,offset,{minimumEngagementLdu:1})
    return{sign,offset,fit}
  })
  candidates.sort((left,right)=>{
    if(Boolean(left.fit.valid)!==Boolean(right.fit.valid))return left.fit.valid?-1:1
    const savedLeft=saved?intervalDistance(left.fit.occupiedMaleInterval,saved):Infinity
    const savedRight=saved?intervalDistance(right.fit.occupiedMaleInterval,saved):Infinity
    if(Math.abs(savedLeft-savedRight)>EPS)return savedLeft-savedRight
    return right.fit.engagementLdu-left.fit.engagementLdu
  })
  return Object.freeze({
    offsetSign:candidates[0].sign,
    initialOffsetLdu:candidates[0].offset,
    initialFit:candidates[0].fit,
  })
}

function lateralDistance(frameA,frameB,axis){
  const delta=sub3(frameA.position,frameB.position)
  const axial=dot3(delta,axis)
  return len3(sub3(delta,scale3(axis,axial)))
}

function alignment(frameA,frameB){
  return Math.abs(dot3(frameA.axis,frameB.axis))
}

function genericToleranceStud(endpointA,endpointB){
  const radius=Math.max(endpointRadiusStud(endpointA),endpointRadiusStud(endpointB))
  return Math.max(.02,Math.min(.12,radius*.45||.04))
}

function prepareConstraint(constraint,recordsByBody){
  const recordA=recordsByBody.get(String(constraint?.bodyA||''))
  const recordB=recordsByBody.get(String(constraint?.bodyB||''))
  const endpointA=endpointById(recordA,constraint?.metadata?.endpointAId)
  const endpointB=endpointById(recordB,constraint?.metadata?.endpointBId)
  if(!recordA||!recordB||!endpointA||!endpointB)return Object.freeze({
    id:String(constraint?.id||''),
    constraint,
    valid:false,
    reason:'live-endpoint-missing',
  })
  const initialA=liveFrame(recordA,endpointA)
  const initialB=liveFrame(recordB,endpointB)
  if(!initialA||!initialB)return Object.freeze({
    id:String(constraint.id),
    constraint,
    valid:false,
    reason:'live-frame-missing',
  })
  const match=matchMechanicalEndpoints(endpointA,endpointB)
  const calibration=match?.compatible&&match.family==='cylinder'
    ?calibrationForCylinder(constraint,match,initialA,initialB,endpointA)
    :null
  return Object.freeze({
    id:String(constraint.id),
    constraint,
    recordA,
    recordB,
    endpointA,
    endpointB,
    match,
    calibration,
    valid:true,
  })
}

export function createLiveJointValidator({
  graph,
  records=[],
  minimumAxisAlignment=.94,
}={}){
  const recordsByBody=recordIndex(records)
  const prepared=new Map()
  for(const constraint of graph?.edges?.('constraint')||[]){
    prepared.set(String(constraint.id),prepareConstraint(constraint,recordsByBody))
  }

  function validateConstraint(constraintId){
    const entry=prepared.get(String(constraintId))
    if(!entry)return Object.freeze({valid:false,reason:'constraint-not-prepared',constraintId})
    if(!entry.valid)return Object.freeze({valid:false,reason:entry.reason,constraintId:entry.id})

    const frameA=liveFrame(entry.recordA,entry.endpointA)
    const frameB=liveFrame(entry.recordB,entry.endpointB)
    if(!frameA||!frameB)return Object.freeze({
      valid:false,
      reason:'live-frame-unavailable',
      constraintId:entry.id,
    })
    const axisDot=alignment(frameA,frameB)
    if(axisDot<minimumAxisAlignment)return Object.freeze({
      valid:false,
      reason:'axis-disengaged',
      constraintId:entry.id,
      axisAlignment:axisDot,
    })

    const lateral=lateralDistance(frameA,frameB,frameB.axis)
    const lateralTolerance=genericToleranceStud(entry.endpointA,entry.endpointB)
    if(lateral>lateralTolerance)return Object.freeze({
      valid:false,
      reason:'lateral-disengaged',
      constraintId:entry.id,
      lateralDistanceStud:lateral,
      lateralToleranceStud:lateralTolerance,
    })

    if(entry.match?.compatible&&entry.match.family==='cylinder'){
      const sign=entry.calibration?.offsetSign??1
      const offset=cylinderOffset(
        entry.match,frameA,frameB,entry.endpointA,sign,
      )
      const fit=evaluateAxialOffset(
        entry.match.male,
        entry.match.female,
        offset,
        {minimumEngagementLdu:1},
      )
      return Object.freeze({
        valid:fit.valid,
        reason:fit.valid?'ok':fit.reason==='insufficient-engagement'
          ?'axial-disengaged'
          :fit.reason,
        constraintId:entry.id,
        axisAlignment:axisDot,
        lateralDistanceStud:lateral,
        offsetLdu:offset,
        engagementLdu:fit.engagementLdu,
        fit,
      })
    }

    // Non-axial retained interfaces are considered connected while their anchors
    // remain close and their required axes remain aligned. Ball/socket free
    // orientation is handled by its spherical joint and never reaches this branch
    // unless explicit occupancy requested live release.
    const distance=len3(sub3(frameA.position,frameB.position))
    const distanceTolerance=Math.max(lateralTolerance,.08)
    return Object.freeze({
      valid:distance<=distanceTolerance,
      reason:distance<=distanceTolerance?'ok':'anchor-disengaged',
      constraintId:entry.id,
      axisAlignment:axisDot,
      anchorDistanceStud:distance,
      distanceToleranceStud:distanceTolerance,
    })
  }

  return Object.freeze({
    version:LIVE_JOINT_VALIDATOR_VERSION,
    prepared:Object.freeze([...prepared.keys()]),
    validateJoint(item){
      const ids=item?.sourceConstraintIds||[]
      if(!ids.length)return Object.freeze({valid:true,reason:'no-source-constraint'})
      const results=ids.map(validateConstraint)
      const invalid=results.find(result=>!result.valid)
      return invalid
        ?Object.freeze({
            valid:false,
            reason:invalid.reason,
            jointId:item.id,
            results:Object.freeze(results),
          })
        :Object.freeze({
            valid:true,
            reason:'ok',
            jointId:item.id,
            results:Object.freeze(results),
          })
    },
  })
}
