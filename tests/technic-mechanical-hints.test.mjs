import test from 'node:test'
import assert from 'node:assert/strict'
import { technicMechanicalHintsV1, applyTechnicMechanicalHintsV1 } from '../technic/mechanical-hints-v1.js'

const axleHole = { id:'axle-hole', type:'axle-hole', position:[0,0,0], axis:[0,1,0] }

test('verified LDraw spur and bevel gears receive trusted gear metadata only with an axle receiver', () => {
  const spur = { id:'ldraw-3648', connectors:[axleHole] }
  const bevel = { id:'ldraw-32270', connectors:[axleHole] }
  const noReceiver = { id:'ldraw-3648', connectors:[] }

  assert.deepEqual(
    { kind:technicMechanicalHintsV1(spur).mechanics.gear.kind, teeth:technicMechanicalHintsV1(spur).mechanics.gear.teeth },
    { kind:'spur', teeth:24 },
  )
  assert.deepEqual(
    { kind:technicMechanicalHintsV1(bevel).mechanics.gear.kind, teeth:technicMechanicalHintsV1(bevel).mechanics.gear.teeth },
    { kind:'bevel', teeth:12 },
  )
  assert.equal(technicMechanicalHintsV1(noReceiver).mechanics.gear, undefined)
})

test('mechanical hints are additive and never overwrite explicit mechanics owners', () => {
  const definition = {
    id:'ldraw-3648',
    connectors:[axleHole],
    mechanics:{ gear:{ kind:'spur', teeth:24, pitchRadius:1.5, efficiency:0.77, source:'explicit-owner' } },
  }
  assert.equal(applyTechnicMechanicalHintsV1(definition), true)
  assert.equal(definition.mechanics.gear.source, 'explicit-owner')
  assert.equal(definition.mechanics.gear.efficiency, 0.77)
  assert.equal(definition.mechanics.technicRotary, true)
})

test('axles and bushes become direct-kinematics rotary hints without fabricated transmission data', () => {
  const axle = { id:'ldraw-3707', connectors:[] }
  const bush = { id:'ldraw-3713', connectors:[axleHole] }
  applyTechnicMechanicalHintsV1(axle)
  applyTechnicMechanicalHintsV1(bush)
  assert.equal(axle.mechanics.shaft, true)
  assert.equal(bush.mechanics.shaft, true)
  assert.equal(axle.mechanics.gear, undefined)
  assert.equal(bush.mechanics.gear, undefined)
})
