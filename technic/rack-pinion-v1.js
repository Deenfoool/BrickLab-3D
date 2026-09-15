import * as THREE from 'three'
import { findPart } from '../parts.js'

export const TECHNIC_RACK_PINION_VERSION = 'technic-rack-pinion-v1.0.1'
const TAU = Math.PI * 2
const DEFAULT_MODULE = 1 / 8
const EPS = 1e-9

function positiveModulo(value, period) { return ((value % period) + period) % period }
function wrapPeriod(value, period) { return positiveModulo(value + period / 2, period) - period / 2 }
function worldQuaternion(object) { return object.getWorldQuaternion(new THREE.Quaternion()) }
function worldDirection(object, local) { return new THREE.Vector3(...local).normalize().applyQuaternion(worldQuaternion(object)).normalize() }
function worldPoint(object, local) { object.updateWorldMatrix?.(true,false); return new THREE.Vector3(...local).applyMatrix4(object.matrixWorld) }
function localReferenceWorld(object, axisWorld) {
  let ref = new THREE.Vector3(1,0,0).applyQuaternion(worldQuaternion(object)).projectOnPlane(axisWorld)
  if (ref.lengthSq() < EPS) ref = new THREE.Vector3(0,1,0).applyQuaternion(worldQuaternion(object)).projectOnPlane(axisWorld)
  return ref.lengthSq() < EPS ? null : ref.normalize()
}
function signedAngleAround(from, to, axis) {
  const a=from.clone().projectOnPlane(axis), b=to.clone().projectOnPlane(axis)
  if (a.lengthSq()<EPS || b.lengthSq()<EPS) return 0
  a.normalize(); b.normalize()
  return Math.atan2(axis.dot(a.clone().cross(b)), THREE.MathUtils.clamp(a.dot(b),-1,1))
}

export function installKnownRackMetadataV1(definition = findPart('steering-rack-7')) {
  if (!definition || definition.mechanics?.rackGear) return definition ?? null
  const visual=definition.rackVisualMetrics
  const slider=definition.connectors?.find(item=>item.id===definition.mechanics?.steeringRack?.sliderConnectorId)
  if (!visual || !slider || !(visual.moduleStud>0) || !(visual.linearPitchStud>0)) return definition

  const railCenterY=0.50
  const railHeight=0.30
  const rootLineY=railCenterY+railHeight/2
  const pitchLineY=rootLineY+Number(visual.pitchLineOffsetStud||0)
  const usableLength=5.72
  const toothCount=Math.max(3,Math.floor(usableLength/visual.linearPitchStud)+1)
  const phaseOriginStud=-((toothCount-1)*visual.linearPitchStud)/2
  definition.mechanics={
    ...definition.mechanics,
    rackGear:{
      version:TECHNIC_RACK_PINION_VERSION,
      moduleStud:visual.moduleStud,
      pressureAngleDeg:visual.pressureAngleDeg,
      linearPitchStud:visual.linearPitchStud,
      pitchLinePoint:[0,pitchLineY,0],
      travelAxis:[1,0,0],
      toothNormal:[0,1,0],
      widthAxis:[0,0,1],
      phaseOriginStud,
      toothCount,
      maxTravelStud:definition.mechanics?.steeringRack?.maxTravelStud ?? null,
      source:'parts-6-module-matched-steering-rack-v4',
    },
  }
  return definition
}

function pinionDescriptor(object) {
  const definition=findPart(object?.userData?.partId)
  const gear=definition?.mechanics?.gear
  if (!gear || (gear.kind ?? 'spur')!=='spur' || !(Number(gear.teeth)>0)) return null
  const connector=definition.connectors?.find(item=>item.type==='axle-hole')
  if (!connector) return null
  const center=worldPoint(object,connector.position)
  const axis=worldDirection(object,connector.axis)
  const reference=localReferenceWorld(object,axis)
  if (!reference) return null
  return {
    object,definition,connector,teeth:Number(gear.teeth),
    pitchRadius:Number(gear.pitchRadius)||Number(gear.teeth)/16,
    moduleStud:Number(gear.moduleStud)||DEFAULT_MODULE,
    center,axis,reference,
  }
}

function rackDescriptor(object) {
  const definition=findPart(object?.userData?.partId)
  const rack=definition?.mechanics?.rackGear
  if (!rack || !(rack.moduleStud>0) || !(rack.linearPitchStud>0)) return null
  const connector=definition.connectors?.find(item=>item.id===definition.mechanics?.steeringRack?.sliderConnectorId)
    ?? definition.connectors?.find(item=>item.type==='slider')
  return {
    object,definition,connector,rack,
    pitchOrigin:worldPoint(object,rack.pitchLinePoint),
    travelAxis:worldDirection(object,rack.travelAxis),
    normal:worldDirection(object,rack.toothNormal),
    widthAxis:worldDirection(object,rack.widthAxis),
  }
}

export function evaluateRackPinionMeshV1(pinion, rack, options={}) {
  if (!pinion || !rack) return {valid:false,reason:'missing-descriptor'}
  const moduleTolerance=options.moduleTolerance??0.004
  if (Math.abs(pinion.moduleStud-rack.rack.moduleStud)>moduleTolerance) return {valid:false,reason:'module-mismatch'}
  const axisAlignment=Math.abs(pinion.axis.dot(rack.widthAxis))
  if (axisAlignment<(options.minAxisAlignment??0.965)) return {valid:false,reason:'axis-not-perpendicular-to-rack',axisAlignment}
  const delta=pinion.center.clone().sub(rack.pitchOrigin)
  const along=delta.dot(rack.travelAxis)
  const pitchPoint=rack.pitchOrigin.clone().addScaledVector(rack.travelAxis,along)
  const side=Math.sign(delta.dot(rack.normal))||1
  const desiredCenter=pitchPoint.clone().addScaledVector(rack.normal,side*pinion.pitchRadius)
  const translation=desiredCenter.clone().sub(pinion.center)
  const widthOffset=Math.abs(delta.dot(rack.widthAxis))
  const centerError=translation.length()
  const captureDistance=options.captureDistance??Math.max(.24,Math.min(.50,pinion.pitchRadius*.28))
  const valid=widthOffset<=(options.widthTolerance??0.16)&&centerError<=captureDistance
  return {valid,reason:valid?'rack-pinion':'out-of-capture',axisAlignment,widthOffset,along,side,pitchPoint,desiredCenter,translation,centerError,captureDistance,targetDistance:pinion.pitchRadius}
}

export function solveRackPinionPhaseV1(pinion,rack,geometry) {
  if (!pinion?.reference || !geometry?.pitchPoint) return null
  const contactDirection=geometry.pitchPoint.clone().sub(geometry.desiredCenter).normalize()
  const toothPitchRad=TAU/pinion.teeth
  const angle=signedAngleAround(pinion.reference,contactDirection,pinion.axis)
  const rackPhase=positiveModulo((geometry.along-Number(rack.rack.phaseOriginStud||0))/rack.rack.linearPitchStud,1)
  const desiredPinionPhase=positiveModulo(.5-rackPhase,1)
  const desiredAngle=desiredPinionPhase*toothPitchRad
  return {
    correction:wrapPeriod(angle-desiredAngle,toothPitchRad),
    axis:pinion.axis.clone(),
    rackPhase,
    desiredPinionPhase,
    toothPitchRadians:toothPitchRad,
  }
}

export function findRackPinionSnapCandidateV1(selected,objects,options={}) {
  installKnownRackMetadataV1()
  const movingPinion=pinionDescriptor(selected)
  const movingRack=rackDescriptor(selected)
  let best=null
  for (const targetObject of objects??[]) {
    if (!targetObject || targetObject===selected) continue
    const fixedRack=movingPinion?rackDescriptor(targetObject):null
    const fixedPinion=movingRack?pinionDescriptor(targetObject):null
    if (!fixedRack&&!fixedPinion) continue

    const pinion=movingPinion||fixedPinion
    const rack=fixedRack||movingRack
    const geometry=evaluateRackPinionMeshV1(pinion,rack,options)
    if (!geometry.valid) continue
    const phase=solveRackPinionPhaseV1(pinion,rack,geometry)
    const movingKind=movingPinion?'pinion':'rack'
    const translation=movingPinion?geometry.translation.clone():geometry.translation.clone().multiplyScalar(-1)
    const score=geometry.centerError/Math.max(geometry.captureDistance,EPS)+(1-geometry.axisAlignment)*.15
    const candidate={
      kind:'rack-pinion-mesh',
      placementOnly:true,
      movingKind,
      targetObject,
      source:movingPinion?.connector??movingRack?.connector,
      target:fixedRack?.connector??fixedPinion?.connector,
      targetWorld:geometry.pitchPoint.clone(),
      distance:geometry.centerError,
      pinion,rack,geometry,phase,translation,score,
      key:`rack-pinion:${selected.userData?.instanceId}>${targetObject.userData?.instanceId}`,
      ratio:null,
    }
    if (!best||candidate.score<best.score) best=candidate
  }
  return best
}

function applyWorldDelta(object,worldDelta) {
  if (!object.parent) object.position.add(worldDelta)
  else {
    const parentQ=object.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
    object.position.add(worldDelta.clone().applyQuaternion(parentQ))
  }
  object.updateMatrixWorld?.(true)
}

function applyWorldAxisRotation(object,worldAxis,angle) {
  if (!worldAxis||!Number.isFinite(angle)||Math.abs(angle)<1e-8) return
  const delta=new THREE.Quaternion().setFromAxisAngle(worldAxis.clone().normalize(),angle)
  const worldQ=object.getWorldQuaternion(new THREE.Quaternion())
  const next=delta.multiply(worldQ)
  if (!object.parent) object.quaternion.copy(next)
  else object.quaternion.copy(object.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(next))
  object.updateMatrixWorld?.(true)
}

export function applyRackPinionSnapV1(selected,candidate) {
  if (candidate?.kind!=='rack-pinion-mesh') return false
  applyWorldDelta(selected,candidate.translation)
  if (candidate.movingKind==='pinion'&&candidate.phase) {
    applyWorldAxisRotation(selected,candidate.phase.axis,candidate.phase.correction)
  }
  globalThis.__bricklabLastRackPinionSnap={
    version:TECHNIC_RACK_PINION_VERSION,
    movingKind:candidate.movingKind,
    pinionPartId:candidate.pinion?.object?.userData?.partId??null,
    rackPartId:candidate.rack?.object?.userData?.partId??null,
    teeth:candidate.pinion?.teeth??null,
    pitchRadiusStud:candidate.pinion?.pitchRadius??null,
    phaseAligned:Boolean(candidate.movingKind==='pinion'&&candidate.phase),
  }
  globalThis.dispatchEvent?.(new CustomEvent('bricklab:rackpinionsnap',{detail:globalThis.__bricklabLastRackPinionSnap}))
  return true
}
