export const TECHNIC_MECHANICAL_GRAMMAR_VERSION = 'technic-mechanical-grammar-v1.1.0'

const freeze = value => Object.freeze(value)

export const TECHNIC_INTERFACE_KINDS = freeze({
  PIN: freeze({ id:'technic-pin', shape:'round', role:'male-structural-pin', torqueCoupling:false }),
  PIN_HOLE: freeze({ id:'technic-pin-hole', shape:'round', role:'female-pin-receiver', torqueCoupling:false }),
  AXLE: freeze({ id:'technic-axle', shape:'cross', role:'male-keyed-shaft', torqueCoupling:true }),
  AXLE_HOLE: freeze({ id:'technic-axle-hole', shape:'cross', role:'female-keyed-shaft-receiver', torqueCoupling:true }),
  ROUND_BEARING: freeze({ id:'technic-round-bearing', shape:'round', role:'axle-bearing', torqueCoupling:false }),
  BALL: freeze({ id:'technic-ball', shape:'sphere', role:'male-ball-joint', torqueCoupling:false }),
  BALL_SOCKET: freeze({ id:'technic-ball-socket', shape:'sphere', role:'female-ball-joint', torqueCoupling:false }),
  HINGE: freeze({ id:'technic-hinge', shape:'hinge', role:'revolute-joint', torqueCoupling:false }),
  TURNTABLE: freeze({ id:'technic-turntable', shape:'ring', role:'retained-revolute-joint', torqueCoupling:false }),
  LINEAR_SLIDER: freeze({ id:'technic-linear-slider', shape:'guide', role:'prismatic-joint', torqueCoupling:false }),
  DRIVING_RING: freeze({ id:'technic-driving-ring', shape:'selector', role:'shiftable-rotary-coupler', torqueCoupling:true }),
})

export const TECHNIC_MATE_RULES = freeze([
  freeze({
    id:'pin-in-pin-hole',
    a:'technic-pin', b:'technic-pin-hole',
    semanticRole:'pin-joint',
    constraint:'revolute',
    assemblySlide:true,
    runtimeAxialDof:'locked-after-seating',
    runtimeAngularDof:'free-with-friction',
    transmitsTorque:false,
    evidence:['LDraw connect*/confric* + connhole/peghole primitives','LDCad SNAP_CYL Technic pin profiles'],
    note:'Friction changes resistance, not the geometric degree of freedom. Multiple separated pin joints between the same rigid bodies can remove the revolute DOF at assembly level.',
  }),
  freeze({
    id:'axle-in-axle-hole',
    a:'technic-axle', b:'technic-axle-hole',
    semanticRole:'keyed-shaft-coupling',
    constraint:'prismatic',
    assemblySlide:true,
    runtimeAxialDof:'free-until-retained',
    runtimeAngularDof:'locked',
    transmitsTorque:true,
    evidence:['LDraw axle.dat + axlehole/axlehol0 families','LDCad axle / axleHole snap ids'],
    note:'Axial motion is stopped by bushes, stop-axles, shoulders, adjacent parts or explicit retainers; rotational motion is shared with the shaft.',
  }),
  freeze({
    id:'axle-in-round-hole',
    a:'technic-axle', b:'technic-round-bearing',
    semanticRole:'bearing',
    constraint:'cylindrical',
    assemblySlide:true,
    runtimeAxialDof:'free-until-retained',
    runtimeAngularDof:'free',
    transmitsTorque:false,
    evidence:['BrickLab V4 A-round cylinder matching','Physical Technic axle through round beam/brick hole'],
    note:'This is a support/bearing relationship, not a torque coupling. With axial retention it becomes effectively revolute.',
  }),
  freeze({
    id:'ball-in-socket',
    a:'technic-ball', b:'technic-ball-socket',
    semanticRole:'ball-joint',
    constraint:'spherical',
    assemblySlide:false,
    runtimeAxialDof:'locked',
    runtimeAngularDof:'free-3-axis-with-limits-from-geometry',
    transmitsTorque:false,
    evidence:['LDCad techBallJnt generic sphere group'],
  }),
  freeze({
    id:'hinge-pair',
    a:'technic-hinge', b:'technic-hinge',
    semanticRole:'hinge',
    constraint:'revolute',
    assemblySlide:false,
    runtimeAxialDof:'locked',
    runtimeAngularDof:'single-axis',
    transmitsTorque:false,
    evidence:['LDCad finger/group snap semantics'],
  }),
  freeze({
    id:'turntable-pair',
    a:'technic-turntable', b:'technic-turntable',
    semanticRole:'turntable-bearing',
    constraint:'revolute',
    assemblySlide:false,
    runtimeAxialDof:'locked',
    runtimeAngularDof:'single-axis',
    transmitsTorque:false,
    evidence:['LDCad Technic turntable groups'],
  }),
])

export const TECHNIC_TRANSMISSION_KINDS = freeze({
  SPUR: freeze({ id:'spur', motion:'rotary-to-rotary', axisRelation:'parallel', direction:'opposite-for-external-mesh', phase:'tooth-to-gap', status:'implemented' }),
  BEVEL: freeze({ id:'bevel', motion:'rotary-to-rotary', axisRelation:'intersecting', direction:'mesh-dependent', phase:'tooth-to-gap', status:'implemented' }),
  CROWN: freeze({ id:'crown', motion:'rotary-to-rotary', axisRelation:'typically-perpendicular', direction:'mesh-dependent', phase:'tooth-to-gap', status:'research-required' }),
  WORM: freeze({ id:'worm', motion:'rotary-to-rotary', axisRelation:'skew/perpendicular', direction:'handedness-dependent', phase:'thread-to-tooth', status:'research-required' }),
  RACK: freeze({ id:'rack', motion:'rotary-to-linear', axisRelation:'pinion-axis-perpendicular-to-rack-travel', direction:'sign-from-contact-side', phase:'tooth-to-gap', status:'research-required' }),
  DIFFERENTIAL: freeze({ id:'differential', motion:'rotary-three-shaft', axisRelation:'internal-gearset', direction:'constraint-equation', phase:'internal', status:'partial' }),
  DRIVING_RING: freeze({ id:'driving-ring', motion:'selectable-rotary-coupling', axisRelation:'coaxial', direction:'same-shaft-when-engaged', phase:'dog-teeth', status:'research-required' }),
  UNIVERSAL_JOINT: freeze({ id:'universal-joint', motion:'rotary-to-rotary', axisRelation:'intersecting-variable-angle', direction:'same-linkage-chain', phase:'yoke-dependent', status:'partial' }),
  CV_JOINT: freeze({ id:'cv-joint', motion:'rotary-to-rotary', axisRelation:'variable-angle', direction:'joint-dependent', phase:'joint-dependent', status:'research-required' }),
  CHAIN_SPROCKET: freeze({ id:'chain-sprocket', motion:'rotary-to-rotary', axisRelation:'parallel-sprockets', direction:'same-direction-open-chain', phase:'link-to-tooth', status:'research-required' }),
  PULLEY_BELT: freeze({ id:'pulley-belt', motion:'rotary-to-rotary', axisRelation:'usually-parallel', direction:'same-open/opposite-crossed', phase:'continuous', status:'research-required' }),
})

// Known LDCad Shadow groups with Technic-specific meaning. These entries are routing
// hints for the audit/review process, not permission to invent a connector. Production
// behavior may use a group only when the corresponding effective Shadow endpoint exists.
export const TECHNIC_SPECIAL_GROUPS = freeze({
  diffHouse: freeze({ mechanism:'differential-housing', targetConstraint:'reviewed-compound', status:'partial' }),
  drivingRing1: freeze({ mechanism:'driving-ring-selector', targetConstraint:'prismatic-plus-conditional-rotary-coupling', status:'research-required' }),
  drivingRing2: freeze({ mechanism:'driving-ring-selector', targetConstraint:'prismatic-plus-conditional-rotary-coupling', status:'research-required' }),
  linAct1: freeze({ mechanism:'linear-actuator-small', targetConstraint:'prismatic-plus-screw-conversion', status:'research-required' }),
  linAct2: freeze({ mechanism:'linear-actuator-large', targetConstraint:'prismatic-plus-screw-conversion', status:'research-required' }),
  linearActBody: freeze({ mechanism:'linear-actuator-body', targetConstraint:'prismatic-guide', status:'research-required' }),
  cylSlide: freeze({ mechanism:'cylinder-slider', targetConstraint:'prismatic', status:'research-required' }),
  pneuCyl: freeze({ mechanism:'pneumatic-cylinder', targetConstraint:'limited-prismatic', status:'research-required' }),
  steerHold1: freeze({ mechanism:'steering-holder', targetConstraint:'reviewed-revolute/compound', status:'research-required' }),
  steerHub1: freeze({ mechanism:'steering-hub', targetConstraint:'reviewed-revolute/ball-joint', status:'research-required' }),
  techBallJnt: freeze({ mechanism:'technic-ball-joint', targetConstraint:'spherical', status:'geometry-supported' }),
  nudge1: freeze({ mechanism:'technic-spindle-ball', targetConstraint:'reviewed-spherical', status:'research-required' }),
  nudge2: freeze({ mechanism:'technic-spindle-ball', targetConstraint:'reviewed-spherical', status:'research-required' }),
  uniJnt: freeze({ mechanism:'universal-joint', targetConstraint:'compound-revolute', status:'partial' }),
  techGearRack: freeze({ mechanism:'flexible-gear-rack', targetConstraint:'rack-path-and-mesh', status:'research-required' }),
  techTrnTbl60: freeze({ mechanism:'technic-turntable', targetConstraint:'retained-revolute', status:'research-required' }),
  turnTablePin: freeze({ mechanism:'turntable-pin', targetConstraint:'retained-revolute', status:'research-required' }),
  turntable5x5: freeze({ mechanism:'technic-turntable', targetConstraint:'retained-revolute', status:'research-required' }),
  z28Turntable: freeze({ mechanism:'technic-geared-turntable', targetConstraint:'retained-revolute-plus-gear-mesh', status:'research-required' }),
  z56TurnTableT1: freeze({ mechanism:'technic-geared-turntable', targetConstraint:'retained-revolute-plus-gear-mesh', status:'research-required' }),
  wpAxHole: freeze({ mechanism:'wheel-pin-axle-hole', targetConstraint:'reviewed-wheel-bearing', status:'research-required' }),
  sglWhlAxle: freeze({ mechanism:'single-wheel-axle', targetConstraint:'reviewed-wheel-bearing', status:'research-required' }),
  techWhlCon1: freeze({ mechanism:'click-wheel-connection', targetConstraint:'indexed-revolute', status:'research-required' }),
  techEngine: freeze({ mechanism:'technic-engine-cylinder-head', targetConstraint:'guided-reciprocating', status:'research-required' }),
  bumper: freeze({ mechanism:'technic-bumper', targetConstraint:'part-specific', status:'research-required' }),
  craneArmW16: freeze({ mechanism:'slim-crane-arm', targetConstraint:'part-specific-pivot', status:'research-required' }),
  craneArmW20: freeze({ mechanism:'crane-arm', targetConstraint:'part-specific-pivot', status:'research-required' }),
  techFlexEnd: freeze({ mechanism:'technic-flex-end', targetConstraint:'flexible-segment-end', status:'research-required' }),
})

export const TECHNIC_SUPPORT_RULES = freeze({
  SHAFT_SUPPORT: freeze({
    id:'shaft-support',
    requirement:'Rotating shafts should be supported by coaxial round bearings; two separated supports are preferred for a stable axis.',
    validator:'bearing-count + coaxiality + span',
  }),
  AXIAL_RETENTION: freeze({
    id:'axial-retention',
    requirement:'A shaft that must not slide needs positive axial retention from bushes, stop features, shoulders or trapped geometry.',
    validator:'retainer-on-both-required-sides',
  }),
  GEAR_SUPPORT: freeze({
    id:'gear-support',
    requirement:'Meshing gears need their shaft axes held at the correct center distance and orientation; support close to the gear reduces cantilever and frame flex.',
    validator:'mesh-valid + nearby-bearing + frame-stiffness',
  }),
  FRAME_CLOSURE: freeze({
    id:'frame-closure',
    requirement:'Parallel Technic beams/frames should be cross-braced so bearing-hole spacing remains fixed under load.',
    validator:'structural-loop + multi-point pin/axle constraints',
  }),
  MULTI_CONTACT_RIGIDITY: freeze({
    id:'multi-contact-rigidity',
    requirement:'A single pin joint is revolute; two or more non-collinear/separated joints between the same two rigid bodies can make the assembly effectively fixed.',
    validator:'body-pair contact graph + rank/DOF reduction',
  }),
})

function normalizeId(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return String(value.id || '')
}

export function technicMateRule(a, b) {
  const aa = normalizeId(a)
  const bb = normalizeId(b)
  return TECHNIC_MATE_RULES.find(rule => (rule.a === aa && rule.b === bb) || (rule.a === bb && rule.b === aa)) ?? null
}

export function technicSpurPitchRadiusStuds(teeth) {
  const count = Number(teeth)
  if (!Number.isFinite(count) || count <= 0) return null
  return count / 16
}

export function technicSpurCenterDistanceStuds(teethA, teethB) {
  const a = technicSpurPitchRadiusStuds(teethA)
  const b = technicSpurPitchRadiusStuds(teethB)
  return a == null || b == null ? null : a + b
}

export function technicExternalGearVelocityRatio(driverTeeth, drivenTeeth) {
  const driver = Number(driverTeeth)
  const driven = Number(drivenTeeth)
  if (!Number.isFinite(driver) || !Number.isFinite(driven) || driver <= 0 || driven <= 0) return null
  return -driver / driven
}

export const BrickLabTechnicMechanicalGrammar = freeze({
  version:TECHNIC_MECHANICAL_GRAMMAR_VERSION,
  interfaces:TECHNIC_INTERFACE_KINDS,
  mates:TECHNIC_MATE_RULES,
  transmissions:TECHNIC_TRANSMISSION_KINDS,
  specialGroups:TECHNIC_SPECIAL_GROUPS,
  supports:TECHNIC_SUPPORT_RULES,
  mateRule:technicMateRule,
  spurPitchRadiusStuds:technicSpurPitchRadiusStuds,
  spurCenterDistanceStuds:technicSpurCenterDistanceStuds,
  externalGearVelocityRatio:technicExternalGearVelocityRatio,
})
