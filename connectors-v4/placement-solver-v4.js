import * as THREE from 'three'
import { matchConnectorV4 } from './matcher-v4.js'
import { nearestAxialOffsetV4, evaluateAxialOffsetV4 } from './axial-fit-v4.js'

export const PLACEMENT_SOLVER_VERSION_V4 = 'placement-solver-v4.2.1'
const EPS = 1e-8

function matrixFromConnector(connector) {
  const p = connector?.frame?.positionStud
  const o = connector?.frame?.orientationBrickLab
  if (!Array.isArray(p) || p.length !== 3 || !Array.isArray(o) || o.length !== 9) {
    throw new TypeError('V4 connector must be converted to BrickLab coordinates before placement solving')
  }
  return new THREE.Matrix4().set(
    o[0],o[1],o[2],p[0],
    o[3],o[4],o[5],p[1],
    o[6],o[7],o[8],p[2],
    0,0,0,1,
  )
}

function frameFromWorldMatrix(matrix) {
  const position = new THREE.Vector3().setFromMatrixPosition(matrix)
  const rotation = new THREE.Quaternion().setFromRotationMatrix(matrix)
  const axis = new THREE.Vector3(0,-1,0).transformDirection(matrix).normalize()
  const reference = new THREE.Vector3(1,0,0).transformDirection(matrix).normalize()
  return { position, rotation, axis, reference, matrix }
}

export function connectorWorldFrameV4(object, connector) {
  if (!object?.matrixWorld) throw new TypeError('A Three.js object is required')
  object.updateWorldMatrix?.(true,false)
  const e = object.matrixWorld.elements
  const axes = [new THREE.Vector3(e[0],e[1],e[2]),new THREE.Vector3(e[4],e[5],e[6]),new THREE.Vector3(e[8],e[9],e[10])]
  if (axes.some(a=>Math.abs(a.length()-1)>1e-5) || Math.abs(axes[0].dot(axes[1]))>1e-5 || Math.abs(axes[0].dot(axes[2]))>1e-5 || Math.abs(axes[1].dot(axes[2]))>1e-5 || object.matrixWorld.determinant()<0) throw new Error('V4 requires rigid unit-scale object transforms')
  const matrix = object.matrixWorld.clone().multiply(matrixFromConnector(connector))
  return frameFromWorldMatrix(matrix)
}

function signedAngleAround(from, to, axis) {
  const a = from.clone().projectOnPlane(axis)
  const b = to.clone().projectOnPlane(axis)
  if (a.lengthSq() < EPS || b.lengthSq() < EPS) return 0
  a.normalize(); b.normalize()
  const cross = a.clone().cross(b)
  return Math.atan2(axis.dot(cross), THREE.MathUtils.clamp(a.dot(b),-1,1))
}

export function objectWorldPoseV4(object) {
  object.updateWorldMatrix?.(true,false)
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  object.matrixWorld.decompose(position,quaternion,scale)
  return { position, quaternion, scale }
}

function nearestKeyedCorrection(angle, symmetry) {
  if (!Number.isFinite(symmetry) || symmetry <= 1) return angle
  const step = Math.PI * 2 / symmetry
  return angle - Math.round(angle / step) * step
}

function fullOrientationCorrection(sourceReference, targetReference, axis, match) {
  const raw = signedAngleAround(sourceReference,targetReference,axis)
  if (match?.keyed) return nearestKeyedCorrection(raw, match.rotationalSymmetry)
  if (match?.editorMotion?.freeTwist) return 0
  return raw
}

function toParentLocalPose(object, worldPosition, worldQuaternion) {
  if (!object.parent) return { position:worldPosition.clone(), quaternion:worldQuaternion.clone() }
  object.parent.updateWorldMatrix?.(true,false)
  const parentPosition = new THREE.Vector3()
  const parentQuaternion = new THREE.Quaternion()
  const parentScale = new THREE.Vector3()
  object.parent.matrixWorld.decompose(parentPosition,parentQuaternion,parentScale)
  if (Math.abs(parentScale.x-parentScale.y) > 1e-6 || Math.abs(parentScale.x-parentScale.z) > 1e-6) {
    throw new Error('Connector V4 placement does not support non-uniformly scaled parents')
  }
  const localPosition = worldPosition.clone().sub(parentPosition).applyQuaternion(parentQuaternion.clone().invert())
  const scalar = Math.abs(parentScale.x) > EPS ? parentScale.x : 1
  localPosition.multiplyScalar(1/scalar)
  const localQuaternion = parentQuaternion.clone().invert().multiply(worldQuaternion)
  return { position:localPosition, quaternion:localQuaternion }
}

function solveAxialOffset(movingConnector,targetConnector,match,movingFrame,targetFrame,options) {
  if (!['cylinder','clip-cylinder'].includes(match.family)) return { offsetStud:0, offsetLdu:0, clamped:false, windows:null, fit:null }
  if (!match.editorMotion?.axialSlide) {
    const fit = evaluateAxialOffsetV4(movingConnector,targetConnector,0)
    return {offsetStud:0,offsetLdu:0,clamped:false,rejected:!fit.valid,fit}
  }
  const requestedStud = Number.isFinite(options.axialOffsetStud)
    ? options.axialOffsetStud
    : movingFrame.position.clone().sub(targetFrame.position).dot(targetFrame.axis)
  const windows = nearestAxialOffsetV4(movingConnector,targetConnector,requestedStud*20)
  if (!windows.valid || windows.offsetLdu == null) return { offsetStud:0, offsetLdu:0, clamped:true, windows, fit:null, rejected:true }
  const fit = evaluateAxialOffsetV4(movingConnector,targetConnector,windows.offsetLdu)
  if (!fit.valid) return { offsetStud:0, offsetLdu:0, clamped:true, windows, fit, rejected:true }
  return { offsetStud:windows.offsetLdu/20, offsetLdu:windows.offsetLdu, clamped:windows.clamped, windows, fit, rejected:false }
}

function movingPlacementMode(connector, match) {
  const explicit = String(connector?.snap?.placement || '').toLowerCase()
  if (explicit === 'retain' || explicit === 'free') return explicit
  if (connector?.family === 'sphere' || match?.kinematicHint === 'spherical') return 'free'
  return 'aligned'
}

export function solvePlacementV4(movingObject,movingConnector,targetObject,targetConnector,options={}) {
  const match = options.match ?? matchConnectorV4(movingConnector,targetConnector)
  if (!match?.compatible) return { valid:false, reason:match?.reason || 'incompatible', match }

  const movingFrame = options.movingFrame ?? connectorWorldFrameV4(movingObject,movingConnector)
  const targetFrame = options.targetFrame ?? connectorWorldFrameV4(targetObject,targetConnector)
  const movingPose = options.movingPose ?? objectWorldPoseV4(movingObject)
  const initialDelta = movingFrame.position.clone().sub(targetFrame.position)
  const initialAxialSeparationStud = initialDelta.dot(targetFrame.axis)
  const initialLateralDistanceStud = initialDelta.clone().addScaledVector(targetFrame.axis,-initialAxialSeparationStud).length()
  const initialConnectorDistanceStud = initialDelta.length()

  let desiredQuaternion = movingPose.quaternion.clone()
  let rotationDelta = new THREE.Quaternion()
  const placementMode = movingPlacementMode(movingConnector,match)
  const preserveMovingOrientation = placementMode === 'retain' || placementMode === 'free'

  if (!preserveMovingOrientation) {
    const axisAlign = new THREE.Quaternion().setFromUnitVectors(movingFrame.axis,targetFrame.axis)
    desiredQuaternion = axisAlign.clone().multiply(desiredQuaternion)
    rotationDelta.copy(axisAlign)

    const alignedReference = movingFrame.reference.clone().applyQuaternion(axisAlign)
    const correctionAngle = fullOrientationCorrection(alignedReference,targetFrame.reference,targetFrame.axis,match)
    if (Math.abs(correctionAngle) > 1e-9) {
      const twist = new THREE.Quaternion().setFromAxisAngle(targetFrame.axis,correctionAngle)
      desiredQuaternion = twist.clone().multiply(desiredQuaternion)
      rotationDelta = twist.clone().multiply(rotationDelta)
    }
  }

  const axial = solveAxialOffset(movingConnector,targetConnector,match,movingFrame,targetFrame,options)
  if (axial.rejected) return { valid:false, reason:'axial-profile-no-fit', match, axial }

  const objectOrigin = movingPose.position
  const sourceOffset = movingFrame.position.clone().sub(objectOrigin).applyQuaternion(rotationDelta)
  const desiredConnectorPosition = targetFrame.position.clone().addScaledVector(targetFrame.axis,axial.offsetStud)
  const desiredWorldPosition = desiredConnectorPosition.clone().sub(sourceOffset)
  const localPose = toParentLocalPose(movingObject,desiredWorldPosition,desiredQuaternion)
  const captureCorrectionStud = movingFrame.position.distanceTo(desiredConnectorPosition)

  return {
    valid:true,
    reason:'solved',
    solverVersion:PLACEMENT_SOLVER_VERSION_V4,
    match,
    axial,
    placementMode,
    preserveMovingOrientation,
    targetAxisWorld:targetFrame.axis.toArray(),
    targetPositionWorld:targetFrame.position.toArray(),
    desiredConnectorPositionWorld:desiredConnectorPosition.toArray(),
    worldPosition:desiredWorldPosition.toArray(),
    worldQuaternion:desiredQuaternion.toArray(),
    localPosition:localPose.position.toArray(),
    localQuaternion:localPose.quaternion.toArray(),
    diagnostics:{
      initialAxisDot:movingFrame.axis.dot(targetFrame.axis),
      initialConnectorDistanceStud,
      initialLateralDistanceStud,
      initialAxialSeparationStud,
      captureCorrectionStud,
      translationStud:movingPose.position.distanceTo(desiredWorldPosition),
      rotationRad:2*Math.acos(THREE.MathUtils.clamp(Math.abs(rotationDelta.w),-1,1)),
      engagementLdu:axial.fit?.engagementLdu ?? 0,
    },
  }
}

export function applyPlacementV4(object,solution) {
  if (!solution?.valid) throw new TypeError('A valid Connector V4 placement solution is required')
  object.position.fromArray(solution.localPosition)
  object.quaternion.fromArray(solution.localQuaternion).normalize()
  object.updateMatrixWorld?.(true)
  return object
}
