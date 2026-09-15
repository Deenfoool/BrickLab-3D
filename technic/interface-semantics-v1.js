import { classifyConnectorV4 } from '../connectors-v4/activation-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { technicPinPairV4 } from '../connectors-v4/pin-semantics-v4.js'

export const TECHNIC_INTERFACE_SEMANTICS_VERSION = 'technic-interface-semantics-v1.1.0'

const SPECIAL_GROUPS = Object.freeze({
  diffhouse: { kind:'differential-housing', role:'differential-internal-interface', constraint:'special', transmission:'differential' },
  drivingring1: { kind:'driving-ring', role:'shiftable-rotary-coupler', constraint:'prismatic', transmission:'driving-ring', torque:'conditional' },
  drivingring2: { kind:'driving-ring', role:'shiftable-rotary-coupler', constraint:'prismatic', transmission:'driving-ring', torque:'conditional' },
  linact1: { kind:'linear-actuator-guide', role:'linear-slider', constraint:'prismatic', transmission:'screw-linear' },
  linact2: { kind:'linear-actuator-guide', role:'linear-slider', constraint:'prismatic', transmission:'screw-linear' },
  linearactbody: { kind:'linear-actuator-guide', role:'linear-slider', constraint:'prismatic', transmission:'screw-linear' },
  cylslide: { kind:'linear-guide', role:'linear-slider', constraint:'prismatic' },
  pneucyl: { kind:'pneumatic-cylinder-guide', role:'linear-slider', constraint:'prismatic', transmission:'pneumatic-linear' },
  steerhold1: { kind:'steering-pivot', role:'steering-holder', constraint:'revolute' },
  steerhub1: { kind:'steering-pivot', role:'steering-hub', constraint:'revolute' },
  techballjnt: { kind:'ball-joint', role:'ball-socket', constraint:'spherical' },
  nudge1: { kind:'ball-joint', role:'nudged-ball-socket', constraint:'spherical' },
  nudge2: { kind:'ball-joint', role:'nudged-ball-socket', constraint:'spherical' },
  unijnt: { kind:'universal-joint-port', role:'universal-joint', constraint:'special', transmission:'universal-joint', torque:true },
  techgearrack: { kind:'rack-guide', role:'gear-rack-guide', constraint:'prismatic', transmission:'rack-pinion' },
  techtrntbl60: { kind:'turntable', role:'retained-revolute-bearing', constraint:'revolute' },
  turntablepin: { kind:'turntable', role:'retained-revolute-bearing', constraint:'revolute' },
  turntable5x5: { kind:'turntable', role:'retained-revolute-bearing', constraint:'revolute' },
  z28turntable: { kind:'turntable', role:'retained-revolute-bearing', constraint:'revolute' },
  z56turntablet1: { kind:'turntable', role:'retained-revolute-bearing', constraint:'revolute' },
  wpaxhole: { kind:'wheel-axle-interface', role:'wheel-shaft-coupling', constraint:'prismatic', torque:true },
  sglwhlaxle: { kind:'wheel-axle-interface', role:'wheel-shaft-coupling', constraint:'prismatic', torque:true },
  techwhlcon1: { kind:'wheel-retainer', role:'wheel-click-connection', constraint:'revolute' },
  clkrot: { kind:'indexed-revolute', role:'click-rotation-connection', constraint:'revolute' },
  techengine: { kind:'engine-slider', role:'piston-cylinder-guide', constraint:'prismatic', transmission:'piston-crank' },
  techfigelbw: { kind:'technic-figure-joint', role:'technic-figure-elbow', constraint:'revolute' },
  techfigfoot: { kind:'technic-figure-joint', role:'technic-figure-foot', constraint:'revolute' },
  techfighips: { kind:'technic-figure-joint', role:'technic-figure-hips', constraint:'revolute' },
  techfigknee: { kind:'technic-figure-joint', role:'technic-figure-knee', constraint:'revolute' },
  techfigpel: { kind:'technic-figure-joint', role:'technic-figure-pelvis', constraint:'revolute' },
  techfigvis: { kind:'technic-figure-clip', role:'technic-figure-visor', constraint:'revolute' },
  bumper: { kind:'technic-structural-special', role:'bumper-connection', constraint:'fixed' },
  cranearmw16: { kind:'technic-structural-special', role:'crane-arm-joint', constraint:'fixed' },
  cranearmw20: { kind:'technic-structural-special', role:'crane-arm-joint', constraint:'fixed' },
  techflexend: { kind:'flex-system-end', role:'flexible-end', constraint:'special' },
})

function normalizedGroup(connector) {
  return String(connector?.group || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function dynamicSpecialGroup(group) {
  // LDCad encodes tyre/rim fit dimensions in groups such as rim42_31. Normalizing
  // punctuation yields rim4231. We deliberately retain it as a sizing key instead of
  // trying to infer physical dimensions from the mesh.
  if (/^rim\d{2,}$/.test(group)) return { kind:'rim-tire-interface', role:'rim-size-fit', constraint:'fixed-size-fit', groupKey:group }
  return null
}

function specialGroup(connector) {
  const group=normalizedGroup(connector)
  return SPECIAL_GROUPS[group] || dynamicSpecialGroup(group)
}

function roleFromConnector(connector) {
  const role = classifyConnectorV4(connector)
  if (role === 'technic-axle') return 'technic-axle'
  if (role === 'technic-axle-hole') return 'technic-axle-hole'
  if (role === 'technic-round-hole' || role === 'technic-pin-hole') return role
  if (role === 'technic-pin') return 'technic-pin'
  if (connector?.family === 'sphere') return connector.gender === 'male' ? 'technic-ball' : 'technic-ball-socket'
  if (connector?.family === 'fingers') return 'technic-hinge'
  const special = specialGroup(connector)
  if (special) return special.kind
  return role || connector?.family || 'unknown'
}

function semantics(kind, extra = {}) {
  return Object.freeze({
    version:TECHNIC_INTERFACE_SEMANTICS_VERSION,
    kind,
    confidence:'geometry-and-shadow',
    ...extra,
  })
}

export function classifyTechnicEndpointV1(connector) {
  if (!connector) return semantics('unknown', { role:'unknown', group:null })
  const role = roleFromConnector(connector)
  const special = specialGroup(connector)
  return semantics(role, {
    role:special?.role || role,
    group:normalizedGroup(connector) || null,
    family:connector.family || null,
    gender:connector.gender || null,
    special:special ? { ...special } : null,
  })
}

function semanticFromActivationFamily(family, a, b, match) {
  if (family === 'technic-axle-keyed-hole' || family === 'keyed-shaft-interface') {
    return semantics('keyed-shaft-coupling', {
      constraint:'prismatic', assemblySlide:true,
      runtimeAxialDof:'free-until-retained', runtimeAngularDof:'locked',
      transmitsTorque:true, supportRole:false, match,
    })
  }
  if (family === 'technic-axle-round-hole') {
    return semantics('shaft-bearing', {
      constraint:'cylindrical', assemblySlide:true,
      runtimeAxialDof:'free-until-retained', runtimeAngularDof:'free',
      transmitsTorque:false, supportRole:true, match,
    })
  }
  if (family === 'technic-pin-hole') {
    return semantics('pin-joint', {
      constraint:'revolute', assemblySlide:true,
      runtimeAxialDof:'locked-after-seating', runtimeAngularDof:'free-with-friction',
      transmitsTorque:false, supportRole:'structural-joint', match,
    })
  }
  if (family === 'ball-socket') {
    return semantics('ball-joint', {
      constraint:'spherical', assemblySlide:false,
      runtimeAxialDof:'locked', runtimeAngularDof:'free-3-axis-with-limits',
      transmitsTorque:false, supportRole:'articulation', match,
    })
  }
  if (family === 'hinge-fingers') {
    return semantics('hinge-joint', {
      constraint:'revolute', assemblySlide:false,
      runtimeAxialDof:'locked', runtimeAngularDof:'single-axis',
      transmitsTorque:false, supportRole:'articulation', match,
    })
  }
  if (family === 'stud-anti-stud') {
    return semantics('stud-structural-contact', {
      constraint:'contact-bundle', assemblySlide:false,
      runtimeAxialDof:'locked-when-bundled', runtimeAngularDof:'bundle-dependent',
      transmitsTorque:false, supportRole:'structural-contact', match,
    })
  }
  return null
}

function specialPair(a, b, match) {
  const aa = specialGroup(a)
  const bb = specialGroup(b)
  const sameGroup=normalizedGroup(a)===normalizedGroup(b)
  const special = aa && bb && sameGroup ? aa : aa || bb
  if (!special) return null
  // Rim groups are size keys; a different encoded size must never match even if a
  // generic matcher happened to consider the bounding shapes compatible.
  if ((aa?.kind==='rim-tire-interface'||bb?.kind==='rim-tire-interface')&&!sameGroup) return semantics('incompatible-rim-size',{constraint:null,transmitsTorque:false,supportRole:false,match})
  const torque = special.torque === true || special.torque === 'conditional'
  return semantics(special.kind, {
    role:special.role,
    constraint:special.constraint,
    transmission:special.transmission || null,
    transmitsTorque:torque ? special.torque : false,
    supportRole:['revolute','spherical','fixed','fixed-size-fit'].includes(special.constraint) ? 'structural-special' : false,
    group:normalizedGroup(a) || normalizedGroup(b) || null,
    match,
  })
}

export function classifyTechnicConnectionV1(a, b, { activationFamily = null, match = null } = {}) {
  if (!a || !b) return semantics('unknown', { constraint:null, transmitsTorque:false, reason:'missing-endpoint' })
  const resolvedMatch = match || matchConnectorV4(a, b)
  const activation = semanticFromActivationFamily(activationFamily, a, b, resolvedMatch)
  if (activation) return activation

  const pinPair = technicPinPairV4(a, b)
  if (pinPair) return semanticFromActivationFamily('technic-pin-hole', a, b, resolvedMatch)

  const special = specialPair(a, b, resolvedMatch)
  if (special) return special

  const roles = new Set([roleFromConnector(a), roleFromConnector(b)])
  if (roles.has('technic-axle') && roles.has('technic-axle-hole') && resolvedMatch?.compatible) {
    return semanticFromActivationFamily('technic-axle-keyed-hole', a, b, resolvedMatch)
  }
  if (roles.has('technic-axle') && (roles.has('technic-round-hole') || roles.has('technic-pin-hole')) && resolvedMatch?.compatible) {
    return semanticFromActivationFamily('technic-axle-round-hole', a, b, resolvedMatch)
  }
  if ((roles.has('technic-ball') && roles.has('technic-ball-socket')) || resolvedMatch?.kinematicHint === 'spherical') {
    return semanticFromActivationFamily('ball-socket', a, b, resolvedMatch)
  }
  if (resolvedMatch?.family === 'fingers') return semanticFromActivationFamily('hinge-fingers', a, b, resolvedMatch)

  return semantics('other-compatible-interface', {
    constraint:resolvedMatch?.kinematicHint || null,
    transmitsTorque:Boolean(resolvedMatch?.keyed),
    supportRole:false,
    match:resolvedMatch,
    roles:[roleFromConnector(a), roleFromConnector(b)],
  })
}

export function technicSpecialGroupV1(connector) {
  const value = specialGroup(connector)
  return value ? Object.freeze({ group:normalizedGroup(connector), ...value }) : null
}

export const TECHNIC_SPECIAL_GROUPS_V1 = SPECIAL_GROUPS
