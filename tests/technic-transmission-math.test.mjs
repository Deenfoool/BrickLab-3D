import test from 'node:test'
import assert from 'node:assert/strict'
import {
  externalGearRatio,
  bevelGearRatio,
  wormGearRatio,
  rackTravelPerTurnStuds,
  differentialCarrierSpeed,
  differentialOtherOutput,
  universalJointOutputAngle,
  cvJointRatio,
  compoundRatio,
} from '../technic/transmission-math-v1.js'

test('Technic transmission math keeps ratio sign and magnitude explicit', () => {
  assert.equal(externalGearRatio(8, 24), -1 / 3)
  assert.equal(bevelGearRatio(12, 20), -0.6)
  assert.equal(wormGearRatio({ starts:1, wheelTeeth:24 }), -1 / 24)
  assert.ok(Math.abs(rackTravelPerTurnStuds(16) - Math.PI * 2) < 1e-12)
})

test('Differential and articulated-joint helpers remain deterministic', () => {
  assert.equal(differentialCarrierSpeed(120, 60), 90)
  assert.equal(differentialOtherOutput(90, 120), 60)
  assert.equal(universalJointOutputAngle(0, Math.PI / 4), 0)
  assert.equal(cvJointRatio(), 1)
  assert.equal(compoundRatio([-0.5, -2, 0.25]), 0.25)
})
