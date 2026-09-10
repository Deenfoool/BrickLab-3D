import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Window } from 'happy-dom'
import { parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { connectorToBrickLabV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { activationForMatchV4 } from '../connectors-v4/activation-v4.js'
import { validateConnectedGeometryV4 } from '../connectors-v4/validity-v4.js'
import { buildPhysicsPlanV4, physicsRulePreviewV4 } from '../connectors-v4/physics-policy-v4.js'
import { installConnectorPhysicsV4, CONNECTOR_V4_RAPIER_MASKS } from '../connectors-v4/physics-adapter-v4.js'

const dom=new Window()
for(const key of ['window','document','CustomEvent','HTMLElement']) globalThis[key]=key==='window'?dom:dom[key]
await RAPIER.init()

function endpoint(meta,id){
  const connector=parseShadowTextV4(`0 !LDCAD ${meta}`).operations[0].connector
  connector.endpointId=id
  return connectorToBrickLabV4(connector)
}
function object(id){const o=new THREE.Group();o.userData={instanceId:id,partId:`ldraw-${id}`};o.updateMatrixWorld(true);return o}
function component(world,object){
  object.updateMatrixWorld(true)
  const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3()
  object.matrixWorld.decompose(p,q,s)
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y,p.z).setRotation({x:q.x,y:q.y,z:q.z,w:q.w}))
  const matrix=object.matrixWorld.clone()
  return {body,member:{body,component:{body,bodyWorldMatrix:matrix,bodyWorldInverse:matrix.clone().invert(),bodyWorldRotation:q.clone(),bodyWorldRotationInverse:q.clone().invert()}}}
}
function sessionFor(a,b){
  const world=new RAPIER.World({x:0,y:0,z:0})
  const ca=component(world,a),cb=component(world,b)
  const session={RAPIER,world,members:new Map([[a.userData.instanceId,ca.member],[b.userData.instanceId,cb.member]]),simulationTime:0,
    applyMotorTorques(){},
    syncObjects(){for(const [object,c] of [[a,ca],[b,cb]]){const p=c.body.translation(),q=c.body.rotation();object.position.set(p.x,p.y,p.z);object.quaternion.set(q.x,q.y,q.z,q.w);object.updateMatrixWorld(true)}},
    dispose(){world.free?.()},
  }
  return {session,ca,cb}
}
function connection(family,a,b,ca,cb,id=`${a.userData.instanceId}-${b.userData.instanceId}`){
  const match=matchConnectorV4(ca,cb)
  assert.equal(match.compatible,true)
  return {schemaVersion:4,graphVersion:'connection-graph-v4.0.1',id,
    a:{instanceId:a.userData.instanceId,partId:a.userData.partId,endpointId:ca.endpointId},
    b:{instanceId:b.userData.instanceId,partId:b.userData.partId,endpointId:cb.endpointId},
    activation:{family},metadata:{activation:{family}},match}
}
function getConnectorMap(entries){
  return new Map(entries.map(([part,connector])=>[`${part}:${connector.endpointId}`,connector]))
}

test('Rapier masks leave exactly the intended connector-axis DOF free',()=>{
  assert.equal(CONNECTOR_V4_RAPIER_MASKS.prismaticX,62)
  assert.equal(CONNECTOR_V4_RAPIER_MASKS.cylindricalX,54)
})

test('aligned axle/round-hole creates one stable cylindrical joint and disengages exactly once',()=>{
  const axle=endpoint('SNAP_CYL [gender=M] [caps=none] [secs=A 6 160] [center=true] [slide=true]','axle')
  const hole=endpoint('SNAP_CYL [gender=F] [caps=none] [secs=R 8 2 R 6 16 R 8 2] [center=true] [slide=true]','hole')
  const a=object('axle'),b=object('beam')
  const record=connection('technic-axle-round-hole',a,b,axle,hole)
  const connectors=getConnectorMap([[a.userData.partId,axle],[b.userData.partId,hole]])
  const plan=buildPhysicsPlanV4({objects:[a,b],connections:[record],getConnector:(part,id)=>connectors.get(`${part}:${id}`)})
  assert.equal(plan.pass,true)
  assert.equal(plan.joints[0].rule.kind,'cylindrical')
  const {session,ca,cb}=sessionFor(a,b)
  const runtime={worldFrame:(o,c)=>{
    const p=new THREE.Vector3(...c.frame.positionStud).applyMatrix4(o.matrixWorld)
    const m=new THREE.Matrix3().fromArray(c.frame.orientationBrickLab)
    const axis=new THREE.Vector3(0,-1,0).applyMatrix3(m).transformDirection(o.matrixWorld)
    const reference=new THREE.Vector3(1,0,0).applyMatrix3(m).transformDirection(o.matrixWorld)
    return {position:p,axis,reference}
  }}
  const state=installConnectorPhysicsV4(session,plan,runtime)
  assert.equal(state.active,1)
  for(let i=0;i<8;i++){session.world.timestep=1/120;session.world.step()}
  const av=ca.body.linvel(),bv=cb.body.linvel()
  assert.ok(Math.hypot(av.x,av.y,av.z,bv.x,bv.y,bv.z)<1e-4,'aligned V4 joint injected velocity')

  // Connector axis for the identity shadow frame is -Y. Move the hole completely
  // beyond the 8L axle and run two post-sync validity passes (release hysteresis).
  cb.body.setTranslation({x:0,y:20,z:0},true)
  session.syncObjects();session.syncObjects()
  assert.equal(state.released,1)
  assert.equal(state.active,0)
  session.syncObjects()
  assert.equal(state.released,1,'release fired more than once')
  session.dispose()
})

test('physics policy distrusts connection flags and certifies from live geometry',()=>{
  const axle=endpoint('SNAP_CYL [gender=M] [caps=none] [secs=A 6 80] [center=true] [slide=true]','axle')
  const hole=endpoint('SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]','hole')
  const a=object('a'),b=object('b')
  const record={...connection('technic-axle-keyed-hole',a,b,axle,hole),physicsReady:true,constraint:{physicsReady:true,status:'approved'}}
  const connectors=getConnectorMap([[a.userData.partId,axle],[b.userData.partId,hole]])
  let plan=buildPhysicsPlanV4({objects:[a,b],connections:[record],getConnector:(part,id)=>connectors.get(`${part}:${id}`)})
  assert.equal(plan.pass,true)
  assert.equal(plan.joints[0].constraint.physicsReady,true)
  assert.match(plan.joints[0].constraint.evidence.source,/connector-physics-policy-v4/)
  b.position.x=.5;b.updateMatrixWorld(true)
  plan=buildPhysicsPlanV4({objects:[a,b],connections:[record],getConnector:(part,id)=>connectors.get(`${part}:${id}`)})
  assert.equal(plan.pass,false)
  assert.match(plan.blockers[0].reason,/live-geometry/)
})

test('two distinct stud contacts between the same parts become one rigid physics joint',()=>{
  const studA=endpoint('SNAP_CYL [gender=M] [caps=one] [secs=R 6 4] [pos=-10 0 0]','stud-a')
  const studB=endpoint('SNAP_CYL [gender=M] [caps=one] [secs=R 6 4] [pos=10 0 0]','stud-b')
  const antiA=endpoint('SNAP_CYL [gender=F] [caps=one] [secs=R 6 4] [pos=-10 0 0]','anti-a')
  const antiB=endpoint('SNAP_CYL [gender=F] [caps=one] [secs=R 6 4] [pos=10 0 0]','anti-b')
  const top=object('top'),bottom=object('bottom')
  const records=[
    connection('stud-anti-stud',top,bottom,studA,antiA,'stud-1'),
    connection('stud-anti-stud',top,bottom,studB,antiB,'stud-2'),
  ]
  const connectors=getConnectorMap([
    [top.userData.partId,studA],[top.userData.partId,studB],
    [bottom.userData.partId,antiA],[bottom.userData.partId,antiB],
  ])
  const plan=buildPhysicsPlanV4({objects:[top,bottom],connections:records,getConnector:(part,id)=>connectors.get(`${part}:${id}`)})
  assert.equal(plan.pass,true)
  assert.equal(plan.joints.length,1)
  assert.equal(plan.joints[0].rule.kind,'fixed')
  assert.deepEqual(new Set(plan.joints[0].connectionIds),new Set(['stud-1','stud-2']))
})

test('shape-based round activation and physics policy agree',()=>{
  const slidingMale=endpoint('SNAP_CYL [gender=M] [caps=none] [secs=R 5 40] [center=true] [slide=true]','slide-m')
  const slidingFemale=endpoint('SNAP_CYL [gender=F] [caps=none] [secs=R 5 40] [center=true] [slide=true]','slide-f')
  const slideMatch=matchConnectorV4(slidingMale,slidingFemale)
  const slideActivation=activationForMatchV4(slidingMale,slidingFemale,slideMatch)
  assert.equal(slideActivation.family,'round-cylindrical-interface')
  assert.equal(physicsRulePreviewV4(slideActivation.family,{match:slideMatch}).kind,'cylindrical')

  const hingeMale=endpoint('SNAP_CYL [gender=M] [caps=one] [secs=R 5 8]','hinge-m')
  const hingeFemale=endpoint('SNAP_CYL [gender=F] [caps=one] [secs=R 5 8]','hinge-f')
  const hingeMatch=matchConnectorV4(hingeMale,hingeFemale)
  const hingeActivation=activationForMatchV4(hingeMale,hingeFemale,hingeMatch)
  assert.equal(hingeActivation.family,'round-revolute-interface')
  assert.equal(physicsRulePreviewV4(hingeActivation.family,{match:hingeMatch}).kind,'revolute')
})

test('captured mechanisms map to explicit DOF while ambiguous mechanisms fail closed',()=>{
  assert.deepEqual(
    {supported:physicsRulePreviewV4('ball-socket').supported,kind:physicsRulePreviewV4('ball-socket').kind},
    {supported:true,kind:'spherical'},
  )
  const hinge=physicsRulePreviewV4('hinge-fingers',{connectorA:{group:'hinge'},connectorB:{group:'hinge'}})
  assert.equal(hinge.supported,true)
  assert.equal(hinge.kind,'revolute')
  const locking=physicsRulePreviewV4('hinge-fingers',{connectorA:{group:'lckhng'},connectorB:{group:'lckhng'}})
  assert.equal(locking.supported,false)
  assert.match(locking.reason,/locking-hinge/)
  const generic=physicsRulePreviewV4('generic-group')
  assert.equal(generic.supported,false)
  assert.match(generic.reason,/explicit-physics-override/)
})
