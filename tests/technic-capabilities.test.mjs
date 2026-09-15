import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TECHNIC_MECHANISM_CAPABILITIES,
  technicCapabilitySummaryV1,
  technicCapabilityV1,
} from '../technic/capabilities-v1.js'

test('implemented shaft and gear mechanisms are active across supported modes', () => {
  for (const kind of ['pin-joint','keyed-shaft-coupling','shaft-bearing','spur-gear','bevel-gear']) {
    const capability = technicCapabilityV1(kind)
    assert.equal(capability.recognition, 'active')
    assert.equal(capability.build, 'active')
    assert.equal(capability.kinematics, 'active')
    assert.equal(capability.simulate, 'active')
  }
})

test('rack-pinion reports deterministic Kinematics but does not overclaim generic Rapier tooth coupling', () => {
  const capability = technicCapabilityV1('rack-pinion')
  assert.equal(capability.kinematics, 'active')
  assert.equal(capability.simulate, 'metadata')
  assert.equal(capability.arbitraryLDraw, 'semantic')
})

test('uncertified advanced mechanisms remain semantic instead of fabricating physics', () => {
  for (const kind of ['linear-actuator','pneumatic','driving-ring','crown-gear','standalone-worm','chain-sprocket','pulley-belt','flex-system','engine-piston']) {
    const capability = technicCapabilityV1(kind)
    assert.equal(capability.recognition, 'active')
    assert.equal(capability.simulate, 'semantic')
  }
})

test('unknown mechanism fails closed and summary accounts for the complete registry', () => {
  assert.deepEqual(technicCapabilityV1('not-a-mechanism'), {
    recognition:'unknown', build:'unsupported', kinematics:'unsupported', simulate:'unsupported', source:'none',
  })
  const summary = technicCapabilitySummaryV1()
  assert.equal(summary.mechanisms, Object.keys(TECHNIC_MECHANISM_CAPABILITIES).length)
  assert.ok(summary.mechanisms >= 20)
})
