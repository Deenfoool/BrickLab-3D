import test from 'node:test'
import assert from 'node:assert/strict'

import { createNativeShadowResolver } from '../mechanics-next/ldraw/shadow-resolver.js'
import { ldcadConnectorToEndpoint } from '../mechanics-next/ldraw/connector-adapter.js'
import { enrichEndpointSemantics } from '../mechanics-next/intelligence/endpoint-semantics.js'
import { matchMechanicalEndpoints } from '../mechanics-next/connectors/profile-matcher.js'
import { findMechanicalCandidates } from '../mechanics-next/connectors/candidate-search.js'
import { worldConnectorFrame } from '../mechanics-next/connectors/world-frame.js'
import { quatFromUnitVectors } from '../mechanics-next/math/rigid.js'
import { createPartMechanicalDescriptor, instantiatePartMechanicalDescriptor } from '../mechanics-next/intelligence/part-descriptor.js'
import { interpretObservedConnection } from '../mechanics-next/intelligence/connection-interpreter.js'

const files=new Map([
  ['parts/3701.dat',[
    '0 LDCad shadow info for "Technic Brick 1 x 4 with Holes"',
    '0 !LDCAD SNAP_INCL [ref=connhole.dat] [pos=0 10 0] [ori=1 0 0 0 0 1 0 -1 0] [grid=C 3 1 20 0]',
  ].join('\n')],
  ['p/connhole.dat','0 !LDCAD SNAP_CYL [id=connhole] [gender=F] [caps=none] [secs=R 8 2   R 6 16   R 8 2] [center=true] [slide=true]'],
  ['parts/3673.dat',[
    '0 LDCad shadow info for "Technic Pin"',
    '0 !LDCAD SNAP_CLEAR',
    '0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2   R 6 16   R 8 4   R 6 16   _L 6.25 2] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]',
  ].join('\n')],
  ['parts/3705.dat','0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 80] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]'],
  ['parts/43093.dat',[
    '0 LDCad shadow info for "Technic Axle Pin with Friction"',
    '0 !LDCAD SNAP_CLEAR',
    '0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2   R 6 16   R 8 2   A 6 20] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]',
  ].join('\n')],
  ['parts/32269.dat',[
    '0 LDCad shadow info for "Technic Gear 20 Tooth Double Bevel"',
    '0 !LDCAD SNAP_CLEAR',
    '0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true] [ori=1 0 0 0 0 1 0 -1 0]',
  ].join('\n')],
])

const endpoint=(connector,bodyId)=>enrichEndpointSemantics(ldcadConnectorToEndpoint(connector,{bodyId,partId:bodyId}))

function candidateRecordPair(source,target){
  const targetPose={position:[0,0,0],quaternion:[0,0,0,1]}
  const targetFrame=worldConnectorFrame(targetPose,target)
  const sourceAtIdentity=worldConnectorFrame({position:[0,0,0],quaternion:[0,0,0,1]},source)
  const quaternion=quatFromUnitVectors(sourceAtIdentity.axis,targetFrame.axis)
  const sourceAfterRotation=worldConnectorFrame({position:[0,0,0],quaternion},source)
  const movingPose={
    position:[
      targetFrame.position[0]-sourceAfterRotation.position[0],
      targetFrame.position[1]-sourceAfterRotation.position[1],
      targetFrame.position[2]-sourceAfterRotation.position[2],
    ],
    quaternion,
  }
  return{
    moving:{
      instance:{body:{id:'moving-body',instanceId:'moving-instance'},endpoints:[source]},
      pose:movingPose,
      visualOffsetStud:[0,0,0],
    },
    target:{
      instance:{body:{id:'target-body',instanceId:'target-instance'},endpoints:[target]},
      pose:targetPose,
      visualOffsetStud:[0,0,0],
    },
  }
}

test('native Shadow resolver finds primitive p/ includes used by real Technic holes',async()=>{
  const requests=[]
  const resolver=createNativeShadowResolver({
    fetchShadowText:async path=>{
      requests.push(path)
      return files.get(path)??null
    },
  })
  const brick=await resolver.resolve('parts/3701.dat')
  assert.equal(brick.connectors.length,3)
  assert.ok(requests.includes('p/connhole.dat'))
  assert.ok(brick.connectors.every(connector=>connector.family==='cylinder'&&connector.gender==='female'))
  const endpoints=brick.connectors.map((connector,index)=>
    endpoint(connector,`brick-body-${index}`))
  assert.equal(new Set(endpoints.map(item=>item.id)).size,3)
})

test('real LDCad Technic pin profile matches inherited connhole receiver',async()=>{
  const resolver=createNativeShadowResolver({fetchShadowText:async path=>files.get(path)??null})
  const [pin,brick]=await Promise.all([
    resolver.resolve('parts/3673.dat'),
    resolver.resolve('parts/3701.dat'),
  ])
  const male=endpoint(pin.connectors.find(item=>item.gender==='male'),'pin-body')
  const female=endpoint(brick.connectors[0],'brick-body')
  assert.equal(male.metadata.semantics.semanticKind,'technic-pin')
  assert.equal(female.metadata.semantics.semanticKind,'technic-pin-hole')
  const match=matchMechanicalEndpoints(male,female)
  assert.equal(match.compatible,true)
  assert.equal(match.interfaceRule?.kind,'revolute')
})

test('real LDCad A6 axle profile matches inherited Technic round hole',async()=>{
  const resolver=createNativeShadowResolver({fetchShadowText:async path=>files.get(path)??null})
  const [axle,brick]=await Promise.all([
    resolver.resolve('parts/3705.dat'),
    resolver.resolve('parts/3701.dat'),
  ])
  const male=endpoint(axle.connectors[0],'axle-body')
  const female=endpoint(brick.connectors[0],'brick-body')
  assert.equal(male.metadata.semantics.semanticKind,'technic-axle')
  assert.equal(female.metadata.semantics.semanticKind,'technic-pin-hole')
  const match=matchMechanicalEndpoints(male,female)
  assert.equal(match.compatible,true)
  assert.equal(match.interfaceRule?.kind,'cylindrical')
})


test('grid-expanded Technic holes keep unique endpoint IDs inside one part instance',async()=>{
  const resolver=createNativeShadowResolver({fetchShadowText:async path=>files.get(path)??null})
  const brick=await resolver.resolve('parts/3701.dat')
  const endpoints=brick.connectors.map(connector=>endpoint(connector,'same-brick-body'))
  assert.equal(endpoints.length,3)
  assert.equal(new Set(endpoints.map(item=>item.id)).size,3)
})


test('real Technic pin and axle profiles produce BUILD placement candidates',async()=>{
  const resolver=createNativeShadowResolver({fetchShadowText:async path=>files.get(path)??null})
  const [pin,axle,brick]=await Promise.all([
    resolver.resolve('parts/3673.dat'),
    resolver.resolve('parts/3705.dat'),
    resolver.resolve('parts/3701.dat'),
  ])
  const hole=endpoint(brick.connectors[1],'target-body')

  for(const [label,source] of [
    ['pin',endpoint(pin.connectors.find(item=>item.gender==='male'),'moving-body')],
    ['axle',endpoint(axle.connectors[0],'moving-body')],
  ]){
    const pair=candidateRecordPair(source,hole)
    const candidates=findMechanicalCandidates({
      moving:pair.moving,
      targets:[pair.target],
      captureDistanceStud:1,
      minAxisAlignment:.55,
    })
    assert.ok(candidates.length>0,`${label} should produce a native BUILD candidate`)
    assert.equal(candidates[0].connectionEligible,true)
    assert.ok(candidates[0].solution?.valid)
  }
})


test('real Technic Axle Pin acts as pin or axle according to the receiver',async()=>{
  const resolver=createNativeShadowResolver({fetchShadowText:async path=>files.get(path)??null})
  const [axlePin,brick,gear]=await Promise.all([
    resolver.resolve('parts/43093.dat'),
    resolver.resolve('parts/3701.dat'),
    resolver.resolve('parts/32269.dat'),
  ])
  const mixed=endpoint(axlePin.connectors[0],'mixed-body')
  assert.equal(mixed.metadata.semantics.semanticKind,'technic-axle-pin')

  const pinHole=endpoint(brick.connectors[0],'pin-hole-body')
  const pinMatch=matchMechanicalEndpoints(mixed,pinHole)
  assert.equal(pinMatch.compatible,true)
  assert.equal(pinMatch.interfaceRule?.kind,'revolute')
  assert.deepEqual(pinMatch.interfacePair,['technic-pin','technic-hole'])

  const axleHole=endpoint(gear.connectors[0],'axle-hole-body')
  const axleMatch=matchMechanicalEndpoints(mixed,axleHole)
  assert.equal(axleMatch.compatible,true)
  assert.equal(axleMatch.interfaceRule?.kind,'prismatic')
  assert.deepEqual(axleMatch.interfacePair,['axle','axle-hole'])

  for(const [label,target] of [['pin-hole',pinHole],['axle-hole',axleHole]]){
    const pair=candidateRecordPair(mixed,target)
    const candidates=findMechanicalCandidates({
      moving:pair.moving,
      targets:[pair.target],
      captureDistanceStud:1,
      minAxisAlignment:.55,
    })
    assert.ok(candidates.length>0,`Technic Axle Pin should snap into ${label}`)
    assert.equal(candidates[0].connectionEligible,true)
  }
})


test('full descriptor instantiation preserves all real Technic hole identities',async()=>{
  const resolver=createNativeShadowResolver({fetchShadowText:async path=>files.get(path)??null})
  const brick=await resolver.resolve('parts/3701.dat')
  const templateBodyId='template-brick'
  const endpoints=brick.connectors.map(connector=>endpoint(connector,templateBodyId))
  const descriptor=createPartMechanicalDescriptor({
    observation:{
      id:'ldraw-3701',
      name:'Technic Brick 1 x 4 with Holes',
      description:'Technic Brick 1 x 4 with Holes',
      tags:['technic'],
      ldraw:{code:'3701',file:'3701.dat'},
    },
    endpoints,
  })
  assert.equal(descriptor.endpoints.length,3)
  assert.equal(new Set(descriptor.endpoints.map(item=>item.templateKey)).size,3)

  const first=instantiatePartMechanicalDescriptor(descriptor,{instanceId:'brick-instance-a'})
  const second=instantiatePartMechanicalDescriptor(descriptor,{instanceId:'brick-instance-b'})
  assert.equal(new Set(first.endpoints.map(item=>item.id)).size,3)
  assert.equal(new Set(second.endpoints.map(item=>item.id)).size,3)
  assert.equal(
    first.endpoints.some(left=>second.endpoints.some(right=>left.id===right.id)),
    false,
  )
})


test('mixed Axle Pin survives connection interpretation after placement',async()=>{
  const resolver=createNativeShadowResolver({fetchShadowText:async path=>files.get(path)??null})
  const [axlePin,brick,gear]=await Promise.all([
    resolver.resolve('parts/43093.dat'),
    resolver.resolve('parts/3701.dat'),
    resolver.resolve('parts/32269.dat'),
  ])
  const makeInstance=(instanceId,partId,endpoints)=>({
    body:{id:`body-${instanceId}`,instanceId,partId},
    descriptor:{classification:{role:'connector',properties:{}}},
    endpoints,
  })
  const mixed=endpoint(axlePin.connectors[0],'body-mixed')
  const pinHole=endpoint(brick.connectors[0],'body-pin-hole')
  const axleHole=endpoint(gear.connectors[0],'body-axle-hole')
  const instances=new Map([
    ['mixed',makeInstance('mixed','ldraw-43093',[mixed])],
    ['pin-hole',makeInstance('pin-hole','ldraw-3701',[pinHole])],
    ['axle-hole',makeInstance('axle-hole','ldraw-32269',[axleHole])],
  ])
  const sceneObserver={instance:id=>instances.get(id)??null}
  const identityObject=()=>({
    children:[],
    matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},
    updateWorldMatrix(){},
  })
  const objects=new Map([...instances.keys()].map(id=>[id,identityObject()]))
  const interpret=(targetId,targetEndpoint,id)=>interpretObservedConnection({
    id,
    a:{instanceId:'mixed',endpointId:mixed.id},
    b:{instanceId:targetId,endpointId:targetEndpoint.id},
    match:{family:'cylinder'},
  },{
    sceneObserver,
    objectById:id=>objects.get(id),
  })

  const pin=interpret('pin-hole',pinHole,'mixed-to-pin')
  assert.equal(pin.valid,true)
  assert.equal(pin.type,'constraint')
  assert.equal(pin.constraint.kind,'revolute')
  assert.deepEqual(pin.constraint.metadata.interfacePair,['technic-pin','technic-hole'])

  const axle=interpret('axle-hole',axleHole,'mixed-to-axle')
  assert.equal(axle.valid,true)
  assert.equal(axle.type,'constraint')
  assert.equal(axle.constraint.kind,'prismatic')
  assert.deepEqual(axle.constraint.metadata.interfacePair,['axle','axle-hole'])
})
