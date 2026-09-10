import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Window } from 'happy-dom'
import { parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { connectorToBrickLabV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { validateConnectedGeometryV4 } from '../connectors-v4/validity-v4.js'
import { registerPhysicsOverrideV4 } from '../connectors-v4/physics-overrides-v4.js'
import { hardenPhysicsPlanV4 } from '../connectors-v4/physics-plan-safety-v4.js'
import { installConnectorPhysicsV4 } from '../connectors-v4/physics-adapter-v4.js'

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
  const session={RAPIER,world,members:new Map([[a.userData.instanceId,ca.member],[b.userData.instanceId,cb.member]]),simulationTime:0,jointCount:0,internalJointCount:0,
    applyMotorTorques(){},syncObjects(){},dispose(){world.free?.()},
  }
  return session
}
function worldFrame(object,connector){
  object.updateMatrixWorld(true)
  const p=new THREE.Vector3(...connector.frame.positionStud).applyMatrix4(object.matrixWorld)
  const m=new THREE.Matrix3().fromArray(connector.frame.orientationBrickLab)
  const axis=new THREE.Vector3(0,-1,0).applyMatrix3(m).transformDirection(object.matrixWorld)
  const reference=new THREE.Vector3(1,0,0).applyMatrix3(m).transformDirection(object.matrixWorld)
  return {position:p,axis,reference}
}

test('certified revolute override is applied to the actual Rapier joint',()=>{
  const male=endpoint('SNAP_CYL [gender=M] [caps=one] [secs=R 5 8] [group=rapierLimitedHinge]','male')
  const female=endpoint('SNAP_CYL [gender=F] [caps=one] [secs=R 5 8] [group=rapierLimitedHinge]','female')
  const a=object('override-a'),b=object('override-b')
  const match=matchConnectorV4(male,female)
  assert.equal(match.compatible,true)
  const validity=validateConnectedGeometryV4(a,male,b,female)
  assert.equal(validity.valid,true)

  registerPhysicsOverrideV4({
    id:'rapier-limited-hinge-test-v1',
    match:{family:'round-revolute-interface',group:'rapierLimitedHinge'},
    rule:{kind:'revolute',limits:{min:-0.35,max:0.6},contacts:'disabled',evidence:'Rapier acceptance fixture'},
  })

  const item={
    id:'v4physics:override-test',family:'round-revolute-interface',connectionIds:['override-test'],
    entry:{family:'round-revolute-interface',objectA:a,objectB:b,connectorA:male,connectorB:female,validity},
    rule:{supported:true,kind:'revolute',retention:'captured',release:null},
    constraint:{physicsReady:true},
  }
  const plan=hardenPhysicsPlanV4({version:'test-policy',pass:true,joints:[item],blockers:[],stats:{connections:1,joints:1,blockers:0}})
  assert.equal(plan.pass,true)
  assert.deepEqual(plan.joints[0].rule.limits,{min:-0.35,max:0.6})

  const session=sessionFor(a,b)
  const state=installConnectorPhysicsV4(session,plan,{worldFrame})
  assert.equal(state.active,1)
  const joint=state.monitors[0].joint
  assert.equal(joint.limitsEnabled(),true)
  assert.ok(Math.abs(joint.limitsMin()+0.35)<1e-6)
  assert.ok(Math.abs(joint.limitsMax()-0.6)<1e-6)
  assert.equal(joint.contactsEnabled(),false)
  session.dispose()
})
