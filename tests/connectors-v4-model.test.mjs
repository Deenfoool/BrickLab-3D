import test from 'node:test'
import assert from 'node:assert/strict'

import { axialOverlapV4, createAxialOccupancyV4 } from '../connectors-v4/occupancy-v4.js'
import { approveConstraintV4, constraintTemplateV4, limitDofV4, proposeConstraintV4, validateConstraintV4 } from '../connectors-v4/constraints-v4.js'

test('V4 axial occupancy treats touching boundaries as legal but interior overlap as a conflict', () => {
  assert.deepEqual(axialOverlapV4([0, 1], [1, 2]), { overlaps:false, touches:true, interval:null, length:0 })
  const overlap = axialOverlapV4([0, 1.5], [1, 2])
  assert.equal(overlap.overlaps, true)
  assert.deepEqual(overlap.interval, [1, 1.5])
  assert.equal(overlap.length, 0.5)
})

test('V4 occupancy can reserve multiple non-overlapping regions on one shaft channel', () => {
  const occupancy = createAxialOccupancyV4()
  assert.equal(occupancy.reserve('axle:A', { connectionId:'beam-1', interval:[1,2] }).accepted, true)
  assert.equal(occupancy.reserve('axle:A', { connectionId:'gear-1', interval:[3,4] }).accepted, true)
  assert.equal(occupancy.reserve('axle:A', { connectionId:'beam-2', interval:[2,3] }).accepted, true)

  const blocked = occupancy.reserve('axle:A', { connectionId:'wheel-1', interval:[1.5,2.5] })
  assert.equal(blocked.accepted, false)
  assert.equal(blocked.conflicts.length, 2)
  assert.deepEqual(occupancy.freeIntervals('axle:A', [0,5]), [[0,1],[4,5]])
})

test('V4 occupancy reservations are connection-addressable and deterministic', () => {
  const occupancy = createAxialOccupancyV4()
  occupancy.reserve('bar:X', { connectionId:'clip-a', occupantId:'clip', interval:[4,5] })
  occupancy.reserve('bar:X', { connectionId:'clip-b', occupantId:'clip', interval:[1,2] })
  assert.deepEqual(occupancy.query('bar:X').map(item => item.connectionId), ['clip-b','clip-a'])
  assert.equal(occupancy.releaseConnection('clip-b'), 1)
  assert.deepEqual(occupancy.query('bar:X').map(item => item.connectionId), ['clip-a'])
})

test('V4 geometry matches only create non-physical constraint proposals', () => {
  const proposal = proposeConstraintV4({ compatible:true, kinematicHint:'cylindrical', reason:'axle-round' })
  assert.ok(proposal)
  assert.equal(proposal.status, 'candidate')
  assert.equal(proposal.physicsReady, false)
  assert.equal(proposal.dof.ty.state, 'free')
  assert.equal(proposal.dof.ry.state, 'free')
  assert.equal(proposal.dof.tx.state, 'locked')
  assert.equal(validateConstraintV4(proposal).valid, true)
})

test('V4 cannot approve physics without explicit evidence', () => {
  const proposal = proposeConstraintV4({ compatible:true, kinematicHint:'revolute', reason:'fingers' })
  assert.throws(() => approveConstraintV4(proposal), /evidence source/i)

  const approved = approveConstraintV4(proposal, {
    source:'bricklab:test-explicit-rule',
    kind:'revolute',
    friction:{ model:'test-only' },
  })
  assert.equal(approved.status, 'approved')
  assert.equal(approved.physicsReady, true)
  assert.equal(approved.dof.ry.state, 'free')
  assert.equal(approved.evidence.source, 'bricklab:test-explicit-rule')
  assert.equal(validateConstraintV4(approved).valid, true)
})

test('V4 limited DOF requires ordered finite bounds', () => {
  const revolute = constraintTemplateV4('revolute')
  const limited = limitDofV4(revolute, 'ry', -Math.PI / 4, Math.PI / 4)
  assert.deepEqual(limited.ry, { state:'limited', limits:[-Math.PI / 4, Math.PI / 4] })
  assert.throws(() => limitDofV4(revolute, 'ry', 2, -2), /limits/i)
})
