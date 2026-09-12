import test from 'node:test'
import assert from 'node:assert/strict'

import { parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { activationForMatchV4, classifyConnectorV4 } from '../connectors-v4/activation-v4.js'
import { classifyTechnicPinInterfaceV4, technicPinPairV4 } from '../connectors-v4/pin-semantics-v4.js'

const PIN_3673_SHADOW=[
  '0 !LDCAD SNAP_CLEAR',
  '0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2   R 6 16   R 8 4   R 6 16   _L 6.25 2] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]',
  '0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=R 4 40] [center=true] [ori=0 -1 0 1 0 0 0 0 1]',
].join('\n')
const CONNHOLE_SHADOW='0 !LDCAD SNAP_CYL [id=connhole] [gender=F] [caps=none] [secs=R 8 2   R 6 16   R 8 2] [center=true] [slide=true]'
const ROUND_HOLE_SHADOW='0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=R 6 20] [center=true] [slide=true]'
const AXLE_SHADOW='0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 80] [center=true] [slide=true]'
const STUD_SHADOW='0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 6 4]'

function connectors(text,file='fixture.dat') {
  const parsed=parseShadowTextV4(text,{file})
  assert.equal(parsed.warnings.length,0,JSON.stringify(parsed.warnings))
  return parsed.operations.filter(operation=>operation.type==='connector').map(operation=>operation.connector)
}

test('V4 explicitly classifies a real friction pin profile as male Technic pin',()=>{
  const [male]=connectors(PIN_3673_SHADOW,'parts/3673.dat').filter(connector=>connector.gender==='male')
  const semantic=classifyTechnicPinInterfaceV4(male)
  assert.equal(semantic.role,'technic-pin')
  assert.equal(semantic.gender,'male')
  assert.equal(semantic.confidence,'profile-verified')
  assert.equal(semantic.frictionFit,true)
  assert.equal(classifyConnectorV4(male),'technic-pin')
})

test('V4 distinguishes canonical female connhole from a generic round through-hole',()=>{
  const [pinHole]=connectors(CONNHOLE_SHADOW,'p/connhole.dat')
  const [roundHole]=connectors(ROUND_HOLE_SHADOW,'parts/simple-round.dat')
  assert.equal(classifyTechnicPinInterfaceV4(pinHole).role,'technic-pin-hole')
  assert.equal(classifyConnectorV4(pinHole),'technic-pin-hole')
  assert.equal(classifyTechnicPinInterfaceV4(roundHole),null)
  assert.equal(classifyConnectorV4(roundHole),'technic-round-hole')
})

test('V4 pin semantics do not misclassify studs or keyed axles as Technic pins',()=>{
  const [stud]=connectors(STUD_SHADOW,'p/stud.dat')
  const [axle]=connectors(AXLE_SHADOW,'parts/axle.dat')
  assert.equal(classifyTechnicPinInterfaceV4(stud),null)
  assert.equal(classifyTechnicPinInterfaceV4(axle),null)
  assert.equal(classifyConnectorV4(stud),'stud')
  assert.equal(classifyConnectorV4(axle),'technic-axle')
})

test('male pin and female connhole become an explicit certified pin-hole pair in either direction',()=>{
  const [male]=connectors(PIN_3673_SHADOW,'parts/3673.dat').filter(connector=>connector.gender==='male')
  const [female]=connectors(CONNHOLE_SHADOW,'p/connhole.dat')
  const semantic=technicPinPairV4(male,female)
  assert.equal(semantic.family,'technic-pin-hole')
  assert.equal(semantic.evidence,'ldcad-shadow:technic-pin-gender-profile')

  for (const [source,target] of [[male,female],[female,male]]) {
    const match=matchConnectorV4(source,target)
    assert.equal(match.compatible,true)
    const activation=activationForMatchV4(source,target,match)
    assert.equal(activation.active,true)
    assert.equal(activation.family,'technic-pin-hole')
    assert.equal(activation.evidence,'ldcad-shadow:technic-pin-gender-profile')
    assert.ok([activation.sourceRole,activation.targetRole].includes('technic-pin'))
    assert.ok([activation.sourceRole,activation.targetRole].includes('technic-pin-hole'))
  }
})

test('male Technic pin still pairs with a simple R6 receiver while axle compatibility with connhole is preserved',()=>{
  const [pin]=connectors(PIN_3673_SHADOW,'parts/3673.dat').filter(connector=>connector.gender==='male')
  const [roundHole]=connectors(ROUND_HOLE_SHADOW,'parts/simple-round.dat')
  const pinActivation=activationForMatchV4(pin,roundHole,matchConnectorV4(pin,roundHole))
  assert.equal(pinActivation.active,true)
  assert.equal(pinActivation.family,'technic-pin-hole')
  assert.equal(pinActivation.sourceRole,'technic-pin')
  assert.equal(pinActivation.targetRole,'technic-round-hole')

  const [axle]=connectors(AXLE_SHADOW,'parts/axle.dat')
  const [pinHole]=connectors(CONNHOLE_SHADOW,'p/connhole.dat')
  const axleActivation=activationForMatchV4(axle,pinHole,matchConnectorV4(axle,pinHole))
  assert.equal(axleActivation.active,true)
  assert.equal(axleActivation.family,'technic-axle-round-hole')
})
