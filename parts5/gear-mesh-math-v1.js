import * as THREE from 'three'

export const GEAR_MESH_MATH_VERSION = 'gear-mesh-math-v3.1'
export const GEAR_MESH_CLEARANCE_STUD = Object.freeze({ spur:0.018, bevel:0.100 })

function stablePerpendicular(axis) {
  const basis = Math.abs(axis.y) < 0.82 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  return basis.sub(axis.clone().multiplyScalar(basis.dot(axis))).normalize()
}

function normalizedAxis(value) { return value.clone().normalize() }
function positiveModulo(value, period) { return ((value % period) + period) % period }
function wrapPeriod(value, period) { return positiveModulo(value + period / 2, period) - period / 2 }
function meshClearance(kind,options={}) {
  const explicit=Number(options.clearanceStud ?? options.meshClearanceStud)
  return Number.isFinite(explicit) ? Math.max(0,explicit) : (GEAR_MESH_CLEARANCE_STUD[kind] ?? 0)
}

function signedAngleAround(from, to, axis) {
  const a = from.clone().projectOnPlane(axis)
  const b = to.clone().projectOnPlane(axis)
  if (a.lengthSq() < 1e-10 || b.lengthSq() < 1e-10) return 0
  a.normalize(); b.normalize()
  return Math.atan2(axis.dot(a.clone().cross(b)), THREE.MathUtils.clamp(a.dot(b), -1, 1))
}

export function solveSpurPhaseAlignment(moving, fixed, radialDirection) {
  if (!(moving?.teeth > 0) || !(fixed?.teeth > 0) || !moving.reference || !fixed.reference) return null
  const fixedAxis = normalizedAxis(fixed.axis)
  const movingAxisRaw = normalizedAxis(moving.axis)
  const movingPhaseAxis = movingAxisRaw.dot(fixedAxis) >= 0 ? movingAxisRaw : movingAxisRaw.multiplyScalar(-1)
  const radial = radialDirection.clone().projectOnPlane(fixedAxis)
  if (radial.lengthSq() < 1e-10) return null
  radial.normalize()
  const fixedPeriod = Math.PI * 2 / fixed.teeth
  const movingPeriod = Math.PI * 2 / moving.teeth
  const fixedAngle = signedAngleAround(fixed.reference, radial, fixedAxis)
  const movingContact = radial.clone().multiplyScalar(-1)
  const movingAngle = signedAngleAround(moving.reference, movingContact, movingPhaseAxis)
  const fixedPhase = positiveModulo(fixedAngle, fixedPeriod) / fixedPeriod
  const desiredMovingPhase = positiveModulo(0.5 - fixedPhase, 1)
  const desiredMovingAngle = desiredMovingPhase * movingPeriod
  const correction = wrapPeriod(movingAngle - desiredMovingAngle, movingPeriod)
  return { correction,axis:movingPhaseAxis,fixedPhase,movingPhaseBefore:positiveModulo(movingAngle,movingPeriod)/movingPeriod,movingPhaseAfter:desiredMovingPhase,toothPitchRadians:movingPeriod }
}

export function evaluateSpurMesh(a, b, options = {}) {
  const axisA=normalizedAxis(a.axis),axisB=normalizedAxis(b.axis)
  const axisDot=axisA.dot(axisB),axisAlignment=Math.abs(axisDot)
  const minAlignment=options.minAlignment ?? options.axisTolerance ?? 0.985
  const delta=b.center.clone().sub(a.center)
  const axialOffset=Math.abs(delta.dot(axisA))
  const radialVector=delta.clone().sub(axisA.clone().multiplyScalar(delta.dot(axisA)))
  const centerDistance=radialVector.length()
  const clearanceStud=meshClearance('spur',options)
  const rawPitchDistance=a.pitchRadius+b.pitchRadius
  const targetDistance=rawPitchDistance+clearanceStud
  const distanceError=Math.abs(centerDistance-targetDistance)
  const axialTolerance=options.axialTolerance ?? 0.16
  const distanceTolerance=options.distanceTolerance ?? 0.08
  return {kind:'spur',axisDot,axisAlignment,axialOffset,centerDistance,targetDistance,rawPitchDistance,clearanceStud,distanceError,radialVector,compatibleAxes:axisAlignment>=minAlignment,valid:axisAlignment>=minAlignment&&axialOffset<=axialTolerance&&distanceError<=distanceTolerance}
}

export function solveSpurSnap(moving, fixed, options = {}) {
  const axisA=normalizedAxis(moving.axis),axisB=normalizedAxis(fixed.axis)
  const axisAlignment=Math.abs(axisA.dot(axisB)),minAlignment=options.minAlignment ?? 0.965
  if(axisAlignment<minAlignment)return null
  const clearanceStud=meshClearance('spur',options)
  const rawPitchDistance=moving.pitchRadius+fixed.pitchRadius
  const targetDistance=rawPitchDistance+clearanceStud
  const delta=moving.center.clone().sub(fixed.center)
  let radial=delta.clone().sub(axisB.clone().multiplyScalar(delta.dot(axisB)))
  if(radial.lengthSq()<1e-8)radial=stablePerpendicular(axisB);else radial.normalize()
  const desiredCenter=fixed.center.clone().addScaledVector(radial,targetDistance)
  const translation=desiredCenter.clone().sub(moving.center),error=translation.length()
  const captureDistance=options.captureDistance ?? Math.max(0.24,Math.min(0.48,targetDistance*0.22))
  if(error>captureDistance)return null
  const contactPoint=fixed.center.clone().addScaledVector(radial,fixed.pitchRadius+clearanceStud*.5)
  const phase=solveSpurPhaseAlignment(moving,fixed,radial)
  return {kind:'spur',desiredCenter,translation,error,captureDistance,axisAlignment,targetDistance,rawPitchDistance,clearanceStud,contactPoint,radialDirection:radial,phaseCorrection:phase?.correction??0,phaseAxis:phase?.axis??axisA,phase}
}

export function evaluateBevelMesh(a, b, options = {}) {
  const axisA=normalizedAxis(a.axis),axisB=normalizedAxis(b.axis)
  const axisDot=axisA.dot(axisB),axisOrthogonality=Math.abs(axisDot)
  const maxAxisDot=options.maxAxisDot ?? options.bevelAxisDotTolerance ?? 0.12
  const clearanceStud=meshClearance('bevel',options)
  const legA=b.pitchRadius+clearanceStud
  const legB=a.pitchRadius+clearanceStud
  let best=null
  for(const signA of [-1,1]){
    const apexA=a.center.clone().addScaledVector(axisA,signA*legA)
    for(const signB of [-1,1]){
      const apexB=b.center.clone().addScaledVector(axisB,signB*legB)
      const apexError=apexA.distanceTo(apexB)
      if(!best||apexError<best.apexError)best={signA,signB,apexA,apexB,apexError}
    }
  }
  const tolerance=options.apexTolerance ?? options.bevelApexTolerance ?? 0.08
  const rawPitchDistance=Math.hypot(a.pitchRadius,b.pitchRadius)
  const targetDistance=Math.hypot(legA,legB)
  return {kind:'bevel',axisDot,axisOrthogonality,targetDistance,rawPitchDistance,clearanceStud,centerDistance:a.center.distanceTo(b.center),...best,compatibleAxes:axisOrthogonality<=maxAxisDot,valid:axisOrthogonality<=maxAxisDot&&Boolean(best)&&best.apexError<=tolerance}
}

export function solveBevelSnap(moving, fixed, options = {}) {
  const axisA=normalizedAxis(moving.axis),axisB=normalizedAxis(fixed.axis)
  const axisOrthogonality=Math.abs(axisA.dot(axisB)),maxAxisDot=options.maxAxisDot ?? 0.18
  if(axisOrthogonality>maxAxisDot)return null
  const clearanceStud=meshClearance('bevel',options)
  const fixedLeg=moving.pitchRadius+clearanceStud
  const movingLeg=fixed.pitchRadius+clearanceStud
  let best=null
  for(const signA of [-1,1])for(const signB of [-1,1]){
    const apex=fixed.center.clone().addScaledVector(axisB,signB*fixedLeg)
    const desiredCenter=apex.clone().addScaledVector(axisA,-signA*movingLeg)
    const translation=desiredCenter.clone().sub(moving.center),error=translation.length()
    if(!best||error<best.error)best={signA,signB,apex,desiredCenter,translation,error}
  }
  const rawPitchDistance=Math.hypot(moving.pitchRadius,fixed.pitchRadius)
  const targetDistance=Math.hypot(fixedLeg,movingLeg)
  const captureDistance=options.captureDistance ?? Math.max(0.28,Math.min(0.62,targetDistance*0.24+clearanceStud))
  if(!best||best.error>captureDistance)return null
  return {kind:'bevel',...best,captureDistance,axisOrthogonality,targetDistance,rawPitchDistance,clearanceStud,contactPoint:best.apex.clone()}
}
