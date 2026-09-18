import {
  add3,
  dot3,
  len3,
  norm3,
  rotate3,
  scale3,
  sub3,
} from '../math/rigid.js'
import { endpointSemanticKind } from '../intelligence/endpoint-semantics.js'
import { worldConnectorFrame } from '../connectors/world-frame.js'

export const GEAR_GEOMETRY_VERSION='mechanics-gear-geometry-0.1.0'
export const GEAR_CLEARANCE_STUD=Object.freeze({spur:.018,bevel:.100})

function ldrawPointToBrickLab(pointLdu,visualOffsetStud=[0,0,0]){
  return[
    Number(pointLdu?.[0]||0)/20+(visualOffsetStud[0]||0),
    -Number(pointLdu?.[1]||0)/20+(visualOffsetStud[1]||0),
    -Number(pointLdu?.[2]||0)/20+(visualOffsetStud[2]||0),
  ]
}
function ldrawAxisToBrickLab(axisLdu){
  return norm3([
    Number(axisLdu?.[0]||0),
    -Number(axisLdu?.[1]||0),
    -Number(axisLdu?.[2]||0),
  ])
}
function rotaryEndpoint(instance){
  const preferred=['technic-axle-hole','technic-round-hole','wheel-axle-interface']
  for(const kind of preferred){
    const endpoint=instance?.endpoints?.find(item=>endpointSemanticKind(item)===kind)
    if(endpoint)return endpoint
  }
  return instance?.endpoints?.find(item=>['cylinder','generic'].includes(item?.family))??null
}
function gearHint(record){
  return record?.instance?.transmissions?.find(hint=>hint?.equationFamily==='gear-mesh')??null
}
function validSigns(value){
  const signs=Array.isArray(value)?value.map(Number).filter(item=>item===-1||item===1):[]
  return signs.length?[...new Set(signs)]:[-1,1]
}

export function gearFrameForRecord(record){
  const hint=gearHint(record)
  if(!hint||!(Number(hint.toothCount)>0))return null

  const geometry=hint.gearGeometry||{}
  let center=null,axis=null,source='rotary-endpoint'
  if(Array.isArray(geometry.meshAnchorLdu)&&Array.isArray(geometry.meshAxisLdu)){
    const localCenter=ldrawPointToBrickLab(geometry.meshAnchorLdu,record.visualOffsetStud)
    const localAxis=ldrawAxisToBrickLab(geometry.meshAxisLdu)
    center=add3(record.pose.position,rotate3(record.pose.quaternion,localCenter))
    axis=norm3(rotate3(record.pose.quaternion,localAxis))
    source='gear-geometry-evidence'
  }else{
    const endpoint=rotaryEndpoint(record.instance)
    if(!endpoint)return null
    const frame=worldConnectorFrame(record.pose,endpoint,{visualOffsetStud:record.visualOffsetStud||[0,0,0]})
    center=[...frame.position]
    axis=[...frame.axis]
  }

  return Object.freeze({
    bodyId:record.instance.body.id,
    instanceId:record.instance.body.instanceId,
    kind:hint.kind==='bevel-gear'?'bevel':'spur',
    teeth:Number(hint.toothCount),
    pitchRadius:Number(hint.pitchRadius)||Number(hint.toothCount)/16,
    center:Object.freeze(center),
    axis:Object.freeze(axis),
    source,
    bevelApexSigns:Object.freeze(validSigns(geometry.bevelApexSigns)),
    meshApexToleranceStud:geometry.meshApexToleranceStud != null && Number.isFinite(Number(geometry.meshApexToleranceStud))
      ?Number(geometry.meshApexToleranceStud):null,
    meshCaptureDistanceStud:geometry.meshCaptureDistanceStud != null && Number.isFinite(Number(geometry.meshCaptureDistanceStud))
      ?Number(geometry.meshCaptureDistanceStud):null,
    hint,
  })
}

export function evaluateSpurGearPair(a,b,{
  minAlignment=.985,
  axialTolerance=.16,
  distanceTolerance=.08,
  clearanceStud=GEAR_CLEARANCE_STUD.spur,
}={}){
  const axisA=norm3(a.axis),axisB=norm3(b.axis)
  const axisDot=dot3(axisA,axisB)
  const axisAlignment=Math.abs(axisDot)
  const delta=sub3(b.center,a.center)
  const axialOffset=Math.abs(dot3(delta,axisA))
  const radial=sub3(delta,scale3(axisA,dot3(delta,axisA)))
  const centerDistance=len3(radial)
  const targetDistance=a.pitchRadius+b.pitchRadius+Math.max(0,Number(clearanceStud)||0)
  const distanceError=Math.abs(centerDistance-targetDistance)
  const valid=axisAlignment>=minAlignment&&axialOffset<=axialTolerance&&distanceError<=distanceTolerance
  return Object.freeze({
    kind:'spur',
    valid,
    axisDot,
    axisAlignment,
    axialOffset,
    centerDistance,
    targetDistance,
    distanceError,
    directionSign:axisDot>=0?-1:1,
  })
}

export function evaluateBevelGearPair(a,b,{
  maxAxisDot=.12,
  apexTolerance=null,
  clearanceStud=GEAR_CLEARANCE_STUD.bevel,
}={}){
  const axisA=norm3(a.axis),axisB=norm3(b.axis)
  const axisDot=dot3(axisA,axisB)
  const axisOrthogonality=Math.abs(axisDot)
  const legA=b.pitchRadius+Math.max(0,Number(clearanceStud)||0)
  const legB=a.pitchRadius+Math.max(0,Number(clearanceStud)||0)
  let best=null

  for(const signA of validSigns(a.bevelApexSigns)){
    const apexA=add3(a.center,scale3(axisA,signA*legA))
    for(const signB of validSigns(b.bevelApexSigns)){
      const apexB=add3(b.center,scale3(axisB,signB*legB))
      const apexError=len3(sub3(apexA,apexB))
      if(!best||apexError<best.apexError)best={signA,signB,apexA,apexB,apexError}
    }
  }

  const specific=Math.max(Number(a.meshApexToleranceStud)||0,Number(b.meshApexToleranceStud)||0)
  const tolerance=apexTolerance != null && Number.isFinite(Number(apexTolerance))
    ?Number(apexTolerance)
    :(specific>0?specific:.08)
  const valid=axisOrthogonality<=maxAxisDot&&Boolean(best)&&best.apexError<=tolerance
  return Object.freeze({
    kind:'bevel',
    valid,
    axisDot,
    axisOrthogonality,
    centerDistance:len3(sub3(a.center,b.center)),
    apexTolerance:tolerance,
    ...best,
    directionSign:best?-(best.signA*best.signB):-1,
  })
}

export function evaluateGearPair(a,b,options={}){
  if(!a||!b||a.bodyId===b.bodyId)return Object.freeze({valid:false,reason:'same-or-missing-body'})
  if(a.kind!==b.kind)return Object.freeze({valid:false,reason:'gear-kind-mismatch'})
  return a.kind==='bevel'
    ?evaluateBevelGearPair(a,b,options)
    :evaluateSpurGearPair(a,b,options)
}
