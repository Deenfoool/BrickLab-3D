export const COMPOUND_KINEMATICS_VERSION='mechanics-compound-kinematics-0.1.0'
const EPS=1e-10
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v))

export function universalJointOutputAngle(inputAngleRad,bendAngleRad,{
  phaseOffsetRad=0,
  outputPhaseOffsetRad=0,
}={}){
  const theta=Number(inputAngleRad)+Number(phaseOffsetRad||0)
  const beta=Math.abs(Number(bendAngleRad)||0)
  if(beta>=Math.PI/2-1e-6)throw new RangeError('Universal joint bend approaches singularity')
  const c=Math.cos(beta)
  // atan2 keeps the correct quadrant: tan(phi)=cos(beta)*tan(theta).
  const phi=Math.atan2(c*Math.sin(theta),Math.cos(theta))
  return phi-Number(outputPhaseOffsetRad||0)
}

export function universalJointInstantaneousRatio(inputAngleRad,bendAngleRad){
  const theta=Number(inputAngleRad)
  const beta=Math.abs(Number(bendAngleRad)||0)
  if(beta>=Math.PI/2-1e-6)return Number.NaN
  const c=Math.cos(beta)
  const denominator=1-(Math.sin(beta)**2)*(Math.sin(theta)**2)
  return Math.abs(denominator)>EPS?c/denominator:Number.NaN
}

export function universalJointState({
  inputAngleRad,
  inputOmega=0,
  bendAngleRad,
  phaseOffsetRad=0,
  outputPhaseOffsetRad=0,
  maxBendAngleRad=null,
}={}){
  const beta=Math.abs(Number(bendAngleRad)||0)
  const limit=Number(maxBendAngleRad)
  const withinLimit=!Number.isFinite(limit)||beta<=limit+1e-9
  const outputAngleRad=universalJointOutputAngle(inputAngleRad,beta,{
    phaseOffsetRad,
    outputPhaseOffsetRad,
  })
  const instantaneousRatio=universalJointInstantaneousRatio(
    Number(inputAngleRad)+Number(phaseOffsetRad||0),
    beta,
  )
  return Object.freeze({
    valid:withinLimit&&Number.isFinite(instantaneousRatio),
    withinLimit,
    bendAngleRad:beta,
    inputAngleRad:Number(inputAngleRad),
    outputAngleRad,
    instantaneousRatio,
    outputOmega:Number(inputOmega)*instantaneousRatio,
  })
}

export function cvJointState({
  inputAngleRad,
  inputOmega=0,
  phaseOffsetRad=0,
  directionSign=1,
  bendAngleRad=0,
  maxBendAngleRad=null,
}={}){
  const sign=Number(directionSign)<0?-1:1
  const beta=Math.abs(Number(bendAngleRad)||0)
  const limit=Number(maxBendAngleRad)
  const withinLimit=!Number.isFinite(limit)||beta<=limit+1e-9
  return Object.freeze({
    valid:withinLimit,
    withinLimit,
    bendAngleRad:beta,
    inputAngleRad:Number(inputAngleRad),
    outputAngleRad:sign*(Number(inputAngleRad)+Number(phaseOffsetRad||0)),
    instantaneousRatio:sign,
    outputOmega:sign*Number(inputOmega),
  })
}

export function screwDisplacementFromAngle(angleRad,leadStudPerTurn,{
  directionSign=1,
  zeroOffsetStud=0,
  minStud=null,
  maxStud=null,
}={}){
  const lead=Number(leadStudPerTurn)
  if(!(Number.isFinite(lead)&&Math.abs(lead)>EPS))throw new TypeError('Finite non-zero screw lead is required')
  const sign=Number(directionSign)<0?-1:1
  const raw=Number(zeroOffsetStud||0)+sign*Number(angleRad)*lead/(Math.PI*2)
  const min=Number(minStud),max=Number(maxStud)
  const bounded=Number.isFinite(min)||Number.isFinite(max)
    ?clamp(raw,Number.isFinite(min)?min:-Infinity,Number.isFinite(max)?max:Infinity)
    :raw
  return Object.freeze({
    rawStud:raw,
    displacementStud:bounded,
    saturated:Math.abs(raw-bounded)>1e-10,
  })
}

export function springDamperForce({
  displacementStud,
  velocityStudPerSecond=0,
  restDisplacementStud=0,
  stiffness,
  damping=0,
  preload=0,
}={}){
  const k=Number(stiffness),c=Number(damping)
  if(!(Number.isFinite(k)&&k>=0))throw new TypeError('Spring stiffness must be finite and non-negative')
  if(!(Number.isFinite(c)&&c>=0))throw new TypeError('Spring damping must be finite and non-negative')
  const compression=Number(displacementStud)-Number(restDisplacementStud||0)
  const spring=-k*compression
  const damper=-c*Number(velocityStudPerSecond||0)
  return Object.freeze({
    compressionStud:compression,
    springForce:spring,
    dampingForce:damper,
    preload:Number(preload||0),
    force:spring+damper+Number(preload||0),
  })
}

export function clutchTorqueState({
  engaged,
  inputOmega=0,
  outputOmega=0,
  maxTorque=Infinity,
  slipStiffness=0,
}={}){
  const relativeOmega=Number(inputOmega)-Number(outputOmega)
  if(!engaged)return Object.freeze({
    engaged:false,
    locked:false,
    slipping:false,
    relativeOmega,
    torque:0,
  })
  const requested=-Number(slipStiffness||0)*relativeOmega
  const limit=Math.abs(Number(maxTorque))
  const finiteLimit=Number.isFinite(limit)
  const torque=finiteLimit?clamp(requested,-limit,limit):requested
  return Object.freeze({
    engaged:true,
    locked:Math.abs(relativeOmega)<=1e-9,
    slipping:Math.abs(relativeOmega)>1e-9&&finiteLimit&&Math.abs(requested)>limit,
    relativeOmega,
    torque,
  })
}
