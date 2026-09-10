import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { axialOverlapV4, createAxialOccupancyV4 } from '../connectors-v4/occupancy-v4.js'
import { approveConstraintV4, constraintTemplateV4, limitDofV4, proposeConstraintV4, validateConstraintV4 } from '../connectors-v4/constraints-v4.js'
import { nearestAxialOffsetV4, evaluateAxialOffsetV4 } from '../connectors-v4/axial-fit-v4.js'
import { finalizeConnectorIdentitiesV4 } from '../connectors-v4/identity-v4.js'
import { applyPlacementV4, connectorWorldFrameV4, solvePlacementV4 } from '../connectors-v4/placement-solver-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'

function cylinder({ gender='male', shape='R', radius=6, length=20, centered=true, caps='none', slide=true, position=[0,0,0], orientation=[1,0,0,0,1,0,0,0,1] }={}) {
  return {
    schemaVersion:4,
    family:'cylinder',
    gender,
    group:null,
    frame:{
      positionLdu:position.map(value=>value*20),
      orientation,
      positionStud:[...position],
      orientationBrickLab:[...orientation],
      axis:[-orientation[1],-orientation[4],-orientation[7]],
    },
    geometry:{sections:[{shape,radiusLdu:radius,lengthLdu:length,elastic:false}],caps,centered},
    snap:{slide},
    inheritance:{scale:'none',mirror:'cor'},
    source:{kind:'test',file:'fixture.dat',line:1,meta:'SNAP_CYL',raw:''},
  }
}

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

test('V4 axial fit keeps a long axle inside the exact valid insertion windows of an open Technic hole', () => {
  const axle=cylinder({gender:'male',shape:'A',radius:6,length:80,centered:true,caps:'none',slide:true})
  const hole=cylinder({gender:'female',shape:'R',radius:6,length:20,centered:true,caps:'none',slide:true})
  const match=matchConnectorV4(axle,hole)
  assert.equal(match.compatible,true)
  assert.equal(match.kinematicHint,'cylindrical')

  const centered=nearestAxialOffsetV4(axle,hole,0)
  assert.equal(centered.valid,true)
  assert.equal(centered.offsetLdu,0)
  assert.equal(evaluateAxialOffsetV4(axle,hole,0).valid,true)

  const far=nearestAxialOffsetV4(axle,hole,100)
  assert.equal(far.valid,true)
  assert.equal(far.clamped,true)
  assert.ok(far.offsetLdu < 50 && far.offsetLdu > 49,'minimum engagement must keep the axle actually inside the bore')
})

test('V4 female closed cap prevents a male profile from sliding through the blocked end', () => {
  const stud=cylinder({gender:'male',shape:'R',radius:6,length:4,centered:false,caps:'one',slide:false})
  const anti=cylinder({gender:'female',shape:'R',radius:6,length:20,centered:false,caps:'one',slide:false})
  assert.equal(evaluateAxialOffsetV4(stud,anti,0).valid,true)
  assert.equal(evaluateAxialOffsetV4(stud,anti,18).valid,false)
})

test('V4 final endpoint identities deduplicate identical inherited shapes and distinguish positions', () => {
  const a=cylinder({position:[0,0,0]})
  const duplicate=structuredClone(a)
  const b=cylinder({position:[1,0,0]})
  const result=finalizeConnectorIdentitiesV4('parts/example.dat',[a,duplicate,b])
  assert.equal(result.stats.input,3)
  assert.equal(result.stats.output,2)
  assert.equal(result.stats.deduplicated,1)
  assert.equal(new Set(result.connectors.map(item=>item.endpointId)).size,2)
  assert.ok(result.connectors.every(item=>item.endpointId.startsWith('v4:parts/example.dat:')))
})

test('V4 placement solver makes matched connector world positions and axes coincide without modifying the target', () => {
  const moving=new THREE.Object3D()
  moving.position.set(-3,1,2)
  moving.rotation.set(0.2,-0.4,0.1)
  moving.updateMatrixWorld(true)

  const target=new THREE.Object3D()
  target.position.set(4,2,-1)
  target.rotation.set(-0.1,0.3,-0.25)
  target.updateMatrixWorld(true)
  const targetPose={position:target.position.clone(),quaternion:target.quaternion.clone()}

  const male=cylinder({gender:'male',shape:'A',slide:false})
  const female=cylinder({gender:'female',shape:'A',slide:false})
  const match=matchConnectorV4(male,female)
  const solution=solvePlacementV4(moving,male,target,female,{match})
  assert.equal(solution.valid,true)
  applyPlacementV4(moving,solution)

  const a=connectorWorldFrameV4(moving,male)
  const b=connectorWorldFrameV4(target,female)
  assert.ok(a.position.distanceTo(b.position)<1e-8)
  assert.ok(a.axis.dot(b.axis)>1-1e-8,'LDCad cylinder frames mate with the same local negative-Y direction')
  assert.ok(target.position.distanceTo(targetPose.position)<1e-12)
  assert.ok(1-Math.abs(target.quaternion.dot(targetPose.quaternion))<1e-12)
})
