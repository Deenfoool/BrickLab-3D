import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { createConnectionGraphV4, createConnectionProposalV4 } from '../connectors-v4/connections-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { technicPinSlotOffsetsV4 } from '../connectors-v4/pin-slots-v4.js'

const LONG_PIN='0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2 R 6 16 R 8 4 R 6 16 _L 6.25 4 R 6 16 _L 6.25 2] [center=true] [slide=true]'
const PIN_2L='0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2 R 6 16 R 8 4 R 6 16 _L 6.25 2] [center=true] [slide=true]'
const LONG_PIN_6558='0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.5 2 R 6 16 R 8 4 R 6 16 _L 6.5 4 R 6 16 _L 6.5 2] [center=true] [slide=true]'
const STOP_PIN_32054='0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 8 2 R 6 16 _L 6.5 4 R 6 16 _L 6.5 2] [slide=true]'
const AXLE_PIN_43093='0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2 R 6 16 R 8 2 A 6 20] [center=true] [slide=true]'
const AXLE_PIN_18651='0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2 R 6 16 R 8 2 A 6 40] [center=true] [slide=true]'
const AXLE_HOLE='0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]'
const HOLE='0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=R 8 2 R 6 16 R 8 2] [center=true] [slide=true]'

function connector(meta,id){
  const value=parseShadowTextV4(meta).operations[0].connector
  value.endpointId=id
  return value
}

test('42924 long pin exposes three independent 1-module attachment bands',()=>{
  const pin=connector(LONG_PIN,'pin')
  const hole=connector(HOLE,'hole')
  assert.deepEqual(technicPinSlotOffsetsV4(hole,pin),[-20,0,20])

  const graph=createConnectionGraphV4()
  const pinObject={userData:{instanceId:'pin-42924',partId:'ldraw-42924'}}
  for(const [index,offsetLdu] of [-20,0,20].entries()){
    const holeObject={userData:{instanceId:`beam-${index}`,partId:'ldraw-beam'}}
    const source={...hole,endpointId:`hole-${index}`}
    const candidate={source,target:pin,sourceObject:holeObject,targetObject:pinObject,match:matchConnectorV4(source,pin),solution:{valid:true,solverVersion:'test',placementMode:'aligned',axial:{offsetLdu}}}
    const added=graph.add(createConnectionProposalV4(candidate))
    assert.equal(added.accepted,true,JSON.stringify(added.conflicts))
  }
  assert.equal(graph.list().length,3)
  assert.equal(graph.axialReservations('pin-42924::pin').length,3)
})

test('ordinary 2L friction pin keeps exactly two attachment bands',()=>{
  const pin=connector(PIN_2L,'pin')
  const hole=connector(HOLE,'hole')
  assert.deepEqual(technicPinSlotOffsetsV4(hole,pin),[-10,10])
  assert.deepEqual(technicPinSlotOffsetsV4(pin,hole),[-10,10])
})

test('canonical pin and axle-pin profiles expose only their physical interface bands',()=>{
  const hole=connector(HOLE,'hole')
  assert.deepEqual(technicPinSlotOffsetsV4(hole,connector(LONG_PIN_6558,'6558')),[-20,0,20])
  assert.deepEqual(technicPinSlotOffsetsV4(hole,connector(STOP_PIN_32054,'32054')),[10,30])
  const axlePin=connector(AXLE_PIN_43093,'43093')
  assert.deepEqual(technicPinSlotOffsetsV4(hole,axlePin),[-10])
  assert.deepEqual(technicPinSlotOffsetsV4(connector(AXLE_HOLE,'axle-hole'),axlePin),[10])
})

test('18651 exposes one pin band and two independent 2L axle bands',()=>{
  const hybrid=connector(AXLE_PIN_18651,'18651')
  const pinHole=connector(HOLE,'pin-hole')
  const axleHole=connector(AXLE_HOLE,'axle-hole')
  assert.deepEqual(technicPinSlotOffsetsV4(pinHole,hybrid),[-20])
  assert.deepEqual(technicPinSlotOffsetsV4(axleHole,hybrid),[0,20])
})

test('18651 accepts three simultaneous parts across its pin and axle regions',()=>{
  const hybrid=connector(AXLE_PIN_18651,'18651')
  const hybridObject={userData:{instanceId:'axle-pin-18651',partId:'ldraw-18651'}}
  const graph=createConnectionGraphV4()
  const contacts=[
    {receiver:connector(HOLE,'pin-hole'),offsetLdu:-20,instanceId:'beam-pin'},
    {receiver:connector(AXLE_HOLE,'axle-hole-a'),offsetLdu:0,instanceId:'beam-axle-a'},
    {receiver:connector(AXLE_HOLE,'axle-hole-b'),offsetLdu:20,instanceId:'beam-axle-b'},
  ]
  for(const contact of contacts){
    const receiverObject={userData:{instanceId:contact.instanceId,partId:'ldraw-beam'}}
    const candidate={source:contact.receiver,target:hybrid,sourceObject:receiverObject,targetObject:hybridObject,
      match:matchConnectorV4(contact.receiver,hybrid),solution:{valid:true,solverVersion:'test',placementMode:'aligned',axial:{offsetLdu:contact.offsetLdu}}}
    const added=graph.add(createConnectionProposalV4(candidate))
    assert.equal(added.accepted,true,JSON.stringify(added.conflicts))
  }
  assert.equal(graph.list().length,3)
  assert.equal(graph.axialReservations('axle-pin-18651::18651').length,3)
})

test('slot enumeration is limited to certified pin-hole pairs',()=>{
  const pin=connector(LONG_PIN,'pin')
  const axleHole=connector('0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]','axle-hole')
  assert.deepEqual(technicPinSlotOffsetsV4(pin,axleHole),[])
})

test('production import map publishes the occupancy-aware pin runtime',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8')
  const needle='"./connectors-v4/runtime-v4.js": "./connectors-v4/runtime-v4.js?v=runtime-10-connector-axle-pin-slots-20260916-v1"'
  assert.equal(html.split(needle).length-1,1)
})
