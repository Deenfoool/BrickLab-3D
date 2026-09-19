import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { createMechanicsNextRuntime } from '../mechanics-next/runtime.js'

function createHarness(definitions,instances){
  const byPart=new Map(definitions.map(def=>[def.id,def]))
  const root=new THREE.Group()
  const objects=new Map()
  for(const item of instances){
    const object=new THREE.Object3D()
    object.userData={instanceId:item.instanceId,partId:item.partId}
    object.position.fromArray(item.position??[0,0,0])
    object.rotation.set(...(item.rotation??[0,0,0]))
    root.add(object)
    object.updateMatrixWorld(true)
    objects.set(item.instanceId,object)
  }
  const globals={
    addEventListener(){},
    dispatchEvent(){},
    BrickLabLDraw:{readText:async()=>null},
    BrickLabMechanicsNextPhysicsOwner:{createOwner:'mechanics-next-physics-owner-0.1.0'},
  }
  const subsystems={
    parts:{
      list:()=>definitions,
      get:id=>byPart.get(String(id))??null,
    },
    editor:{
      ready:()=>true,
      objects:()=>[...objects.values()],
      objectById:id=>objects.get(String(id))??null,
      projectState:()=>({connections:[]}),
    },
  }
  const runtime=createMechanicsNextRuntime({globals,subsystems})
  runtime.syncScene()
  const restored=runtime.restoreProjectState({
    schemaVersion:1,
    engine:'mechanics-next',
    connections:[],
    relations:[],
  },{replace:true})
  assert.equal(restored.rejected,0)
  assert.equal(runtime.nativeProjectAuthoritative(),true)
  return{runtime,root,objects,globals,subsystems}
}

const pinDef={
  id:'fixture-pin',
  name:'Technic Pin',
  connectors:[{id:'pin',type:'pin',position:[0,0,0],axis:[0,1,0]}],
}
const pinHoleDef={
  id:'fixture-pin-hole',
  name:'Technic Pin Hole Receiver',
  connectors:[{id:'hole',type:'pin-hole',position:[0,0,0],axis:[0,1,0]}],
}
const axleDef={
  id:'fixture-axle',
  name:'Technic Axle 2L',
  connectors:[{id:'axle',type:'axle',position:[0,0,0],axis:[0,1,0]}],
}
const axleHoleDef={
  id:'fixture-axle-hole',
  name:'Technic Axle Hole Receiver',
  connectors:[{id:'axle-hole',type:'axle-hole',position:[0,0,0],axis:[0,1,0]}],
}

test('runtime BUILD transaction commits pin into hole and releases only after invalid lateral disengagement',async()=>{
  const {runtime,objects}=createHarness(
    [pinDef,pinHoleDef],
    [
      {instanceId:'pin-i',partId:pinDef.id,position:[0.18,0.1,0]},
      {instanceId:'hole-i',partId:pinHoleDef.id,position:[0,0,0]},
    ],
  )

  const candidate=runtime.findCandidate('pin-i',['hole-i'],{
    captureDistanceStud:1,
    minAxisAlignment:.55,
  })
  assert.ok(candidate,'pin candidate should exist')
  assert.equal(candidate.connectionEligible,true)
  assert.equal(candidate.match.interfaceRule.kind,'revolute')

  const committed=await runtime.commitCandidate(candidate)
  assert.equal(committed.accepted,true)
  assert.equal(runtime.projectConnections().length,1)
  assert.equal(runtime.projectConnections()[0].kind,'revolute')
  const initialGeometry=structuredClone(runtime.exportProjectState().connections[0].geometry)

  const pin=objects.get('pin-i')
  pin.position.y+=.2
  pin.updateMatrixWorld(true)
  const retained=runtime.syncScene()
  assert.equal(retained.revalidation.released,0)
  assert.equal(runtime.projectConnections().length,1,'allowed axial engagement must retain the pin joint')
  assert.deepEqual(
    runtime.exportProjectState().connections[0].geometry,
    initialGeometry,
    'allowed BUILD motion must not rewrite the committed geometry baseline',
  )

  pin.position.x+=.5
  pin.updateMatrixWorld(true)
  const released=runtime.syncScene()
  assert.ok(released.revalidation.released>=1)
  assert.equal(runtime.projectConnections().length,0,'lateral disengagement must release the pin joint')
})

test('runtime keyed axle joint survives 90 degree symmetry but rejects 45 degree phase',async()=>{
  const {runtime,objects}=createHarness(
    [axleDef,axleHoleDef],
    [
      {instanceId:'axle-i',partId:axleDef.id,position:[0.12,0,0]},
      {instanceId:'axle-hole-i',partId:axleHoleDef.id,position:[0,0,0]},
    ],
  )

  const candidate=runtime.findCandidate('axle-i',['axle-hole-i'],{
    captureDistanceStud:1,
    minAxisAlignment:.55,
  })
  assert.ok(candidate,'axle candidate should exist')
  assert.equal(candidate.match.keyed,true)
  assert.equal(candidate.match.rotationalSymmetry,4)
  assert.equal(candidate.match.interfaceRule.kind,'prismatic')

  const committed=await runtime.commitCandidate(candidate)
  assert.equal(committed.accepted,true)
  assert.equal(runtime.projectConnections().length,1)
  const initialGeometry=structuredClone(runtime.exportProjectState().connections[0].geometry)

  const axle=objects.get('axle-i')
  axle.rotation.y+=Math.PI/2
  axle.updateMatrixWorld(true)
  const quarter=runtime.syncScene()
  assert.equal(quarter.revalidation.released,0)
  assert.equal(runtime.projectConnections().length,1,'quarter-turn keyed symmetry must remain connected')
  assert.deepEqual(
    runtime.exportProjectState().connections[0].geometry,
    initialGeometry,
    'symmetric keyed rotation must not rewrite the committed twist baseline',
  )

  axle.rotation.y+=Math.PI/4
  axle.updateMatrixWorld(true)
  const wrongPhase=runtime.syncScene()
  assert.ok(wrongPhase.revalidation.released>=1)
  assert.equal(runtime.projectConnections().length,0,'non-symmetric keyed phase must release')
})
