import { constraintDof, dofEntry } from '../constraints/dof.js'

export const MECHANICAL_EVIDENCE_TIERS = Object.freeze({
  OFFICIAL:'A',
  CONNECTIVITY:'B',
  COMMUNITY:'C',
  INFERRED:'D',
})

export const INTERFACE_SEMANTICS_VERSION = 'mechanics-interface-semantics-0.1.0'

function freezeRule(rule) {
  return Object.freeze({
    ...rule,
    topology:Object.freeze({ ...(rule.topology || {}) }),
    dynamics:Object.freeze({ ...(rule.dynamics || {}) }),
    evidence:Object.freeze({ ...(rule.evidence || {}) }),
  })
}

export const INTERFACE_RULES = Object.freeze({
  'stud:anti-stud':freezeRule({
    kind:'revolute',
    topology:{ dof:constraintDof('revolute'), axis:'y', bundleCanBecomeRigid:true, retained:true },
    dynamics:{ clutchFriction:true, rotationalResistance:'clutch', disengagement:'retention-force' },
    evidence:{ tier:'B', source:'LDCad round-cylinder connectivity and LDraw connectivity discussions' },
  }),
  'technic-pin:technic-hole':freezeRule({
    kind:'revolute',
    topology:{ dof:constraintDof('revolute'), axis:'y', bundleCanBecomeRigid:true, retained:true, intervalOccupancy:true },
    dynamics:{ rotationalResistance:'part-variant', disengagement:'pin-retention' },
    evidence:{ tier:'C', source:'Technic pin friction/smooth usage plus connectivity metadata' },
  }),
  'axle:axle-hole':freezeRule({
    kind:'prismatic',
    topology:{ dof:constraintDof('prismatic'), axis:'y', keyedRotation:true, intervalOccupancy:true },
    dynamics:{ axialResistance:'part-fit', disengagement:'axial-unless-stopped' },
    evidence:{ tier:'B', source:'LDCad keyed cylinder profiles and Technic geometry' },
  }),
  'axle:round-hole':freezeRule({
    kind:'cylindrical',
    topology:{ dof:constraintDof('cylindrical'), axis:'y', keyedRotation:false, intervalOccupancy:true },
    dynamics:{ rotationalResistance:'low', axialResistance:'low' },
    evidence:{ tier:'C', source:'Technic round-hole free-spin usage plus LDraw/LDCad connectivity' },
  }),
  'bar:round-hole':freezeRule({
    kind:'cylindrical',
    topology:{ dof:constraintDof('cylindrical'), axis:'y', intervalOccupancy:true },
    dynamics:{ rotationalResistance:'low', axialResistance:'low' },
    evidence:{ tier:'B', source:'LDCad cylindrical sliding semantics' },
  }),
  'bar:clip':freezeRule({
    kind:'cylindrical',
    topology:{ dof:constraintDof('cylindrical'), axis:'y', retained:true, slideDependsOnProfile:true },
    dynamics:{ rotationalResistance:'clip-friction', axialResistance:'clip-friction', disengagement:'radial-retention' },
    evidence:{ tier:'B', source:'LDCad SNAP_CLP and SNAP_CYL semantics' },
  }),
  'hinge:fingers':freezeRule({
    kind:'revolute',
    topology:{ dof:constraintDof('revolute'), axis:'y', retained:true },
    dynamics:{ rotationalResistance:'part-variant' },
    evidence:{ tier:'B', source:'LDCad SNAP_FGR semantics' },
  }),
  'click-hinge:fingers':freezeRule({
    kind:'revolute',
    topology:{ dof:constraintDof('revolute'), axis:'y', retained:true, detents:true },
    dynamics:{ rotationalResistance:'detent', preferredAngles:'part-profile' },
    evidence:{ tier:'B', source:'LDCad grouped finger/click-hinge connectivity' },
  }),
  'ball:socket':freezeRule({
    kind:'spherical',
    topology:{ dof:constraintDof('spherical'), retained:true, angularLimits:'geometry' },
    dynamics:{ rotationalResistance:'socket-friction', disengagement:'retention-force' },
    evidence:{ tier:'B', source:'LDCad free-placement ball/socket semantics' },
  }),
  'turntable:turntable':freezeRule({
    kind:'revolute',
    topology:{ dof:constraintDof('revolute'), axis:'y', retained:true },
    dynamics:{ rotationalResistance:'part-variant' },
    evidence:{ tier:'C', source:'Technic turntable use plus LDCad turntable groups' },
  }),
  'tyre:rim':freezeRule({
    kind:'fixed',
    topology:{ dof:constraintDof('fixed'), retained:true, elasticFit:true },
    dynamics:{ deformation:'future-tyre-model' },
    evidence:{ tier:'B', source:'assembled wheel/tyre connectivity semantics' },
  }),
})

export const TRANSMISSION_SEMANTICS = Object.freeze({
  externalGear:Object.freeze({
    bidirectional:true,
    relation:'teethA*omegaA + teethB*omegaB = 0',
    evidence:{ tier:'A', source:'LEGO Education Gear' },
  }),
  differential:Object.freeze({
    bidirectional:true,
    relation:'2*carrier - left - right = 0',
    underdeterminedWithSingleDriver:true,
    evidence:{ tier:'A', source:'LEGO Education differential principle model' },
  }),
  worm:Object.freeze({
    bidirectional:false,
    defaultBackdrive:false,
    evidence:{ tier:'A', source:'LEGO Education worm-gear principle model' },
  }),
  rackPinion:Object.freeze({
    bidirectional:true,
    evidence:{ tier:'A', source:'LEGO Education rack-and-pinion principle model' },
  }),
  pulleyBelt:Object.freeze({
    bidirectional:true,
    slipPossible:true,
    evidence:{ tier:'A', source:'LEGO Education pulley/belt principles' },
  }),
  camFollower:Object.freeze({
    contactDriven:true,
    separationPossible:true,
    evidence:{ tier:'A', source:'LEGO Education Cam' },
  }),
  ratchet:Object.freeze({
    unilateral:true,
    evidence:{ tier:'A', source:'LEGO Education Pawl and Ratchet' },
  }),
})

const canonicalPairs = new Map([
  ['anti-stud:stud','stud:anti-stud'],
  ['technic-hole:technic-pin','technic-pin:technic-hole'],
  ['axle-hole:axle','axle:axle-hole'],
  ['round-hole:axle','axle:round-hole'],
  ['round-hole:bar','bar:round-hole'],
  ['clip:bar','bar:clip'],
  ['fingers:hinge','hinge:fingers'],
  ['fingers:click-hinge','click-hinge:fingers'],
  ['socket:ball','ball:socket'],
  ['rim:tyre','tyre:rim'],
])

export function mechanicalInterfaceRule(a, b, {
  friction = null,
  slide = null,
  axialLocked = false,
  angularLocked = false,
} = {}) {
  const raw = [String(a), String(b)].sort().join(':')
  const key = canonicalPairs.get(raw) || raw
  const base = INTERFACE_RULES[key]
  if (!base) return null

  const dof = Object.fromEntries(Object.entries(base.topology.dof).map(([name, value]) => [name, { ...value }]))
  if (slide === false && dof.ty?.state === 'free') dof.ty = dofEntry('locked')
  if (axialLocked) dof.ty = dofEntry('locked')
  if (angularLocked) dof.ry = dofEntry('locked')

  return Object.freeze({
    ...base,
    topology:Object.freeze({ ...base.topology, dof:Object.freeze(dof) }),
    dynamics:Object.freeze({
      ...base.dynamics,
      ...(friction == null ? {} : { rotationalResistance:friction }),
    }),
  })
}

export function frictionPinDynamics({ friction = true } = {}) {
  return Object.freeze({
    topologyKind:'revolute',
    rotationalResistance:friction ? 'high' : 'low',
    topologicallyFixed:false,
  })
}

export function shouldFormRigidIsland(constraint) {
  const dof = constraint?.dof || constraint?.topology?.dof
  return Boolean(dof) && ['tx','ty','tz','rx','ry','rz'].every(key => dof[key]?.state === 'locked')
}
