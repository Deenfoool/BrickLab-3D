import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Window } from 'happy-dom'
import { parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { connectorToBrickLabV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { validateConnectedGeometryV4 } from '../connectors-v4/validity-v4.js'
import { buildPhysicsPlanV4 } from '../connectors-v4/physics-policy-v4.js'
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
function connection(family,a,b,ca,cb){
  const match=matchConnectorV4(ca,cb)
  assert.equal(match.compatible,true)
  return {schemaVersion:4,graphVersion:'connection-graph-v4.0.1',id:`${a.userData.instanceId}-${b.userData.instanceId}`,
    a:{instanceId:a.userData.instanceId,partId:a.userData.partId,endpointId:ca.endpointId},
    b:{instanceId:b.userData.instanceId,partId:b.userData.partId,endpointId:cb.endpointId},
    activation:{family},metadata:{activation:{family}},match}
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
  const connectors=new Map([[`${a.userData.partId}:${axle.endpointId}`,axle],[`${b.userData.partId}:${hole.endpointId}`,hole]])
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
  const connectors=new Map([[`${a.userData.partId}:${axle.endpointId}`,axle],[`${b.userData.partId}:${hole.endpointId}`,hole]])
  let plan=buildPhysicsPlanV4({objects:[a,b],connections:[record],getConnector:(part,id)=>connectors.get(`${part}:${id}`)})
  assert.equal(plan.pass,true)
  assert.equal(plan.joints[0].constraint.physicsReady,true)
  assert.match(plan.joints[0].constraint.evidence.source,/connector-physics-policy-v4/)
  b.position.x=.5;b.updateMatrixWorld(true)
  plan=buildPhysicsPlanV4({objects:[a,b],connections:[record],getConnector:(part,id)=>connectors.get(`${part}:${id}`)})
  assert.equal(plan.pass,false)
  assert.match(plan.blockers[0].reason,/live-geometry/)
})
