import { rigidPoseFromMatrix4 } from '../math/rigid.js'
import { worldConnectorFrame } from '../connectors/world-frame.js'
import { matchMechanicalEndpoints } from '../connectors/profile-matcher.js'
import { evaluateAxialOffset } from '../connectors/axial-fit.js'
import { validateStudContactBundle } from '../connectors/contact-bundle.js'

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

function relativeOrientationSignature(frameA,frameB){
  const a=frameA?.orientation
  const b=frameB?.orientation
  if(!Array.isArray(a)||!Array.isArray(b)||a.length!==9||b.length!==9)return null
  const value=[]
  for(let row=0;row<3;row++){
    for(let col=0;col<3;col++){
      value.push(
        a[row]*b[col]+
        a[3+row]*b[3+col]+
        a[6+row]*b[6+col]
      )
    }
  }
  return value
}

function connectorTwistPhase(frameA,frameB){
  const axis=frameB?.axis
  const refA=frameA?.reference
  const refB=frameB?.reference
  if(!Array.isArray(axis)||!Array.isArray(refA)||!Array.isArray(refB))return null
  const project=(ref)=>{
    const dot=dot3(ref,axis)
    const value=sub3(ref,scale3(axis,dot))
    const length=len3(value)
    return length>1e-9?scale3(value,1/length):null
  }
  const a=project(refA),b=project(refB)
  if(!a||!b)return null
  const cross=[
    a[1]*b[2]-a[2]*b[1],
    a[2]*b[0]-a[0]*b[2],
    a[0]*b[1]-a[1]*b[0],
  ]
  const sin=dot3(axis,cross)
  const cos=Math.max(-1,Math.min(1,dot3(a,b)))
  return Math.atan2(sin,cos)
}
function wrapPeriod(value,period){
  if(!(Number.isFinite(value)&&Number.isFinite(period)&&period>0))return value
  return((value+period/2)%period+period)%period-period/2
}
function symmetryAwareOrientationDrift(match,savedGeometry,frameA,frameB,rawDrift){
  const symmetry=Number(match?.rotationalSymmetry)
  const saved=Number(savedGeometry?.twistPhaseRad)
  const current=connectorTwistPhase(frameA,frameB)
  if(match?.keyed!==true||!Number.isFinite(symmetry)||symmetry<=1||
     !Number.isFinite(saved)||!Number.isFinite(current))return rawDrift
  return Math.abs(wrapPeriod(current-saved,Math.PI*2/symmetry))
}

function orientationDrift(saved,frameA,frameB){
  if(!Array.isArray(saved)||saved.length!==9)return 0
  const current=relativeOrientationSignature(frameA,frameB)
  if(!current)return Infinity
  return Math.max(...current.map((value,index)=>Math.abs(value-Number(saved[index]))))
}

function anchorDistanceDelta(distance,savedDistance){
  const initial=Number(savedDistance)
  return Number.isFinite(initial)?Math.abs(distance-initial):distance
}

function prismaticTravel(constraint,frameA,frameB,savedGeometry){
  const delta=sub3(frameA.position,frameB.position)
  const axial=dot3(delta,frameB.axis)
  const initial=Number(savedGeometry?.axialSeparationStud)
  const travel=Number.isFinite(initial)?axial-initial:0
  const dof=constraint?.dof?.ty
  const limits=Array.isArray(dof?.limits)&&dof.limits.length===2
    ?dof.limits.map(Number):null
  const limited=dof?.state==='limited'&&limits?.every(Number.isFinite)
  return Object.freeze({
    axialSeparationStud:axial,
    travelStud:travel,
    limits:limited?Object.freeze(limits):null,
    withinLimits:!limited||(travel>=Math.min(...limits)-1e-5&&travel<=Math.max(...limits)+1e-5),
  })
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
  const calibration=match?.compatible&&['cylinder','clip-cylinder'].includes(match.family)
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
    savedGeometry:constraint?.metadata?.connectionGeometry??null,
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

    const contactBundle=entry.constraint?.metadata?.contactBundle??null
    if(contactBundle?.kind==='stud-bundle'){
      const bundleValidation=validateStudContactBundle(contactBundle,{
        instanceA:entry.recordA.instance,
        instanceB:entry.recordB.instance,
        frameAForEndpoint:endpoint=>liveFrame(entry.recordA,endpoint),
        frameBForEndpoint:endpoint=>liveFrame(entry.recordB,endpoint),
      })
      if(!bundleValidation.valid)return Object.freeze({
        valid:false,
        reason:`contact-bundle-invalid:${bundleValidation.reason}`,
        constraintId:entry.id,
        bundleValidation,
      })
    }

    const kind=String(entry.constraint?.constraintKind??entry.constraint?.kind??'fixed')
    const delta=sub3(frameA.position,frameB.position)
    const distance=len3(delta)
    const lateralTolerance=genericToleranceStud(entry.endpointA,entry.endpointB)
    const distanceTolerance=Math.max(lateralTolerance,.08)
    const savedGeometry=entry.savedGeometry||{}
    const anchorDelta=anchorDistanceDelta(distance,savedGeometry.anchorDistanceStud)

    // Spherical joints retain only a coincident ball/socket centre. Their
    // relative orientation is intentionally free and must never trigger release.
    if(kind==='spherical'){
      return Object.freeze({
        valid:anchorDelta<=distanceTolerance,
        reason:anchorDelta<=distanceTolerance?'ok':'anchor-disengaged',
        constraintId:entry.id,
        anchorDistanceStud:distance,
        anchorDistanceDeltaStud:anchorDelta,
        distanceToleranceStud:distanceTolerance,
      })
    }

    const axisDot=alignment(frameA,frameB)
    if(axisDot<minimumAxisAlignment)return Object.freeze({
      valid:false,
      reason:'axis-disengaged',
      constraintId:entry.id,
      axisAlignment:axisDot,
    })

    const lateral=lateralDistance(frameA,frameB,frameB.axis)
    if(lateral>lateralTolerance)return Object.freeze({
      valid:false,
      reason:'lateral-disengaged',
      constraintId:entry.id,
      axisAlignment:axisDot,
      lateralDistanceStud:lateral,
      lateralToleranceStud:lateralTolerance,
    })

    const orientationTolerance=.035
    const rawDrift=orientationDrift(
      savedGeometry.relativeOrientation,
      frameA,
      frameB,
    )
    const drift=symmetryAwareOrientationDrift(
      entry.match,
      savedGeometry,
      frameA,
      frameB,
      rawDrift,
    )
    const orientationLocked=kind==='fixed'||kind==='prismatic'

    if(entry.match?.compatible&&['cylinder','clip-cylinder'].includes(entry.match.family)){
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
      if(!fit.valid)return Object.freeze({
        valid:false,
        reason:fit.reason==='insufficient-engagement'?'axial-disengaged':fit.reason,
        constraintId:entry.id,
        axisAlignment:axisDot,
        lateralDistanceStud:lateral,
        offsetLdu:offset,
        engagementLdu:fit.engagementLdu,
        fit,
      })
      if(orientationLocked&&drift>orientationTolerance)return Object.freeze({
        valid:false,
        reason:'orientation-disengaged',
        constraintId:entry.id,
        axisAlignment:axisDot,
        orientationDrift:drift,
        orientationTolerance,
        offsetLdu:offset,
        engagementLdu:fit.engagementLdu,
        fit,
      })
      return Object.freeze({
        valid:true,
        reason:'ok',
        constraintId:entry.id,
        axisAlignment:axisDot,
        lateralDistanceStud:lateral,
        orientationDrift:drift,
        offsetLdu:offset,
        engagementLdu:fit.engagementLdu,
        fit,
      })
    }

    if(kind==='prismatic'){
      const travel=prismaticTravel(entry.constraint,frameA,frameB,savedGeometry)
      if(drift>orientationTolerance)return Object.freeze({
        valid:false,
        reason:'orientation-disengaged',
        constraintId:entry.id,
        axisAlignment:axisDot,
        lateralDistanceStud:lateral,
        orientationDrift:drift,
        orientationTolerance,
        travel,
      })
      return Object.freeze({
        valid:travel.withinLimits,
        reason:travel.withinLimits?'ok':'travel-limit-exceeded',
        constraintId:entry.id,
        axisAlignment:axisDot,
        lateralDistanceStud:lateral,
        orientationDrift:drift,
        travel,
      })
    }

    if(kind==='fixed'&&drift>orientationTolerance)return Object.freeze({
      valid:false,
      reason:'orientation-disengaged',
      constraintId:entry.id,
      axisAlignment:axisDot,
      orientationDrift:drift,
      orientationTolerance,
      anchorDistanceStud:distance,
      anchorDistanceDeltaStud:anchorDelta,
    })

    // Revolute retains the anchor and axis but permits twist. Fixed retains the
    // same anchor geometry and has already passed the orientation check above.
    return Object.freeze({
      valid:anchorDelta<=distanceTolerance,
      reason:anchorDelta<=distanceTolerance?'ok':'anchor-disengaged',
      constraintId:entry.id,
      axisAlignment:axisDot,
      anchorDistanceStud:distance,
      anchorDistanceDeltaStud:anchorDelta,
      distanceToleranceStud:distanceTolerance,
      orientationDrift:drift,
    })
  }

  return Object.freeze({
    version:LIVE_JOINT_VALIDATOR_VERSION,
    prepared:Object.freeze([...prepared.keys()]),
    validateConstraint,
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
