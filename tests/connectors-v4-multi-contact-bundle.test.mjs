import test from 'node:test'
import assert from 'node:assert/strict'
import { createConnectionGraphV4 } from '../connectors-v4/connections-v4.js'
import { commitAlignedAxialContactsV4 } from '../connectors-v4/multi-contact-bridge-v4.js'

function graphProposal(id,channelKey,interval,femaleKey){
  return{
    schemaVersion:4,
    graphVersion:'connection-graph-v4.0.1',
    id,
    status:'candidate',
    placementOnly:false,
    physicsReady:false,
    a:{instanceId:'shaft',partId:'shaft-part',endpointId:'male',family:'cylinder',gender:'male'},
    b:{instanceId:femaleKey,partId:`part-${femaleKey}`,endpointId:'hole',family:'cylinder',gender:'female'},
    match:{family:'cylinder',reason:'fixture',keyed:false,rotationalSymmetry:Infinity,editorMotion:{}},
    placement:{solverVersion:'fixture',axialOffsetLdu:0,placementMode:'aligned'},
    constraint:{kind:'cylindrical'},
    occupancy:{channelKey,maleEndpointId:'male',femaleEndpointId:'hole',interval,maleSpan:[-30,30],femaleSpan:[-10,10],maleOffsetLdu:0},
    occupancyReady:true,
    exclusiveEndpointKeys:[`${femaleKey}::hole`],
    provenance:{a:null,b:null},
    metadata:null,
  }
}

test('one long male endpoint accepts multiple distinct non-overlapping receivers',()=>{
  const graph=createConnectionGraphV4()
  const first=graphProposal('c1','shaft::male',[-30,-10],'red-beam')
  const second=graphProposal('c2','shaft::male',[10,30],'green-connector')
  assert.equal(graph.add(first).accepted,true)
  assert.equal(graph.add(second).accepted,true)
  assert.equal(graph.list().length,2)
  assert.equal(graph.axialReservations('shaft::male').length,2)
})

test('same long male endpoint still rejects physically overlapping receiver intervals',()=>{
  const graph=createConnectionGraphV4()
  assert.equal(graph.add(graphProposal('c1','shaft::male',[-20,5],'red-beam')).accepted,true)
  const result=graph.add(graphProposal('c2','shaft::male',[0,20],'green-connector'))
  assert.equal(result.accepted,false)
  assert.ok(result.conflicts.length>0)
})

test('aligned pin/axle bundle commits every already-aligned axial contact',()=>{
  const sourceObject={userData:{instanceId:'blue-pin-axle'}}
  const targets=[{id:'red'},{id:'green'}]
  const queue=[
    {proposal:{id:'red-link'},certification:{activation:{family:'technic-pin-hole'}},solution:{diagnostics:{captureCorrectionStud:0,rotationRad:0}}},
    {proposal:{id:'green-link'},certification:{activation:{family:'technic-axle-keyed-hole'}},solution:{diagnostics:{captureCorrectionStud:0,rotationRad:0}}},
  ]
  const committed=[]
  const v4={
    findActiveCandidate(){return queue.shift()??null},
    commitActiveCandidate(candidate){committed.push(candidate.proposal.id);return{accepted:true,connection:{id:candidate.proposal.id}}},
  }
  const result=commitAlignedAxialContactsV4(v4,sourceObject,targets)
  assert.deepEqual(committed,['red-link','green-link'])
  assert.deepEqual(result.committed,['red-link','green-link'])
  assert.equal(result.attempted,2)
})

test('bundle does not pull a merely nearby contact into place',()=>{
  const sourceObject={userData:{instanceId:'blue-pin-axle'}}
  let commits=0
  const v4={
    findActiveCandidate(){return{proposal:{id:'nearby'},certification:{activation:{family:'technic-pin-hole'}},solution:{diagnostics:{captureCorrectionStud:0.02,rotationRad:0}}}},
    commitActiveCandidate(){commits+=1;return{accepted:true,connection:{id:'nearby'}}},
  }
  const result=commitAlignedAxialContactsV4(v4,sourceObject,[{id:'target'}])
  assert.equal(commits,0)
  assert.deepEqual(result.committed,[])
  assert.equal(result.stopped,'not-already-aligned')
})
