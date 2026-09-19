import test from 'node:test'
import assert from 'node:assert/strict'

import { createNativeShadowResolver } from '../mechanics-next/ldraw/shadow-resolver.js'
import { ldcadConnectorToEndpoint } from '../mechanics-next/ldraw/connector-adapter.js'
import { enrichEndpointSemantics } from '../mechanics-next/intelligence/endpoint-semantics.js'
import { matchMechanicalEndpoints } from '../mechanics-next/connectors/profile-matcher.js'
import { findMechanicalCandidates } from '../mechanics-next/connectors/candidate-search.js'
import { worldConnectorFrame } from '../mechanics-next/connectors/world-frame.js'
import { quatFromUnitVectors } from '../mechanics-next/math/rigid.js'
import { interpretObservedConnection } from '../mechanics-next/intelligence/connection-interpreter.js'
import { exportMechanicsProjectState } from '../mechanics-next/migration/project-state.js'
import { createLiveJointValidator } from '../mechanics-next/physics/live-joint-validator.js'

const files=new Map([
  ['p/stud.dat','0 !LDCAD SNAP_CYL [ID=studC] [gender=M] [caps=one] [secs=R 6 4]'],
  ['parts/6154.dat','0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=S 6 4] [pos=0 96 0] [grid=C 4 1 20 0]'],
  ['p/joint8ball.dat','0 !LDCAD SNAP_GEN [gender=M] [bounding=sph 8] [placement=free]'],
  ['p/joint8socket1.dat','0 !LDCAD SNAP_GEN [gender=F] [bounding=sph 8] [placement=free]'],
  ['parts/2655.dat',[
    '0 !LDCAD SNAP_CLP [radius=2] [length=4] [pos=12 14 0] [ori=0 1 0 0 0 1 1 0 0]',
    '0 !LDCAD SNAP_CLP [radius=2] [length=4] [pos=-8 14 0] [ori=0 1 0 0 0 1 1 0 0]',
    '0 !LDCAD SNAP_GEN [group=sglWhlAxle] [gender=M] [bounding=cyl 4 15] [match=group] [pos=0 14 0] [ori=0 -1 0 0 0 1 -1 0 0]',
  ].join('\n')],
  ['parts/3464b.dat','0 !LDCAD SNAP_GEN [group=sglWhlAxle] [gender=F] [bounding=cyl 4 15] [match=group] [ori=1 0 0 0 0 1 0 -1 0]'],
  ['parts/2999.dat',[
    '0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=R 23 3   R 20 4   R 18 56   _L 19 2] [slide=true] [pos=0 -31 0] [ori=0 0 1 0 -1 0 1 0 0]',
    '0 !LDCAD SNAP_GEN [group=techWhlCon1] [gender=M] [bounding=cyl 17 32] [pos=0 2 0]',
    '0 !LDCAD SNAP_GEN [gender=F] [bounding=sph 15] [pos=0 -13 0]',
  ].join('\n')],
  ['parts/s/2998a.dat','0 !LDCAD SNAP_GEN [group=techWhlCon1] [gender=F] [bounding=cyl 17 32] [pos=0 0 9] [ori=0 0 -1 1 0 0 0 -1 0]'],
  ['parts/41679.dat','0 !LDCAD SNAP_CYL [group=clkRot] [gender=M] [caps=one] [secs=R 9.5 5] [ori=1 0 0 0 -1 0 0 0 -1]'],
  ['parts/41680.dat','0 !LDCAD SNAP_CYL [group=clkRot] [gender=F] [caps=none] [secs=R 9.5 10] [center=true]'],
  ['parts/2942.dat','0 !LDCAD SNAP_CYL [group=pneuCyl] [gender=F] [caps=one] [secs=R 8 58] [slide=true] [pos=0 -78 0] [ori=-1 0 0 0 -1 0 0 0 1]'],
  ['parts/70834.dat','0 !LDCAD SNAP_CYL [group=pneuCyl] [gender=M] [caps=none] [secs=R 8 10] [pos=0 10 0]'],
  ['parts/2851.dat','0 !LDCAD SNAP_CYL [group=techEngine] [gender=M] [caps=none] [secs=R 12 24] [slide=true] [pos=0 8 0]'],
  ['parts/2850a.dat','0 !LDCAD SNAP_CYL [group=techEngine] [gender=F] [caps=none] [secs=R 12 47] [pos=0 43 0]'],
  ['parts/18938.dat','0 !LDCAD SNAP_CYL [group=techTrnTbl60] [gender=M] [caps=one] [secs=R 37 16] [pos=0 -6 0] [ori=1 0 0 0 -1 0 0 0 -1]'],
  ['parts/18939.dat','0 !LDCAD SNAP_CYL [group=techTrnTbl60] [gender=F] [caps=one] [secs=R 37 16] [pos=0 -6 0] [ori=1 0 0 0 -1 0 0 0 -1]'],
  ['parts/41895.dat','0 !LDCAD SNAP_GEN [group=steerHub1] [gender=M] [bounding=cyl 8 15]'],
  ['parts/41894.dat','0 !LDCAD SNAP_GEN [group=steerHub1] [gender=F] [bounding=cyl 8 15] [pos=100 -20 0] [ori=0 0 -1 0 1 0 1 0 0]'],
  ['parts/6538a.dat','0 !LDCAD SNAP_CYL [group=drivingRing1] [gender=M] [caps=none] [secs=A 9 9   A 10 2   A 9 8   A 10 2   A 9 8   A 10 2   A 9 9] [center=true] [slide=true] [ori=1 0 0 0 0 -1 0 1 0]'],
  ['parts/6539.dat','0 !LDCAD SNAP_CYL [group=drivingRing1] [gender=F] [caps=none] [secs=A 10 11   _L 9 8   A 10 2   _L 9 8   A 10 11] [center=true] [ori=0 0 -1 1 0 0 0 -1 0]'],
  ['parts/92696.dat','0 !LDCAD SNAP_CYL [group=linAct1] [gender=M] [caps=one] [secs=R 6 60] [slide=true] [pos=0 0 -18] [ori=1 0 0 0 0 -1 0 1 0]'],
  ['parts/92693c01.dat','0 !LDCAD SNAP_CYL [group=linAct1] [gender=F] [caps=one] [secs=R 6 60] [pos=0 0 102] [ori=1 0 0 0 0 -1 0 1 0]'],
  ['parts/2792.dat','0 !LDCAD SNAP_FGR [group=steerHold1] [genderOfs=M] [seq=4 32 4] [radius=13] [pos=0 -14 0] [ori=0 -1 0 1 0 0 0 0 1]'],
  ['parts/2791a.dat','0 !LDCAD SNAP_FGR [group=steerHold1] [genderOfs=M] [seq=32] [radius=13] [ori=0 -1 0 1 0 0 0 0 1]'],
])

const resolver=createNativeShadowResolver({fetchShadowText:async path=>files.get(path)??null})
const endpoint=(connector,bodyId)=>enrichEndpointSemantics(
  ldcadConnectorToEndpoint(connector,{bodyId,partId:bodyId}),
)

function alignedRecords(source,target,{sourceRole='connector',targetRole='connector'}={}){
  const targetPose={position:[0,0,0],quaternion:[0,0,0,1]}
  const targetFrame=worldConnectorFrame(targetPose,target)
  const sourceIdentity=worldConnectorFrame({position:[0,0,0],quaternion:[0,0,0,1]},source)
  const quaternion=sourceIdentity.axis?.length===0
    ?[0,0,0,1]
    :quatFromUnitVectors(sourceIdentity.axis,targetFrame.axis)
  const sourceRotated=worldConnectorFrame({position:[0,0,0],quaternion},source)
  const movingPose={
    position:[
      targetFrame.position[0]-sourceRotated.position[0],
      targetFrame.position[1]-sourceRotated.position[1],
      targetFrame.position[2]-sourceRotated.position[2],
    ],
    quaternion,
  }
  return{
    moving:{
      instance:{
        body:{id:'moving-body',instanceId:'moving'},
        descriptor:{classification:{role:sourceRole,properties:{}}},
        endpoints:[source],
      },
      pose:movingPose,
      visualOffsetStud:[0,0,0],
    },
    target:{
      instance:{
        body:{id:'target-body',instanceId:'target'},
        descriptor:{classification:{role:targetRole,properties:{}}},
        endpoints:[target],
      },
      pose:targetPose,
      visualOffsetStud:[0,0,0],
    },
  }
}

test('real stud and anti-stud profiles produce a retained structural candidate',async()=>{
  const [stud,receiver]=await Promise.all([
    resolver.resolve('p/stud.dat'),
    resolver.resolve('parts/6154.dat'),
  ])
  const male=endpoint(stud.connectors[0],'stud-body')
  const female=endpoint(receiver.connectors[0],'receiver-body')
  assert.equal(male.metadata.semantics.semanticKind,'stud')
  assert.equal(female.metadata.semantics.semanticKind,'anti-stud')
  const match=matchMechanicalEndpoints(male,female)
  assert.equal(match.compatible,true)
  assert.equal(match.interfaceRule?.kind,'revolute')
  const records=alignedRecords(male,female)
  assert.ok(findMechanicalCandidates({moving:records.moving,targets:[records.target],captureDistanceStud:1}).length>0)
})

test('real generic free spheres become physical ball/socket, including size rejection',async()=>{
  const [ballData,socketData]=await Promise.all([
    resolver.resolve('p/joint8ball.dat'),
    resolver.resolve('p/joint8socket1.dat'),
  ])
  const ball=endpoint(ballData.connectors[0],'ball-body')
  const socket=endpoint(socketData.connectors[0],'socket-body')
  assert.equal(ball.metadata.semantics.semanticKind,'ball')
  assert.equal(socket.metadata.semantics.semanticKind,'socket')
  const match=matchMechanicalEndpoints(ball,socket)
  assert.equal(match.compatible,true)
  assert.equal(match.interfaceRule?.kind,'spherical')

  const wrongSocket=enrichEndpointSemantics({
    ...socket,
    id:'wrong-socket',
    profile:{...socket.profile,bounding:{...socket.profile.bounding,radiusLdu:10}},
  })
  assert.equal(matchMechanicalEndpoints(ball,wrongSocket).compatible,false)

  const records=alignedRecords(ball,socket)
  const candidates=findMechanicalCandidates({moving:records.moving,targets:[records.target],captureDistanceStud:1})
  assert.ok(candidates.length>0)
  assert.equal(candidates[0].match.interfaceRule.kind,'spherical')
})

test('real single wheel axle generic group resolves to axle/axle-hole semantics',async()=>{
  const [maleData,femaleData]=await Promise.all([
    resolver.resolve('parts/2655.dat'),
    resolver.resolve('parts/3464b.dat'),
  ])
  const male=endpoint(maleData.connectors.find(item=>item.group==='sglWhlAxle'),'wheel-axle-male')
  const female=endpoint(femaleData.connectors[0],'wheel-axle-female')
  assert.equal(male.metadata.semantics.semanticKind,'wheel-axle-interface')
  assert.equal(female.metadata.semantics.semanticKind,'wheel-axle-interface')
  const match=matchMechanicalEndpoints(male,female)
  assert.equal(match.compatible,true)
  assert.deepEqual(match.interfacePair,['axle','axle-hole'])
  assert.equal(match.interfaceRule?.kind,'prismatic')
  const records=alignedRecords(male,female)
  assert.ok(findMechanicalCandidates({moving:records.moving,targets:[records.target],captureDistanceStud:1}).length>0)
})

test('real click-wheel generic group resolves to retained revolute interface',async()=>{
  const [hubData,rimData]=await Promise.all([
    resolver.resolve('parts/2999.dat'),
    resolver.resolve('parts/s/2998a.dat'),
  ])
  const male=endpoint(hubData.connectors.find(item=>item.group==='techWhlCon1'),'click-male')
  const female=endpoint(rimData.connectors[0],'click-female')
  assert.equal(male.metadata.semantics.semanticKind,'wheel-retainer')
  assert.equal(female.metadata.semantics.semanticKind,'wheel-retainer')
  const match=matchMechanicalEndpoints(male,female)
  assert.equal(match.compatible,true)
  assert.equal(match.interfaceRule?.kind,'revolute')
  assert.equal(match.interfaceRule?.topology?.retained,true)
  const records=alignedRecords(male,female)
  assert.ok(findMechanicalCandidates({moving:records.moving,targets:[records.target],captureDistanceStud:1}).length>0)
})


test('real multi-stud support becomes one validated fixed structural bundle',async()=>{
  const [studData,receiverData]=await Promise.all([
    resolver.resolve('p/stud.dat'),
    resolver.resolve('parts/6154.dat'),
  ])
  const targetEndpoints=receiverData.connectors.slice(0,2)
    .map(connector=>endpoint(connector,'target-body'))
  const studTemplate=endpoint(studData.connectors[0],'stud-template')
  const sourceEndpoints=targetEndpoints.map((target,index)=>enrichEndpointSemantics({
    ...studTemplate,
    id:`stud-source-${index}`,
    bodyId:'moving-body',
    frame:target.frame,
    metadata:{
      ...(studTemplate.metadata||{}),
      compatibilityEndpointId:`stud-source-${index}`,
      sourceEndpointId:`stud-source-${index}`,
    },
  }))

  const moving={
    instance:{
      body:{id:'moving-body',instanceId:'moving-stud-brick',partId:'stud-brick'},
      descriptor:{classification:{role:'brick',properties:{}}},
      endpoints:sourceEndpoints,
    },
    pose:{position:[0,0,0],quaternion:[0,0,0,1]},
    visualOffsetStud:[0,0,0],
  }
  const target={
    instance:{
      body:{id:'target-body',instanceId:'target-antistud-brick',partId:'anti-brick'},
      descriptor:{classification:{role:'brick',properties:{}}},
      endpoints:targetEndpoints,
    },
    pose:{position:[0,0,0],quaternion:[0,0,0,1]},
    visualOffsetStud:[0,0,0],
  }

  const candidates=findMechanicalCandidates({
    moving,
    targets:[target],
    captureDistanceStud:1,
  })
  assert.ok(candidates.length>0)
  const candidate=candidates[0]
  assert.equal(candidate.supportCount,2)
  assert.equal(candidate.supportPairs.length,2)
  assert.equal(candidate.occupancyPlan.exclusiveChannels.length,4)
  assert.equal(candidate.occupancyPlan.axialReservations.length,0)

  const instances=new Map([
    ['moving-stud-brick',moving.instance],
    ['target-antistud-brick',target.instance],
  ])
  const identityObject=()=>({
    children:[],
    matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},
    updateWorldMatrix(){},
  })
  const objects=new Map([...instances.keys()].map(id=>[id,identityObject()]))
  const contactBundle={
    kind:'stud-bundle',
    contactCount:candidate.supportPairs.length,
    contacts:candidate.supportPairs.map(pair=>({
      sourceEndpointId:pair.source.id,
      targetEndpointId:pair.target.id,
      sourceSemantic:pair.source.metadata.semantics.semanticKind,
      targetSemantic:pair.target.metadata.semantics.semanticKind,
    })),
  }
  const record={
    id:'stud-bundle-record',
    a:{instanceId:'moving-stud-brick',endpointId:candidate.source.id},
    b:{instanceId:'target-antistud-brick',endpointId:candidate.target.id},
    match:{family:'cylinder'},
    occupancy:candidate.occupancyPlan,
    metadata:{contactBundle},
  }
  const interpreted=interpretObservedConnection(record,{
    sceneObserver:{instance:id=>instances.get(id)??null},
    objectById:id=>objects.get(id),
  })
  assert.equal(interpreted.valid,true)
  assert.equal(interpreted.type,'constraint')
  assert.equal(interpreted.constraint.kind,'fixed')
  assert.equal(interpreted.constraint.metadata.contactBundle.contactCount,2)

  const state=exportMechanicsProjectState({
    graph:{edges:kind=>kind==='constraint'?[interpreted.constraint]:[]},
    relations:[],
  })
  assert.equal(state.connections.length,1)
  assert.equal(state.connections[0].contactBundle.contactCount,2)

  const liveRecords=[
    {...moving,object:objects.get('moving-stud-brick')},
    {...target,object:objects.get('target-antistud-brick')},
  ]
  const liveValidator=createLiveJointValidator({
    graph:{edges:kind=>kind==='constraint'?[interpreted.constraint]:[]},
    records:liveRecords,
  })
  assert.equal(liveValidator.validateConstraint(interpreted.constraint.id).valid,true)

  const secondId=contactBundle.contacts[1].targetEndpointId
  const secondIndex=target.instance.endpoints.findIndex(item=>item.id===secondId)
  assert.ok(secondIndex>=0)
  const displaced=target.instance.endpoints[secondIndex]
  target.instance.endpoints[secondIndex]=Object.freeze({
    ...displaced,
    frame:Object.freeze({
      ...displaced.frame,
      positionLdu:Object.freeze([
        Number(displaced.frame.positionLdu?.[0]||0)+20,
        Number(displaced.frame.positionLdu?.[1]||0),
        Number(displaced.frame.positionLdu?.[2]||0),
      ]),
    }),
  })
  const broken=liveValidator.validateConstraint(interpreted.constraint.id)
  assert.equal(broken.valid,false)
  assert.match(broken.reason,/contact-bundle-invalid:bundle-geometry-mismatch/)

  const fakeBundle={
    ...record,
    id:'fake-stud-bundle',
    metadata:{
      contactBundle:{
        kind:'stud-bundle',
        contactCount:2,
        contacts:[
          contactBundle.contacts[0],
          contactBundle.contacts[0],
        ],
      },
    },
  }
  const rejected=interpretObservedConnection(fakeBundle,{
    sceneObserver:{instance:id=>instances.get(id)??null},
    objectById:id=>objects.get(id),
  })
  assert.equal(rejected.valid,false)
  assert.match(rejected.reason,/contact-bundle-invalid/)
})


test('pinned real special groups survive parser semantics matcher and BUILD candidate search',async()=>{
  const cases=[
    {
      label:'click rotation',
      malePath:'parts/41679.dat',femalePath:'parts/41680.dat',
      semantic:'click-hinge',kind:'revolute',retained:true,
      pick:items=>items.find(item=>item.group==='clkRot'),
    },
    {
      label:'pneumatic cylinder guide',
      malePath:'parts/70834.dat',femalePath:'parts/2942.dat',
      semantic:'pneumatic-cylinder-guide',kind:'prismatic',retained:true,
    },
    {
      label:'technic engine slider',
      malePath:'parts/2851.dat',femalePath:'parts/2850a.dat',
      semantic:'engine-slider',kind:'prismatic',retained:true,
    },
    {
      label:'technic turntable 60',
      malePath:'parts/18938.dat',femalePath:'parts/18939.dat',
      semantic:'turntable-bearing',kind:'revolute',retained:true,
    },
    {
      label:'steering hub pivot',
      malePath:'parts/41895.dat',femalePath:'parts/41894.dat',
      semantic:'steering-pivot',kind:'revolute',retained:true,
    },
    {
      label:'driving ring slider',
      malePath:'parts/6538a.dat',femalePath:'parts/6539.dat',
      semantic:'driving-ring',kind:'prismatic',retained:true,
    },
    {
      label:'linear actuator guide',
      malePath:'parts/92696.dat',femalePath:'parts/92693c01.dat',
      semantic:'linear-actuator-guide',kind:'prismatic',retained:true,
    },
    {
      label:'steering holder fingers',
      malePath:'parts/2792.dat',femalePath:'parts/2791a.dat',
      semantic:'steering-pivot',kind:'revolute',retained:true,
    },
  ]

  for(const item of cases){
    const [maleData,femaleData]=await Promise.all([
      resolver.resolve(item.malePath),
      resolver.resolve(item.femalePath),
    ])
    const pick=item.pick??(items=>items[0])
    const maleConnector=pick(maleData.connectors)
    const femaleConnector=pick(femaleData.connectors)
    assert.ok(maleConnector,`${item.label}: male Shadow connector missing`)
    assert.ok(femaleConnector,`${item.label}: female Shadow connector missing`)

    const male=endpoint(maleConnector,`${item.label}-male`)
    const female=endpoint(femaleConnector,`${item.label}-female`)
    assert.equal(male.metadata.semantics.semanticKind,item.semantic,`${item.label}: male semantic`)
    assert.equal(female.metadata.semantics.semanticKind,item.semantic,`${item.label}: female semantic`)

    const match=matchMechanicalEndpoints(male,female)
    assert.equal(match.compatible,true,`${item.label}: profile compatibility`)
    assert.equal(match.interfaceRule?.kind,item.kind,`${item.label}: interface kind`)
    if(item.retained)assert.equal(match.interfaceRule?.topology?.retained,true,`${item.label}: retained topology`)

    const records=alignedRecords(male,female)
    const candidates=findMechanicalCandidates({
      moving:records.moving,
      targets:[records.target],
      captureDistanceStud:2,
      minAxisAlignment:.55,
    })
    assert.ok(candidates.length>0,`${item.label}: native BUILD candidate missing`)
    assert.equal(candidates[0].connectionEligible,true,`${item.label}: candidate must be committable`)
  }
})
