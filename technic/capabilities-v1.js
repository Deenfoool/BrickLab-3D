export const TECHNIC_CAPABILITIES_VERSION = 'technic-capabilities-v1.1.0'

const freeze = value => Object.freeze(value)

// This table is deliberately conservative. "active" means BrickLab has a concrete
// runtime path today. "semantic" means the family can be recognized/audited but must
// not fabricate motion. "metadata" means a packaged BrickLab part can run from its
// explicit mechanics metadata, while arbitrary LDraw geometry remains fail-closed.
export const TECHNIC_MECHANISM_CAPABILITIES = freeze({
  'pin-joint': freeze({ recognition:'active', build:'active', kinematics:'active', simulate:'active', source:'Connector V4' }),
  'keyed-shaft-coupling': freeze({ recognition:'active', build:'active', kinematics:'active', simulate:'active', source:'Connector V4 + drivetrain' }),
  'shaft-bearing': freeze({ recognition:'active', build:'active', kinematics:'active', simulate:'active', source:'Connector V4 + bearing policy' }),
  'ball-joint': freeze({ recognition:'active', build:'active', kinematics:'active', simulate:'active', source:'Connector V4 spherical' }),
  'hinge-joint': freeze({ recognition:'active', build:'active', kinematics:'active', simulate:'active', source:'Connector V4 fingers' }),
  'spur-gear': freeze({ recognition:'active', build:'active', kinematics:'active', simulate:'active', source:'Parts-5 gear mesh + Technic hints' }),
  'bevel-gear': freeze({ recognition:'active', build:'active', kinematics:'active', simulate:'active', source:'Parts-5 bevel mesh + Technic hints' }),
  'worm-drive': freeze({ recognition:'active', build:'metadata', kinematics:'active', simulate:'active', source:'packaged transmission metadata', arbitraryLDraw:'semantic' }),
  'rack-pinion': freeze({ recognition:'active', build:'metadata', kinematics:'active', simulate:'active', source:'module-matched rack metadata + guided Rapier pitch-contact coupling', arbitraryLDraw:'semantic' }),
  'differential': freeze({ recognition:'active', build:'metadata', kinematics:'active', simulate:'active', source:'drivetrain differential metadata', arbitraryLDraw:'semantic' }),
  'universal-joint': freeze({ recognition:'active', build:'metadata', kinematics:'active', simulate:'active', source:'articulated driveline metadata', arbitraryLDraw:'semantic' }),
  'cv-joint': freeze({ recognition:'active', build:'metadata', kinematics:'active', simulate:'active', source:'articulated driveline metadata', arbitraryLDraw:'semantic' }),
  'turntable': freeze({ recognition:'active', build:'active', kinematics:'active', simulate:'active', source:'Connector V4 retained revolute when certified' }),
  'linear-actuator': freeze({ recognition:'active', build:'semantic', kinematics:'semantic', simulate:'semantic', source:'Shadow special groups; no generic screw law certified' }),
  'pneumatic': freeze({ recognition:'active', build:'semantic', kinematics:'semantic', simulate:'semantic', source:'Shadow special groups; pressure model not certified' }),
  'driving-ring': freeze({ recognition:'active', build:'semantic', kinematics:'semantic', simulate:'semantic', source:'Shadow driving-ring groups; selector engagement not certified' }),
  'crown-gear': freeze({ recognition:'active', build:'semantic', kinematics:'semantic', simulate:'semantic', source:'part profile only; spatial crown mesh not certified' }),
  'standalone-worm': freeze({ recognition:'active', build:'semantic', kinematics:'semantic', simulate:'semantic', source:'part profile only; spatial thread mesh not certified' }),
  'chain-sprocket': freeze({ recognition:'active', build:'semantic', kinematics:'semantic', simulate:'semantic', source:'part profiles + ratio math; chain path solver not certified' }),
  'pulley-belt': freeze({ recognition:'active', build:'semantic', kinematics:'semantic', simulate:'semantic', source:'part profiles + ratio math; belt path/tension solver not certified' }),
  'flex-system': freeze({ recognition:'active', build:'semantic', kinematics:'semantic', simulate:'semantic', source:'Shadow flex endpoints; flexible-body solver not certified' }),
  'engine-piston': freeze({ recognition:'active', build:'semantic', kinematics:'semantic', simulate:'semantic', source:'Shadow engine groups; generic crank law not certified' }),
})

export function technicCapabilityV1(kind) {
  return TECHNIC_MECHANISM_CAPABILITIES[String(kind || '').toLowerCase()] ?? freeze({
    recognition:'unknown', build:'unsupported', kinematics:'unsupported', simulate:'unsupported', source:'none',
  })
}

export function technicCapabilitySummaryV1() {
  const values = Object.entries(TECHNIC_MECHANISM_CAPABILITIES)
  const count = field => values.reduce((out, [kind, value]) => {
    const status=value[field] || 'unknown'
    out[status]=(out[status]||0)+1
    return out
  }, {})
  return freeze({
    version:TECHNIC_CAPABILITIES_VERSION,
    mechanisms:values.length,
    build:freeze(count('build')),
    kinematics:freeze(count('kinematics')),
    simulate:freeze(count('simulate')),
  })
}
