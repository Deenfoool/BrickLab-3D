import { cloneMechanical, evidence } from '../core/model.js'

const EPS_RADIUS = 0.22
const CORE_RADIUS_LDU = 6
const SHOULDER_RADIUS_LDU = 8
const MIN_PIN_CORE_LENGTH_LDU = 8

const SPECIAL_GROUPS = Object.freeze({
  diffhouse:{kind:'differential-internal-interface',role:'differential-housing'},
  drivingring1:{kind:'driving-ring',role:'axle-joiner-slider',variant:'1'},
  drivingring2:{kind:'driving-ring',role:'axle-joiner-slider',variant:'2'},
  linact1:{kind:'linear-actuator-guide',role:'slider',sizeClass:'small'},
  linact2:{kind:'linear-actuator-guide',role:'slider',sizeClass:'big'},
  linearactbody:{kind:'linear-actuator-guide',role:'cylinder-piston'},
  cylslide:{kind:'linear-guide',role:'cylinder-tube-slide'},
  pneucyl:{kind:'pneumatic-cylinder-guide',role:'pneumatic-extension-guide'},
  steerhold1:{kind:'steering-pivot',role:'steering-holder'},
  steerhub1:{kind:'steering-pivot',role:'steering-hub'},
  techballjnt:{kind:'ball-socket',role:'technic-ball-joint'},
  nudge1:{kind:'ball-socket',role:'nudged-ball-joint',variant:'1'},
  nudge2:{kind:'ball-socket',role:'nudged-ball-joint',variant:'2'},
  unijnt:{kind:'universal-joint-port',role:'universal-joint-connection'},
  techgearrack:{kind:'rack-guide',role:'bendable-rack'},
  techtrntbl60:{kind:'turntable-bearing',role:'turntable-60'},
  turntablepin:{kind:'turntable-bearing',role:'turntable-pin'},
  turntable5x5:{kind:'turntable-bearing',role:'turntable-5x5'},
  z28turntable:{kind:'turntable-bearing',role:'turntable-z28'},
  z56turntablet1:{kind:'turntable-bearing',role:'turntable-z56'},
  wpaxhole:{kind:'wheel-axle-interface',role:'wheel-winged-axle-hole'},
  sglwhlaxle:{kind:'wheel-axle-interface',role:'single-wheel-axle'},
  techwhlcon1:{kind:'wheel-retainer',role:'click-wheel'},
  clkrot:{kind:'click-hinge',role:'click-rotation'},
  techengine:{kind:'engine-slider',role:'engine-cylinder'},
  techflexend:{kind:'flex-system-end',role:'flex-system-end'},
})

const approx = (a, b, eps = EPS_RADIUS) =>
  Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= eps

const rigidShape = section => ['_L', 'L_'].includes(section?.shape) ? 'R' : section?.shape

function normalizedGroup(endpoint) {
  return String(endpoint?.metadata?.group || '')
    .trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function sections(endpoint) {
  return Array.isArray(endpoint?.profile?.sections) ? endpoint.profile.sections : []
}

function slideEnabled(endpoint) {
  return endpoint?.capabilities?.includes?.('slide') === true
}

function cylinderProfile(endpoint) {
  if (endpoint?.family !== 'cylinder') return null
  const values = sections(endpoint)
  if (!values.length) return null

  const shapes = values.map(rigidShape)
  const radii = values.map(section => Number(section.radiusLdu)).filter(Number.isFinite)
  const elastic = values.some(section => section?.elastic === true || ['_L', 'L_'].includes(section?.shape))
  const coreLength = values.reduce((sum, section) =>
    sum + (rigidShape(section) === 'R' && approx(section.radiusLdu, CORE_RADIUS_LDU)
      ? Math.max(0, Number(section.lengthLdu) || 0) : 0), 0)
  const shoulderLength = values.reduce((sum, section) =>
    sum + (rigidShape(section) === 'R' && Number(section.radiusLdu) >= SHOULDER_RADIUS_LDU - EPS_RADIUS
      ? Math.max(0, Number(section.lengthLdu) || 0) : 0), 0)

  return {
    sections:values,
    shapes,
    radii,
    elastic,
    round:shapes.every(shape => shape === 'R'),
    centered:endpoint?.profile?.centered === true,
    caps:String(endpoint?.profile?.caps || 'none').toLowerCase(),
    slide:slideEnabled(endpoint),
    coreLength,
    shoulderLength,
    minRadius:radii.length ? Math.min(...radii) : Infinity,
    maxRadius:radii.length ? Math.max(...radii) : -Infinity,
  }
}

function result(endpoint, semanticKind, {
  confidence = 'strong',
  reason = null,
  properties = {},
} = {}) {
  return Object.freeze({
    semanticKind,
    family:endpoint?.family || 'unknown',
    gender:endpoint?.gender || null,
    group:normalizedGroup(endpoint) || null,
    properties:Object.freeze(cloneMechanical(properties)),
    evidence:evidence({
      source:'mechanics-next:endpoint-shape-semantics',
      confidence,
      reason,
    }),
  })
}

function classifyCylinder(endpoint) {
  const p = cylinderProfile(endpoint)
  if (!p) return result(endpoint, 'cylinder-other', { confidence:'weak', reason:'missing-profile' })

  const plausibleTechnicRadius = p.minRadius >= CORE_RADIUS_LDU - .25 && p.maxRadius <= SHOULDER_RADIUS_LDU + .4
  const axleSections = p.sections.flatMap((section, index) =>
    rigidShape(section) === 'A' && approx(section.radiusLdu, CORE_RADIUS_LDU) ? [index] : [])
  const axleRail = axleSections.length > 0 && p.sections.every((section, index) =>
    (rigidShape(section) === 'A' && approx(section.radiusLdu, CORE_RADIUS_LDU)) ||
    (rigidShape(section) === 'R' && approx(section.radiusLdu, SHOULDER_RADIUS_LDU) &&
      Number(section.lengthLdu) <= 4 && (index < axleSections[0] || index > axleSections.at(-1))))

  if (endpoint.gender === 'male' && p.centered && p.caps === 'none' && p.slide && p.elastic) {
    const hasA = p.shapes.includes('A')
    const hasR = p.shapes.includes('R')
    const axleLength = p.sections.reduce((sum, section) =>
      sum + (rigidShape(section) === 'A' ? Math.max(0, Number(section.lengthLdu) || 0) : 0), 0)
    if (hasA && hasR && p.coreLength >= MIN_PIN_CORE_LENGTH_LDU &&
        axleLength >= MIN_PIN_CORE_LENGTH_LDU && plausibleTechnicRadius) {
      return result(endpoint, 'technic-axle-pin', {
        reason:'mixed-keyed-elastic-profile',
        properties:{ frictionFit:true, pinCoreLengthLdu:p.coreLength, axleLengthLdu:axleLength },
      })
    }
  }

  if (endpoint.gender === 'male' && p.slide && axleRail) {
    return result(endpoint, 'technic-axle', {
      reason:'sliding-keyed-A6-profile',
      properties:{ keyed:true, intervalOccupancy:true },
    })
  }

  const allA6 = p.sections.length > 0 &&
    p.sections.every(section => rigidShape(section) === 'A' && approx(section.radiusLdu, CORE_RADIUS_LDU))
  if (endpoint.gender === 'female' && p.slide && allA6) {
    return result(endpoint, 'technic-axle-hole', {
      reason:'sliding-keyed-A6-receiver',
      properties:{ keyed:true, intervalOccupancy:true },
    })
  }

  if (p.round && plausibleTechnicRadius) {
    if (endpoint.gender === 'male' && p.elastic && p.coreLength >= MIN_PIN_CORE_LENGTH_LDU) {
      return result(endpoint, 'technic-pin', {
        reason:'elastic-R6-pin-profile',
        properties:{
          frictionFit:true,
          coreLengthLdu:p.coreLength,
          shoulderLengthLdu:p.shoulderLength,
          intervalOccupancy:true,
        },
      })
    }
    if (endpoint.gender === 'female' && p.slide && p.centered && p.caps === 'none' &&
        p.coreLength >= MIN_PIN_CORE_LENGTH_LDU && p.shoulderLength > 0) {
      return result(endpoint, 'technic-pin-hole', {
        reason:'centered-R6-R8-receiver',
        properties:{
          throatLengthLdu:p.coreLength,
          shoulderLengthLdu:p.shoulderLength,
          intervalOccupancy:true,
        },
      })
    }
  }

  if (endpoint.gender === 'female' && p.slide && p.round &&
      p.sections.some(section => approx(section.radiusLdu, CORE_RADIUS_LDU))) {
    return result(endpoint, 'technic-round-hole', {
      reason:'sliding-round-R6-bore',
      properties:{ keyed:false, intervalOccupancy:true },
    })
  }

  const allR4 = p.sections.length > 0 &&
    p.sections.every(section => rigidShape(section) === 'R' && approx(section.radiusLdu, 4))
  if (allR4 && endpoint.gender === 'male') {
    return result(endpoint, 'bar', {
      reason:'round-R4-male-profile',
      properties:{ intervalOccupancy:true, slide:p.slide },
    })
  }
  if (allR4 && endpoint.gender === 'female') {
    return result(endpoint, 'bar-hole', {
      reason:'round-R4-female-profile',
      properties:{ intervalOccupancy:true, slide:p.slide },
    })
  }

  if (endpoint.gender === 'male' && !p.slide && p.sections.length === 1 &&
      p.shapes[0] === 'R' && approx(p.sections[0].radiusLdu, 6) &&
      approx(p.sections[0].lengthLdu, 4, .3) && p.caps === 'one') {
    return result(endpoint, 'stud', { reason:'R6x4-one-cap-male' })
  }

  if (endpoint.gender === 'female' && !p.slide && p.sections.length === 1 &&
      ['R', 'S'].includes(p.shapes[0]) && approx(p.sections[0].radiusLdu, 6) && p.caps === 'one') {
    return result(endpoint, 'anti-stud', { reason:'R6/S6-one-cap-female' })
  }

  return result(endpoint, 'cylinder-other', { confidence:'inferred', reason:'unclassified-cylinder-profile' })
}

export function classifyEndpointSemantics(endpoint) {
  if (!endpoint) return null

  const builtinType=String(endpoint?.metadata?.builtinType||'').toLowerCase()
  if(builtinType==='slider'||builtinType==='slider-rail'){
    return result(endpoint,'linear-guide',{
      confidence:'verified',
      reason:`builtin-${builtinType}`,
      properties:{builtinType},
    })
  }

  const group = normalizedGroup(endpoint)
  if (SPECIAL_GROUPS[group]) {
    const special=SPECIAL_GROUPS[group]
    return result(endpoint, special.kind, {
      confidence:'strong',
      reason:`ldcad-special-group:${group}`,
      properties:{ group, ...special },
    })
  }
  if (/^rim\d{2,}$/.test(group)) {
    return result(endpoint, 'rim-tire-interface', {
      confidence:'strong',
      reason:'encoded-rim-fit-group',
      properties:{ sizeKey:group },
    })
  }

  if (endpoint.family === 'cylinder') return classifyCylinder(endpoint)
  if (endpoint.family === 'clip') return result(endpoint, 'clip', { reason:'clip-family' })
  if (endpoint.family === 'fingers') return result(endpoint, 'hinge-fingers', { reason:'finger-family' })
  if (endpoint.family === 'sphere') {
    return result(endpoint, endpoint.gender === 'male' ? 'ball' : 'socket', { reason:'sphere-family' })
  }
  if (endpoint.family === 'generic') {
    return result(endpoint, 'generic-interface', {
      confidence:'inferred',
      reason:'generic-connector-family',
      properties:{ group:group || null },
    })
  }
  return result(endpoint, 'unknown-interface', { confidence:'unknown', reason:'unsupported-family' })
}

export function enrichEndpointSemantics(endpoint) {
  const semantics = classifyEndpointSemantics(endpoint)
  return Object.freeze({
    ...endpoint,
    metadata:Object.freeze({
      ...(endpoint.metadata || {}),
      semantics,
    }),
  })
}

export function endpointSemanticKind(endpoint) {
  return endpoint?.metadata?.semantics?.semanticKind || classifyEndpointSemantics(endpoint)?.semanticKind || 'unknown-interface'
}
