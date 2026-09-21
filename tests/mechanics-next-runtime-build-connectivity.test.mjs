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

test('unknown-role parts with valid endpoints can hand off BUILD and create a graph link',async()=>{
  const unknownPin={
    id:'fixture-unknown-pin',
    name:'Fixture Alpha',
    connectors:[{id:'pin',type:'pin',position:[0,0,0],axis:[0,1,0]}],
  }
  const unknownHole={
    id:'fixture-unknown-hole',
    name:'Fixture Beta',
    connectors:[{id:'hole',type:'pin-hole',position:[0,0,0],axis:[0,1,0]}],
  }
  const byPart=new Map([[unknownPin.id,unknownPin],[unknownHole.id,unknownHole]])
  const root=new THREE.Group()
  const objects=new Map()
  for(const item of [
    {instanceId:'unknown-pin-i',partId:unknownPin.id,position:[0.18,0.1,0]},
    {instanceId:'unknown-hole-i',partId:unknownHole.id,position:[0,0,0]},
  ]){
    const object=new THREE.Object3D()
    object.userData={instanceId:item.instanceId,partId:item.partId}
    object.position.fromArray(item.position)
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
    parts:{list:()=>[unknownPin,unknownHole],get:id=>byPart.get(String(id))??null},
    editor:{
      ready:()=>true,
      objects:()=>[...objects.values()],
      objectById:id=>objects.get(String(id))??null,
      projectState:()=>({connections:[]}),
    },
  }
  const runtime=createMechanicsNextRuntime({globals,subsystems})
  runtime.syncScene()

  assert.equal(runtime.status().scene.roles.unknown,2)
  const prepared=await runtime.prepareMigration()
  assert.equal(
    prepared.pass,
    true,
    `unknown role must not block native BUILD: ${JSON.stringify(prepared.blockers)}`,
  )
  const adopted=runtime.adoptNativeProjectOwnership()
  assert.equal(adopted.accepted,true)
  assert.equal(runtime.nativeProjectAuthoritative(),true)
  assert.equal(globals.BrickLabMechanicsNextBuildOwner?.active,true)

  const candidate=runtime.findCandidate('unknown-pin-i',['unknown-hole-i'],{
    captureDistanceStud:1,
    minAxisAlignment:.55,
  })
  assert.ok(candidate,'native candidate must be reachable after BUILD handoff')
  assert.equal(candidate.connectionEligible,true)
  const committed=await runtime.commitCandidate(candidate)
  assert.equal(committed.accepted,true)
  assert.equal(runtime.projectConnections().length,1)
  assert.equal(runtime.projectConnections()[0].kind,'revolute')
})



test('current-pose auto-link commit creates native link without moving either part',()=>{
  const {runtime,objects}=createHarness(
    [pinDef,pinHoleDef],
    [
      {instanceId:'auto-pin-i',partId:pinDef.id,position:[.01,.1,0]},
      {instanceId:'auto-hole-i',partId:pinHoleDef.id,position:[0,0,0]},
    ],
  )
  const pin=objects.get('auto-pin-i')
  const hole=objects.get('auto-hole-i')
  const beforePin={
    position:pin.position.toArray(),
    quaternion:pin.quaternion.toArray(),
    scale:pin.scale.toArray(),
  }
  const beforeHole={
    position:hole.position.toArray(),
    quaternion:hole.quaternion.toArray(),
    scale:hole.scale.toArray(),
  }

  const candidate=runtime.findCandidate('auto-pin-i',['auto-hole-i'],{
    captureDistanceStud:.08,
    minAxisAlignment:.55,
  })
  assert.ok(candidate)
  assert.ok(candidate.solution.diagnostics.translationStud<=.015)

  const committed=runtime.commitCurrentPoseCandidate(candidate)
  assert.equal(committed.accepted,true)
  assert.equal(committed.currentPose,true)
  assert.equal(runtime.projectConnections().length,1)
  assert.deepEqual(pin.position.toArray(),beforePin.position)
  assert.deepEqual(pin.quaternion.toArray(),beforePin.quaternion)
  assert.deepEqual(pin.scale.toArray(),beforePin.scale)
  assert.deepEqual(hole.position.toArray(),beforeHole.position)
  assert.deepEqual(hole.quaternion.toArray(),beforeHole.quaternion)
  assert.deepEqual(hole.scale.toArray(),beforeHole.scale)
})

test('current-pose auto-link refuses a contact that would require visible movement',()=>{
  const {runtime,objects}=createHarness(
    [pinDef,pinHoleDef],
    [
      {instanceId:'far-pin-i',partId:pinDef.id,position:[.05,.1,0]},
      {instanceId:'far-hole-i',partId:pinHoleDef.id,position:[0,0,0]},
    ],
  )
  const pin=objects.get('far-pin-i')
  const before=pin.position.toArray()
  const candidate=runtime.findCandidate('far-pin-i',['far-hole-i'],{
    captureDistanceStud:.08,
    minAxisAlignment:.55,
  })
  assert.ok(candidate)
  const committed=runtime.commitCurrentPoseCandidate(candidate)
  assert.equal(committed.accepted,false)
  assert.equal(committed.reason,'current-pose-outside-safe-contact')
  assert.equal(runtime.projectConnections().length,0)
  assert.deepEqual(pin.position.toArray(),before)
})
