import test from 'node:test'
import assert from 'node:assert/strict'

import { CONNECTION_SCHEMA_VERSION_V4, createConnectionGraphV4, createConnectionProposalV4 } from '../connectors-v4/connections-v4.js'

function endpoint({id,gender,length=80,centered=true,shape='A'}={}) {
  return {
    schemaVersion:4,
    endpointId:id,
    family:'cylinder',gender,group:null,
    frame:{positionLdu:[0,0,0],orientation:[1,0,0,0,1,0,0,0,1]},
    geometry:{sections:[{shape,radiusLdu:6,lengthLdu:length,elastic:false}],caps:'none',centered},
    snap:{slide:true},inheritance:{scale:'none',mirror:'cor'},source:{kind:'test'},
  }
}

function object(instanceId,partId) { return {userData:{instanceId,partId}} }

function candidate({femaleId='hole-A',femaleInstance='beam-A',offsetLdu=0}={}) {
  const male=endpoint({id:'axle-profile',gender:'male',length:80,shape:'A'})
  const female=endpoint({id:femaleId,gender:'female',length:20,shape:'R'})
  return {
    source:male,target:female,
    sourceObject:object('axle-1','ldraw-3705'),
    targetObject:object(femaleInstance,'ldraw-beam'),
    match:{compatible:true,family:'cylinder',reason:'a-round',keyed:false,rotationalSymmetry:Infinity,editorMotion:{axialSlide:true,freeTwist:true},kinematicHint:'cylindrical',physicsReady:false},
    solution:{valid:true,solverVersion:'fixture',placementMode:'aligned',axial:{offsetLdu},diagnostics:{}},
  }
}

test('V4 connection proposal reserves only the female-overlap interval on a long male axle',()=>{
  const proposal=createConnectionProposalV4(candidate({offsetLdu:-25}))
  assert.equal(proposal.schemaVersion,CONNECTION_SCHEMA_VERSION_V4)
  assert.equal(proposal.physicsReady,false)
  assert.equal(proposal.constraint.physicsReady,false)
  assert.deepEqual(proposal.occupancy.interval,[15,35])
  assert.equal(proposal.occupancy.channelKey,'axle-1::axle-profile')
  assert.deepEqual(proposal.exclusiveEndpointKeys,['beam-A::hole-A'])
})

test('V4 graph allows multiple non-overlapping uses of one axle endpoint',()=>{
  const graph=createConnectionGraphV4()
  const left=createConnectionProposalV4(candidate({femaleId:'hole-left',femaleInstance:'beam-left',offsetLdu:25}))
  const right=createConnectionProposalV4(candidate({femaleId:'hole-right',femaleInstance:'beam-right',offsetLdu:-25}))
  assert.deepEqual(left.occupancy.interval,[-35,-15])
  assert.deepEqual(right.occupancy.interval,[15,35])
  assert.equal(graph.add(left).accepted,true)
  assert.equal(graph.add(right).accepted,true)
  assert.equal(graph.stats().connections,2)
  assert.equal(graph.stats().axialChannels,1)
  assert.equal(graph.axialReservations('axle-1::axle-profile').length,2)
})

test('V4 graph rejects an overlapping third part on the same axle but keeps touching boundaries legal',()=>{
  const graph=createConnectionGraphV4()
  const a=createConnectionProposalV4(candidate({femaleId:'a',femaleInstance:'A',offsetLdu:20})) // [-30,-10]
  const b=createConnectionProposalV4(candidate({femaleId:'b',femaleInstance:'B',offsetLdu:0}))  // [-10,10], touches a
  const c=createConnectionProposalV4(candidate({femaleId:'c',femaleInstance:'C',offsetLdu:5}))  // [-15,5], overlaps both
  assert.equal(graph.add(a).accepted,true)
  assert.equal(graph.add(b).accepted,true)
  const blocked=graph.add(c)
  assert.equal(blocked.accepted,false)
  assert.equal(blocked.reason,'occupied')
  assert.ok(blocked.conflicts.some(conflict=>conflict.type==='axial-overlap'))
  assert.equal(graph.stats().connections,2)
})

test('V4 graph keeps female holes exclusive even if a proposed shaft interval would otherwise fit',()=>{
  const graph=createConnectionGraphV4()
  const first=createConnectionProposalV4(candidate({femaleId:'same-hole',femaleInstance:'beam',offsetLdu:25}))
  assert.equal(graph.add(first).accepted,true)
  const second={
    ...createConnectionProposalV4(candidate({femaleId:'same-hole',femaleInstance:'beam',offsetLdu:-25})),
    id:'v4conn:synthetic-second-shaft',
    occupancy:{...first.occupancy,channelKey:'other-axle::profile',interval:[15,35]},
  }
  const blocked=graph.add(second)
  assert.equal(blocked.accepted,false)
  assert.ok(blocked.conflicts.some(conflict=>conflict.type==='exclusive-endpoint'))
})

test('V4 graph releases both exclusivity and axial reservation when a connection is removed',()=>{
  const graph=createConnectionGraphV4()
  const proposal=createConnectionProposalV4(candidate({offsetLdu:0}))
  assert.equal(graph.add(proposal).accepted,true)
  assert.equal(graph.endpointOwner('beam-A','hole-A'),proposal.id)
  assert.equal(graph.axialReservations('axle-1::axle-profile').length,1)
  assert.equal(graph.remove(proposal.id),true)
  assert.equal(graph.endpointOwner('beam-A','hole-A'),null)
  assert.equal(graph.axialReservations('axle-1::axle-profile').length,0)
})
