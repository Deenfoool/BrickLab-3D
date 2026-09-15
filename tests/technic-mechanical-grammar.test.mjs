import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TECHNIC_INTERFACE_KINDS,
  TECHNIC_MATE_RULES,
  TECHNIC_TRANSMISSION_KINDS,
  TECHNIC_SUPPORT_RULES,
  technicMateRule,
  technicSpurPitchRadiusStuds,
  technicSpurCenterDistanceStuds,
  technicExternalGearVelocityRatio,
} from '../technic/mechanical-grammar-v1.js'

test('Technic grammar distinguishes keyed shaft coupling from round bearing support', () => {
  const keyed = technicMateRule(TECHNIC_INTERFACE_KINDS.AXLE, TECHNIC_INTERFACE_KINDS.AXLE_HOLE)
  const bearing = technicMateRule(TECHNIC_INTERFACE_KINDS.AXLE, TECHNIC_INTERFACE_KINDS.ROUND_BEARING)

  assert.equal(keyed?.semanticRole, 'keyed-shaft-coupling')
  assert.equal(keyed?.runtimeAngularDof, 'locked')
  assert.equal(keyed?.transmitsTorque, true)

  assert.equal(bearing?.semanticRole, 'bearing')
  assert.equal(bearing?.runtimeAngularDof, 'free')
  assert.equal(bearing?.transmitsTorque, false)
})

test('Technic pin friction is not modeled as a fixed weld', () => {
  const pin = technicMateRule('technic-pin', 'technic-pin-hole')
  assert.equal(pin?.constraint, 'revolute')
  assert.equal(pin?.runtimeAngularDof, 'free-with-friction')
  assert.equal(pin?.transmitsTorque, false)
})

test('Classic Technic spur pitch convention matches canonical lattice gear pairs', () => {
  assert.equal(technicSpurPitchRadiusStuds(8), 0.5)
  assert.equal(technicSpurPitchRadiusStuds(16), 1)
  assert.equal(technicSpurPitchRadiusStuds(24), 1.5)
  assert.equal(technicSpurPitchRadiusStuds(40), 2.5)

  assert.equal(technicSpurCenterDistanceStuds(8, 24), 2)
  assert.equal(technicSpurCenterDistanceStuds(16, 16), 2)
  assert.equal(technicSpurCenterDistanceStuds(24, 40), 4)
})

test('External Technic spur ratio carries magnitude and opposite rotation sign', () => {
  assert.equal(technicExternalGearVelocityRatio(8, 40), -0.2)
  assert.equal(technicExternalGearVelocityRatio(40, 8), -5)
  assert.equal(technicExternalGearVelocityRatio(16, 16), -1)
})

test('Technic grammar names advanced transmissions without pretending they are already certified', () => {
  assert.equal(TECHNIC_TRANSMISSION_KINDS.SPUR.status, 'implemented')
  assert.equal(TECHNIC_TRANSMISSION_KINDS.BEVEL.status, 'implemented')
  assert.equal(TECHNIC_TRANSMISSION_KINDS.DIFFERENTIAL.status, 'partial')
  assert.equal(TECHNIC_TRANSMISSION_KINDS.WORM.status, 'research-required')
  assert.equal(TECHNIC_TRANSMISSION_KINDS.RACK.status, 'research-required')
  assert.equal(TECHNIC_TRANSMISSION_KINDS.CHAIN_SPROCKET.status, 'research-required')
})

test('Technic grammar includes support semantics, not only local connector compatibility', () => {
  assert.ok(TECHNIC_SUPPORT_RULES.SHAFT_SUPPORT)
  assert.ok(TECHNIC_SUPPORT_RULES.AXIAL_RETENTION)
  assert.ok(TECHNIC_SUPPORT_RULES.GEAR_SUPPORT)
  assert.ok(TECHNIC_SUPPORT_RULES.FRAME_CLOSURE)
  assert.ok(TECHNIC_SUPPORT_RULES.MULTI_CONTACT_RIGIDITY)
  assert.ok(TECHNIC_MATE_RULES.length >= 6)
})
