import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  TECHNIC_SHADOW_GROUPS,
  TECHNIC_SHADOW_IDS,
  classifyTechnicShadowGroupV1,
  classifyTechnicShadowIdV1,
  normalizeShadowTokenV1,
} from '../technic/upstream-shadow-v1.js'
import { auditTechnicConnectorV1, TECHNIC_MATING_PROBES_V1 } from '../technic/connectivity-audit-v1.js'
import { bidirectionalCylinderReceiverV4 } from '../connectors-v4/through-hole-v4.js'

test('known low-level LDCad Technic ids normalize to explicit interface vocabulary', () => {
  assert.equal(classifyTechnicShadowIdV1('axle')?.kind, 'technic-axle')
  assert.equal(classifyTechnicShadowIdV1('axleHole')?.kind, 'technic-axle-hole')
  assert.equal(classifyTechnicShadowIdV1('connhole')?.kind, 'technic-pin-hole')
  assert.equal(classifyTechnicShadowIdV1('fpin10')?.kind, 'technic-friction-pin')
  assert.equal(classifyTechnicShadowIdV1('wpAxHole')?.kind, 'wheel-pin-axle-hole')
  assert.equal(Object.keys(TECHNIC_SHADOW_IDS).length >= 10, true)
})

test('known Technic-specific groups include articulated, selector, figure and turntable families', () => {
  for (const group of ['diffHouse','drivingRing1','linAct1','techBallJnt','uniJnt','techFigElbw','techFigKnee','clkRot','z56TurnTableT1']) {
    assert.ok(classifyTechnicShadowGroupV1(group), group)
  }
  assert.equal(Object.keys(TECHNIC_SHADOW_GROUPS).length >= 30, true)
})

test('parameterized rim groups keep size-fit semantics without enumerating every rim', () => {
  assert.equal(normalizeShadowTokenV1('rim47_31'), 'rim4731')
  assert.equal(classifyTechnicShadowGroupV1('rim47_31')?.kind, 'rim-size-fit')
  assert.equal(classifyTechnicShadowGroupV1('rim8_6')?.kind, 'rim-size-fit')
})

test('unknown Shadow tokens do not invent Technic behavior', () => {
  assert.equal(classifyTechnicShadowGroupV1('madeUpMechanism'), null)
  assert.equal(classifyTechnicShadowIdV1('madeUpPrimitive'), null)
})

test('Technic mating probes certify the expected axle, pin and receiver matrix', () => {
  const expectedRoles={
    axle:'technic-axle',
    axleHole:'technic-axle-hole',
    pin:'technic-pin',
    pinHole:'technic-pin-hole',
    roundHole:'technic-round-hole',
    axlePin:'technic-axle-pin',
  }
  for(const [name,connector] of Object.entries(TECHNIC_MATING_PROBES_V1)){
    const audit=auditTechnicConnectorV1(connector)
    assert.equal(audit.role,expectedRoles[name],name)
    assert.equal(audit.pass,true,`${name}: ${audit.findings.join(', ')}`)
  }
})

test('through-hole policy keeps symmetric Technic receivers bidirectional and connhol3 directional', () => {
  assert.equal(bidirectionalCylinderReceiverV4(TECHNIC_MATING_PROBES_V1.axleHole),true)
  assert.equal(bidirectionalCylinderReceiverV4(TECHNIC_MATING_PROBES_V1.pinHole),true)
  assert.equal(bidirectionalCylinderReceiverV4(TECHNIC_MATING_PROBES_V1.roundHole),true)

  const oneSided=structuredClone(TECHNIC_MATING_PROBES_V1.pinHole)
  oneSided.id='connhol3'
  oneSided.geometry.sections=[
    {shape:'R',radiusLdu:6,lengthLdu:16,elastic:false},
    {shape:'R',radiusLdu:8,lengthLdu:2,elastic:false},
  ]
  assert.equal(bidirectionalCylinderReceiverV4(oneSided),false)
  const audit=auditTechnicConnectorV1(oneSided)
  assert.equal(audit.entryPolicy,'canonical-side')
  assert.equal(audit.pass,true,audit.findings.join(', '))
})

test('every audited fixed Technic Shadow group is represented by runtime semantics or an explicit semantic-only registry', async () => {
  const semantics = (await readFile(new URL('../technic/interface-semantics-v1.js', import.meta.url), 'utf8')).toLowerCase()
  const grammar = (await readFile(new URL('../technic/mechanical-grammar-v1.js', import.meta.url), 'utf8')).toLowerCase()
  const capabilities = (await readFile(new URL('../technic/capabilities-v1.js', import.meta.url), 'utf8')).toLowerCase()
  const coveredText = `${semantics}\n${grammar}\n${capabilities}`

  const missing = Object.keys(TECHNIC_SHADOW_GROUPS).filter(group => !coveredText.includes(group))
  assert.deepEqual(missing, [], `unreviewed upstream Technic groups: ${missing.join(', ')}`)
})
