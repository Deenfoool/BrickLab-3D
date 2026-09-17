import * as THREE from 'three'
import { evaluateAxialOffsetV4 } from './axial-fit-v4.js'
import { matchConnectorV4 } from './matcher-v4.js'
import { bidirectionalCylinderPairV4, connectorWorldFrameV4 } from './placement-solver-v4.js'
import {
  circularTrackRadiusStudV4,
  engineCamTrackPairV4,
  projectCircularTrackPointV4,
} from './engine-cam-track-v4.js?v=connector-engine-continuous-rim-20260917-v2'

export const CONNECTION_VALIDITY_VERSION_V4 = 'connection-validity-v4.3.0'
export const CONNECTION_VALIDITY_LIMITS_V4 = Object.freeze({
  minAxisDot: 0.9995,
  maxLateralErrorStud: 0.035,
  maxKeyedTwistErrorRad: THREE.MathUtils.degToRad(0.75),
})

function signedAngleAround(from, to, axis) {
  const a = from.clone().projectOnPlane(axis)
  const b = to.clone().projectOnPlane(axis)
  if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) return 0
  a.normalize(); b.normalize()
  const cross = a.clone().cross(b)
  return Math.atan2(axis.dot(cross), THREE.MathUtils.clamp(a.dot(b), -1, 1))
}

function keyedTwistError(frameA, frameB, symmetry, axis = frameB.axis) {
  if (!Number.isFinite(symmetry)) return 0
  const angle = signedAngleAround(frameA.reference, frameB.reference, axis)
  const step = Math.PI * 2 / symmetry
  return Math.abs(angle - Math.round(angle / step) * step)
}

function validateContinuousTrack(connectorA,connectorB,frameA,frameB,match,limits){
  const pair=engineCamTrackPairV4(connectorA,connectorB)
  if(!pair)return null
  const trackFrame=pair.trackSide==='a'?frameA:frameB
  const followerFrame=pair.followerSide==='a'?frameA:frameB
  const radiusStud=circularTrackRadiusStudV4(pair.track)
  const projected=projectCircularTrackPointV4(trackFrame,followerFrame.position,{fallbackDirection:followerFrame.reference,radiusStud})
  if(!projected.valid)return{valid:false,reason:projected.reason||'continuous-track',match}

  const rawAxisDot=frameA.axis.dot(frameB.axis)
  const bidirectionalAxis=bidirectionalCylinderPairV4(connectorA,connectorB,match)
  const axisPolarity=bidirectionalAxis&&rawAxisDot<0?-1:1
  const axisDot=bidirectionalAxis?Math.abs(rawAxisDot):rawAxisDot
  if(axisDot<limits.minAxisDot){
    return{valid:false,reason:'axis',axisDot,rawAxisDot,axisPolarity,bidirectionalAxis,match,continuousPath:true}
  }
  const valid=projected.captureErrorStud<=limits.maxLateralErrorStud
  return{
    valid,
    reason:valid?'connected-continuous-track-valid':'continuous-track-distance',
    version:CONNECTION_VALIDITY_VERSION_V4,
    axisDot,
    rawAxisDot,
    axisPolarity,
    bidirectionalAxis,
    axialOffsetStud:0,
    lateralErrorStud:projected.captureErrorStud,
    twistErrorRad:0,
    axial:null,
    match,
    continuousPath:true,
    circularTrackRadiusStud:radiusStud,
    circularTrackRadialErrorStud:projected.radialErrorStud,
    circularTrackNormalErrorStud:projected.normalOffsetStud,
  }
}

export function validateConnectedGeometryV4(objectA, connectorA, objectB, connectorB, options = {}) {
  const limits = { ...CONNECTION_VALIDITY_LIMITS_V4, ...options }
  if (!objectA || !objectB || !connectorA || !connectorB) return { valid:false, reason:'missing-endpoint' }
  const match = matchConnectorV4(connectorA, connectorB)
  if (!match.compatible) return { valid:false, reason:`match:${match.reason || 'incompatible'}`, match }

  let frameA, frameB
  try {
    frameA = connectorWorldFrameV4(objectA, connectorA)
    frameB = connectorWorldFrameV4(objectB, connectorB)
  } catch (error) {
    return { valid:false, reason:'world-frame-error', error:String(error?.message || error), match }
  }

  const continuous=validateContinuousTrack(connectorA,connectorB,frameA,frameB,match,limits)
  if(continuous)return continuous

  const freeOrientation = match.kinematicHint === 'spherical' || (match.family === 'generic' && match.editorMotion?.freeOrientation)
  if (freeOrientation) {
    const error = frameA.position.distanceTo(frameB.position)
    return {valid:error<=limits.maxLateralErrorStud, reason:error<=limits.maxLateralErrorStud?'connected-geometry-valid':'center',match,lateralErrorStud:error,axialOffsetStud:0}
  }

  const rawAxisDot = frameA.axis.dot(frameB.axis)
  const bidirectionalAxis = bidirectionalCylinderPairV4(connectorA,connectorB,match)
  const axisPolarity = bidirectionalAxis && rawAxisDot < 0 ? -1 : 1
  const axisDot = bidirectionalAxis ? Math.abs(rawAxisDot) : rawAxisDot
  if (axisDot < limits.minAxisDot) return { valid:false, reason:'axis', axisDot, rawAxisDot, axisPolarity, bidirectionalAxis, match }

  const delta = frameA.position.clone().sub(frameB.position)
  // Keep the canonical B-axis for axial coordinates. Reverse-side entry changes
  // orientation polarity only; stored offsets and occupancy intervals stay stable.
  const axialOffsetStud = delta.dot(frameB.axis)
  const lateral = delta.clone().addScaledVector(frameB.axis, -axialOffsetStud)
  const lateralErrorStud = lateral.length()
  if (lateralErrorStud > limits.maxLateralErrorStud) {
    return { valid:false, reason:'lateral', axisDot, rawAxisDot, axisPolarity, bidirectionalAxis, axialOffsetStud, lateralErrorStud, match }
  }

  let axial = null
  if (['cylinder','clip-cylinder'].includes(match.family)) {
    axial = evaluateAxialOffsetV4(connectorA, connectorB, axialOffsetStud * 20 * (connectorA.gender==='male'?axisPolarity:1))
    if (!axial.valid) {
      return { valid:false, reason:`axial:${axial.reason}`, axisDot, rawAxisDot, axisPolarity, bidirectionalAxis, axialOffsetStud, lateralErrorStud, axial, match }
    }
  }

  if (!['cylinder','clip-cylinder'].includes(match.family) && Math.abs(axialOffsetStud)>limits.maxLateralErrorStud) return {valid:false,reason:'center',match}

  const twistAxis = frameB.axis.clone().multiplyScalar(axisPolarity)
  const twistErrorRad = match.keyed ? keyedTwistError(frameA, frameB, match.rotationalSymmetry, twistAxis) : 0
  if (match.keyed && twistErrorRad > limits.maxKeyedTwistErrorRad) {
    return { valid:false, reason:'keyed-twist', axisDot, rawAxisDot, axisPolarity, bidirectionalAxis, axialOffsetStud, lateralErrorStud, twistErrorRad, axial, match }
  }

  return {
    valid:true,
    reason:'connected-geometry-valid',
    version:CONNECTION_VALIDITY_VERSION_V4,
    axisDot,
    rawAxisDot,
    axisPolarity,
    bidirectionalAxis,
    axialOffsetStud,
    lateralErrorStud,
    twistErrorRad,
    axial,
    match,
  }
}
