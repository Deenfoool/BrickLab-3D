import { mechanicalVariable } from '../core/model.js'

export function linearEquation(id, coefficients, constant = 0, metadata = null) {
  if (!id || !coefficients || typeof coefficients !== 'object') throw new TypeError('Equation requires id and coefficients')
  const normalized = {}
  for (const [variable, coefficient] of Object.entries(coefficients)) {
    if (!Number.isFinite(Number(coefficient))) throw new TypeError(`Invalid coefficient for ${variable}`)
    if (Number(coefficient) !== 0) normalized[String(variable)] = Number(coefficient)
  }
  if (!Number.isFinite(Number(constant))) throw new TypeError('Equation constant must be finite')
  return Object.freeze({
    id:String(id),
    coefficients:Object.freeze(normalized),
    constant:Number(constant),
    metadata,
  })
}

export function driverEquation({
  id,
  bodyId,
  value,
  channel = 'omega',
  source = 'driver',
} = {}) {
  if (!Number.isFinite(value)) throw new TypeError('Driver value must be finite')
  return linearEquation(
    id || `driver:${bodyId}:${channel}`,
    { [mechanicalVariable(bodyId, channel)]:1 },
    value,
    { kind:'driver', source, bodyId, channel },
  )
}

export function rigidRotationEquation({
  id,
  bodyA,
  bodyB,
  channel = 'omega',
} = {}) {
  return linearEquation(
    id || `rigid:${bodyA}:${bodyB}:${channel}`,
    {
      [mechanicalVariable(bodyA, channel)]:1,
      [mechanicalVariable(bodyB, channel)]:-1,
    },
    0,
    { kind:'rigid-rotation', bodyA, bodyB, channel },
  )
}

export function rotationCouplingEquation({
  id,
  bodyA,
  bodyB,
  ratioAB = 1,
  channel = 'omega',
  kind = 'rotation-coupling',
} = {}) {
  if (!(Number.isFinite(Number(ratioAB)) && Math.abs(Number(ratioAB)) > 1e-12)) {
    throw new TypeError('Rotation coupling requires a finite non-zero ratio')
  }
  const ratio = Number(ratioAB)
  return linearEquation(
    id || `rotation-coupling:${bodyA}:${bodyB}`,
    {
      [mechanicalVariable(bodyA, channel)]:-ratio,
      [mechanicalVariable(bodyB, channel)]:1,
    },
    0,
    { kind, bodyA, bodyB, ratioAB:ratio, channel },
  )
}

export function screwLinearEquation({
  id,
  rotaryBody,
  sliderBody,
  leadStudPerTurn,
  directionSign = 1,
  angularChannel = 'omega',
  linearChannel = 'slide',
} = {}) {
  if (!(Number.isFinite(Number(leadStudPerTurn)) && Math.abs(Number(leadStudPerTurn)) > 1e-12)) {
    throw new TypeError('Screw-linear coupling requires finite non-zero leadStudPerTurn')
  }
  const sign = Number(directionSign) < 0 ? -1 : 1
  const studPerRad = sign * Number(leadStudPerTurn) / (Math.PI * 2)
  return linearEquation(
    id || `screw-linear:${rotaryBody}:${sliderBody}`,
    {
      [mechanicalVariable(sliderBody, linearChannel)]:1,
      [mechanicalVariable(rotaryBody, angularChannel)]:-studPerRad,
    },
    0,
    {
      kind:'screw-linear',
      rotaryBody,
      sliderBody,
      leadStudPerTurn:Number(leadStudPerTurn),
      studPerRad,
      directionSign:sign,
      angularChannel,
      linearChannel,
    },
  )
}

export function gearMeshEquation({
  id,
  bodyA,
  bodyB,
  teethA,
  teethB,
  internal = false,
  directionSign = null,
  channel = 'omega',
} = {}) {
  if (!(Number.isFinite(teethA) && teethA > 0 && Number.isFinite(teethB) && teethB > 0)) {
    throw new TypeError('Gear mesh requires positive tooth counts')
  }
  // ratioAB is expressed in each body's own positive rotation axis.
  // Parallel external gears normally use -1; opposite local axis conventions use +1.
  // Internal gears normally use +1.
  const ratioSign = directionSign == null ? (internal ? 1 : -1) : (Number(directionSign) < 0 ? -1 : 1)
  return linearEquation(
    id || `gear:${bodyA}:${bodyB}`,
    {
      [mechanicalVariable(bodyA, channel)]:-ratioSign * Number(teethA),
      [mechanicalVariable(bodyB, channel)]:Number(teethB),
    },
    0,
    {
      kind:internal ? 'internal-gear' : 'external-gear',
      bodyA, bodyB, teethA, teethB, channel,
      directionSign:ratioSign,
      ratioAB:ratioSign * Number(teethA) / Number(teethB),
    },
  )
}

export function differentialEquation({
  id,
  carrier,
  left,
  right,
  carrierRatio = 1,
  leftRatio = 1,
  rightRatio = 1,
  channel = 'omega',
} = {}) {
  for (const [name, value] of Object.entries({ carrierRatio, leftRatio, rightRatio })) {
    if (!(Number.isFinite(value) && value > 0)) throw new TypeError(`${name} must be positive`)
  }
  // Generalized open differential relation:
  // 2*Rc*wc - Rl*wl - Rr*wr = 0.
  return linearEquation(
    id || `differential:${carrier}:${left}:${right}`,
    {
      [mechanicalVariable(carrier, channel)]:2 * Number(carrierRatio),
      [mechanicalVariable(left, channel)]:-Number(leftRatio),
      [mechanicalVariable(right, channel)]:-Number(rightRatio),
    },
    0,
    { kind:'differential', carrier, left, right, carrierRatio, leftRatio, rightRatio, channel },
  )
}

export function packagedDifferentialEquation({
  id,
  input,
  left,
  right,
  ratio=1,
  inputSign=1,
  leftSign=1,
  rightSign=1,
  channel='omega',
}={}){
  if(!(Number.isFinite(Number(ratio))&&Math.abs(Number(ratio))>1e-12)){
    throw new TypeError('Packaged differential requires finite non-zero ratio')
  }
  const r=Number(ratio)
  const si=Number(inputSign)<0?-1:1
  const sl=Number(leftSign)<0?-1:1
  const sr=Number(rightSign)<0?-1:1
  return linearEquation(
    id||`packaged-differential:${input}:${left}:${right}`,
    {
      [mechanicalVariable(input,channel)]:2*r*si,
      [mechanicalVariable(left,channel)]:-sl,
      [mechanicalVariable(right,channel)]:-sr,
    },
    0,
    {
      kind:'packaged-differential',
      input,left,right,ratio:r,
      inputSign:si,leftSign:sl,rightSign:sr,channel,
      relation:'2*ratio*input-left-right=0 in package-port coordinates',
    },
  )
}

export function differentialSpiderEquation({
  id,
  spider,
  carrier = null,
  left,
  right,
  spiderRatio = 1,
  sideRatio = 1,
  directionSign = 1,
  channel = 'omega',
} = {}) {
  if (!(Number.isFinite(spiderRatio) && spiderRatio > 0 &&
        Number.isFinite(sideRatio) && sideRatio > 0)) {
    throw new TypeError('Differential spider ratios must be positive')
  }
  const sign = Number(directionSign) < 0 ? -1 : 1
  // Local spider spin in the carrier frame. For equal 12T gears:
  // 2*S + L - R = 0  =>  S = (R-L)/2.
  return linearEquation(
    id || `differential-spider:${spider}:${left}:${right}`,
    {
      [mechanicalVariable(spider, channel)]:2 * Number(spiderRatio) * sign,
      [mechanicalVariable(left, channel)]:Number(sideRatio),
      [mechanicalVariable(right, channel)]:-Number(sideRatio),
    },
    0,
    {
      kind:'differential-spider-spin',
      spider,carrier,left,right,
      spiderRatio,sideRatio,directionSign:sign,channel,
      frame:'carrier-relative',
    },
  )
}

export function rackPinionEquation({
  id,
  gearBody,
  rackBody,
  pitchRadius,
  angularChannel = 'omega',
  linearChannel = 'slide',
  direction = 1,
} = {}) {
  if (!(Number.isFinite(pitchRadius) && pitchRadius > 0)) throw new TypeError('Rack/pinion requires positive pitchRadius')
  const sign = Number(direction) < 0 ? -1 : 1
  // v_rack = sign * r * omega_gear
  return linearEquation(
    id || `rack-pinion:${gearBody}:${rackBody}`,
    {
      [mechanicalVariable(rackBody, linearChannel)]:1,
      [mechanicalVariable(gearBody, angularChannel)]:-sign * Number(pitchRadius),
    },
    0,
    { kind:'rack-pinion', gearBody, rackBody, pitchRadius, direction:sign },
  )
}
