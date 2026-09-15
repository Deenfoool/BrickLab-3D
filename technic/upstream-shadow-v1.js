export const TECHNIC_UPSTREAM_SHADOW_VERSION = 'technic-upstream-shadow-v1.0.0'

const freeze = value => Object.freeze(value)

// Sourced from the LDCad Shadow Library contributor reference. This is vocabulary,
// not a license to create behavior: actual runtime activation still requires a
// resolved connector and a certified matcher/policy.
export const TECHNIC_SHADOW_IDS = freeze({
  axle:'technic-axle',
  axlehole:'technic-axle-hole',
  axlehole2:'technic-axle-hole-variant-2',
  axlehole3:'technic-axle-hole-variant-3',
  conn4:'technic-pin-no-base',
  connhol3:'technic-one-sided-pin-hole',
  connhole:'technic-pin-hole',
  fpin10:'technic-friction-pin',
  fpin11:'technic-friction-pin',
  pin8:'technic-pin',
  wpaxhole:'wheel-pin-axle-hole',
})

export const TECHNIC_SHADOW_GROUPS = freeze({
  bumper:'structural-special',
  clkrot:'indexed-revolute',
  cranearmw16:'crane-arm',
  cranearmw20:'crane-arm',
  cylslide:'linear-guide',
  diffhouse:'differential-housing',
  drivingring1:'driving-ring',
  drivingring2:'driving-ring',
  linact1:'linear-actuator',
  linact2:'linear-actuator',
  linearactbody:'linear-actuator-body',
  nudge1:'nudged-ball-joint',
  nudge2:'nudged-ball-joint',
  pneucyl:'pneumatic-cylinder',
  sglwhlaxle:'single-wheel-axle',
  steerhold1:'steering-holder',
  steerhub1:'steering-hub',
  techballjnt:'technic-ball-joint',
  techengine:'technic-engine',
  techfigelbw:'technic-figure-elbow',
  techfigfoot:'technic-figure-foot',
  techfighips:'technic-figure-hips',
  techfigknee:'technic-figure-knee',
  techfigpel:'technic-figure-pelvis',
  techfigvis:'technic-figure-visor',
  techflexend:'flex-system-end',
  techgearrack:'bendable-gear-rack',
  techtrntbl60:'turntable-60',
  techwhlcon1:'click-wheel-connection',
  turntablepin:'turntable-pin',
  turntable5x5:'turntable-5x5',
  unijnt:'universal-joint',
  wpaxhole:'wheel-pin-axle-hole',
  z28turntable:'turntable-z28',
  z56turntablet1:'turntable-z56-type1',
})

export function normalizeShadowTokenV1(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g,'')
}

export function classifyTechnicShadowGroupV1(value) {
  const key=normalizeShadowTokenV1(value)
  if (TECHNIC_SHADOW_GROUPS[key]) return freeze({ key, kind:TECHNIC_SHADOW_GROUPS[key], source:'ldcad-shadow-known-group' })
  if (/^rim\d{2,}$/.test(key)) return freeze({ key, kind:'rim-size-fit', source:'ldcad-shadow-rim-encoding' })
  return null
}

export function classifyTechnicShadowIdV1(value) {
  const key=normalizeShadowTokenV1(value)
  const kind=TECHNIC_SHADOW_IDS[key]
  return kind ? freeze({ key, kind, source:'ldcad-shadow-known-id' }) : null
}
