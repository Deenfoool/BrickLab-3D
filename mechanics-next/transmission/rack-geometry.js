import {
  add3,
  dot3,
  len3,
  norm3,
  rotate3,
  scale3,
  sub3,
  cross3,
} from '../math/rigid.js'

export const RACK_GEOMETRY_VERSION='mechanics-rack-geometry-0.1.0'
const DEFAULT_MODULE_TOLERANCE=.004
const DEFAULT_AXIS_ALIGNMENT=.965
const DEFAULT_WIDTH_TOLERANCE=.10
const DEFAULT_CENTER_TOLERANCE=.08
const EPS=1e-9

function rackHint(record){
  return record?.instance?.transmissions?.find(hint=>hint?.equationFamily==='rack-pinion')??null
}

function finite3(value){
  return Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)
}

function localPoint(record,point){
  return add3(record.pose.position,rotate3(record.pose.quaternion,point))
}

function localDirection(record,direction){
  return norm3(rotate3(record.pose.quaternion,direction))
}

function contactSpan(geometry){
  const pitch=Number(geometry?.linearPitchStud)
  const count=Math.floor(Number(geometry?.toothCount))
  const first=Number(geometry?.phaseOriginStud)
  if(!(pitch>0)||!(count>0)||!Number.isFinite(first))return null
  const half=pitch*.5
  return Object.freeze({
    minStud:first-half,
    maxStud:first+(count-1)*pitch+half,
  })
}

export function rackFrameForRecord(record){
  const hint=rackHint(record)
  const geometry=hint?.rackGeometry
  if(!geometry)return null

  const moduleStud=Number(geometry.moduleStud)
  const linearPitchStud=Number(geometry.linearPitchStud)
  if(!(moduleStud>0)||!(linearPitchStud>0))return null
  if(!finite3(geometry.pitchLinePoint)||
     !finite3(geometry.travelAxis)||
     !finite3(geometry.toothNormal)||
     !finite3(geometry.widthAxis))return null

  const span=contactSpan(geometry)
  return Object.freeze({
    bodyId:record.instance.body.id,
    instanceId:record.instance.body.instanceId,
    moduleStud,
    linearPitchStud,
    pitchOrigin:Object.freeze(localPoint(record,geometry.pitchLinePoint)),
    travelAxis:Object.freeze(localDirection(record,geometry.travelAxis)),
    normal:Object.freeze(localDirection(record,geometry.toothNormal)),
    widthAxis:Object.freeze(localDirection(record,geometry.widthAxis)),
    phaseOriginStud:Number.isFinite(Number(geometry.phaseOriginStud))
      ?Number(geometry.phaseOriginStud):null,
    toothCount:Number.isFinite(Number(geometry.toothCount))
      ?Number(geometry.toothCount):null,
    maxTravelStud:Number.isFinite(Number(geometry.maxTravelStud))
      ?Number(geometry.maxTravelStud):null,
    contactMinStud:span?.minStud??null,
    contactMaxStud:span?.maxStud??null,
    source:geometry.source??'mechanics-next:rack-geometry',
    hint,
  })
}

export function evaluateRackPinionPair(pinion,rack,{
  moduleTolerance=DEFAULT_MODULE_TOLERANCE,
  minAxisAlignment=DEFAULT_AXIS_ALIGNMENT,
  widthTolerance=DEFAULT_WIDTH_TOLERANCE,
  centerTolerance=DEFAULT_CENTER_TOLERANCE,
}={}){
  if(!pinion||!rack)return Object.freeze({valid:false,reason:'missing-frame'})
  if(pinion.kind!=='spur')return Object.freeze({valid:false,reason:'pinion-not-spur'})
  if(Math.abs(Number(pinion.hint?.gearGeometry?.moduleStud??1/8)-rack.moduleStud)>moduleTolerance){
    return Object.freeze({valid:false,reason:'module-mismatch'})
  }

  const axisAlignment=Math.abs(dot3(pinion.axis,rack.widthAxis))
  if(axisAlignment<minAxisAlignment){
    return Object.freeze({valid:false,reason:'axis-not-perpendicular-to-rack',axisAlignment})
  }

  const delta=sub3(pinion.center,rack.pitchOrigin)
  const along=dot3(delta,rack.travelAxis)
  const pitchPoint=add3(rack.pitchOrigin,scale3(rack.travelAxis,along))
  const side=Math.sign(dot3(delta,rack.normal))||1
  const desiredCenter=add3(pitchPoint,scale3(rack.normal,side*pinion.pitchRadius))
  const centerError=len3(sub3(pinion.center,desiredCenter))
  const widthOffset=Math.abs(dot3(delta,rack.widthAxis))
  const withinRack=
    (rack.contactMinStud==null||along>=rack.contactMinStud-EPS)&&
    (rack.contactMaxStud==null||along<=rack.contactMaxStud+EPS)

  const radial=norm3(sub3(pitchPoint,pinion.center))
  const tangent=norm3(cross3(pinion.axis,radial),rack.travelAxis)
  const travelSign=Math.sign(dot3(tangent,rack.travelAxis))||1
  const tangentAlignment=Math.abs(dot3(tangent,rack.travelAxis))

  const valid=
    withinRack&&
    widthOffset<=widthTolerance&&
    centerError<=centerTolerance&&
    tangentAlignment>=.92

  return Object.freeze({
    valid,
    reason:!withinRack
      ?'outside-rack-teeth'
      :valid?'rack-pinion':'mesh-disengaged',
    axisAlignment,
    tangentAlignment,
    widthOffset,
    centerError,
    alongStud:along,
    pitchPoint:Object.freeze(pitchPoint),
    desiredCenter:Object.freeze(desiredCenter),
    radial:Object.freeze(radial),
    travelSign,
    pitchRadius:pinion.pitchRadius,
    moduleStud:rack.moduleStud,
  })
}
