import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Window } from 'happy-dom'
import { PHYSICS_UNITS } from '../physical-parts.js'
import { parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { connectorToBrickLabV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { buildPhysicsPlanV4, drivetrainSemanticLinksV4 } from '../connectors-v4/physics-policy-v4.js'
import { installConnectorPhysicsV4 } from '../connectors-v4/physics-adapter-v4.js'

const dom=new Window()
for(const key of ['window','document','CustomEvent','HTMLElement']) globalThis[key]=key==='window'?dom:dom[key]
await RAPIER.init()
const STUD=PHYSICS_UNITS.studMeters

function endpoint(meta,id,positionStud=[0,0,0]) {
  const connector=parseShadowTextV4(`0 !LDCAD ${meta}`).operations[0].connector
  connector.endpointId=id
  const result=connectorToBrickLabV4(connector)
  result.frame.positionStud=[...positionStud]
  return result
}

function object(id) {
  const value=new THREE.Group()
  value.userData={instanceId:id,partId:`ldraw-${id}`}
  value.updateMatrixWorld(true)
  return value
}

function createMember(world,value) {
  value.updateMatrixWorld(true)
  const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3()
  value.matrixWorld.decompose(position,rotation,scale)
  const body=world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x*STUD,position.y*STUD,position.z*STUD)
      .setRotation({x:rotation.x,y:rotation.y,z:rotation.z,w:rotation.w}),
  )
  const matrix=value.matrixWorld.clone()
  return {body,component:{body,bodyWorldMatrix:matrix,bodyWorldInverse:matrix.clone().invert(),bodyWorldRotation:rotation.clone()}}
}

function connection(a,b,axle,hole,id) {
  const match=matchConnectorV4(axle,hole)
  assert.equal(match.compatible,true)
  return {
    schemaVersion:4,
    graphVersion:'connection-graph-v4.0.1',
    id,
    a:{instanceId:a.userData.instanceId,partId:a.userData.partId,endpointId:axle.endpointId},
    b:{instanceId:b.userData.instanceId,partId:b.userData.partId,endpointId:hole.endpointId},
    activation:{family:'technic-axle-keyed-hole'},
    metadata:{activation:{family:'technic-axle-keyed-hole'}},
    match,
    occupancy:{channelKey:`${a.userData.instanceId}::${axle.endpointId}`},
  }
}

function worldFrame(value,connector) {
  const position=new THREE.Vector3(...connector.frame.positionStud).applyMatrix4(value.matrixWorld)
  const orientation=new THREE.Matrix3().fromArray(connector.frame.orientationBrickLab)
  const axis=new THREE.Vector3(0,-1,0).applyMatrix3(orientation).transformDirection(value.matrixWorld)
  const reference=new THREE.Vector3(1,0,0).applyMatrix3(orientation).transformDirection(value.matrixWorld)
  return {position,axis,reference}
}

test('one continuous axle through two coaxial holes creates one joint and releases only after both disengage',()=>{
  const axle=endpoint('SNAP_CYL [gender=M] [caps=none] [secs=A 6 160] [center=true] [slide=true]','axle')
  const holeA=endpoint('SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]','hole-a',[0,-1,0])
  const holeB=endpoint('SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]','hole-b',[0,1,0])
  const shaft=object('shaft'),carrier=object('carrier')
  const records=[
    connection(shaft,carrier,axle,holeA,'shaft-hole-a'),
    connection(shaft,carrier,axle,holeB,'shaft-hole-b'),
  ]
  const connectors=new Map([
    [`${shaft.userData.partId}:${axle.endpointId}`,axle],
    [`${carrier.userData.partId}:${holeA.endpointId}`,holeA],
    [`${carrier.userData.partId}:${holeB.endpointId}`,holeB],
  ])

  const plan=buildPhysicsPlanV4({objects:[shaft,carrier],connections:records,getConnector:(part,id)=>connectors.get(`${part}:${id}`)})
  assert.equal(plan.pass,true)
  assert.equal(plan.joints.length,1)
  assert.equal(plan.stats.axialBundles,1)
  assert.equal(plan.stats.bundledAxialConnections,2)
  assert.equal(plan.joints[0].rule.kind,'prismatic')
  assert.equal(plan.joints[0].rule.bundle,'coaxial-axial-profile')
  assert.deepEqual(new Set(plan.joints[0].connectionIds),new Set(records.map(record=>record.id)))
  assert.equal(plan.joints[0].entries.length,2)

  const semantic=drivetrainSemanticLinksV4(records)
  assert.equal(semantic.length,1)
  assert.deepEqual(new Set(semantic[0].metadata.v4ConnectionIds),new Set(records.map(record=>record.id)))

  const world=new RAPIER.World({x:0,y:0,z:0})
  const memberA=createMember(world,shaft),memberB=createMember(world,carrier)
  let rebuilds=0
  const session={
    RAPIER,world,
    members:new Map([[shaft.userData.instanceId,memberA],[carrier.userData.instanceId,memberB]]),
    simulationTime:0,jointCount:0,internalJointCount:0,
    rebuildConnectorV4Drivetrain(){rebuilds+=1},
    applyMotorTorques(){},
    syncObjects(){
      for(const [value,member] of [[shaft,memberA],[carrier,memberB]]) {
        const p=member.body.translation(),q=member.body.rotation()
        value.position.set(p.x/STUD,p.y/STUD,p.z/STUD)
        value.quaternion.set(q.x,q.y,q.z,q.w)
        value.updateMatrixWorld(true)
      }
    },
    dispose(){world.free?.()},
  }

  const state=installConnectorPhysicsV4(session,plan,{worldFrame})
  assert.equal(state.active,1)
  assert.equal(session.jointCount,1)
  assert.equal(state.monitors[0].activeEngagements,2)

  // Shift the carrier so one hole is outside the 8L axle while the other remains
  // engaged. A redundant-joint implementation would already split or fight here.
  memberB.body.setTranslation({x:0,y:4*STUD,z:0},true)
  session.syncObjects();session.syncObjects()
  assert.equal(state.released,0)
  assert.equal(state.active,1)
  assert.equal(state.monitors[0].activeEngagements,1)
  assert.equal(rebuilds,0)

  // Now both holes are outside the axle. The two-frame hysteresis applies to the
  // bundle as a whole and releases all graph IDs exactly once.
  memberB.body.setTranslation({x:0,y:6*STUD,z:0},true)
  session.syncObjects()
  assert.equal(state.released,0)
  session.syncObjects()
  assert.equal(state.released,1)
  assert.equal(state.active,0)
  assert.equal(session.jointCount,0)
  assert.equal(rebuilds,1)
  assert.deepEqual(new Set(state.releaseEvents[0].connectionIds),new Set(records.map(record=>record.id)))
  session.syncObjects()
  assert.equal(state.released,1)
  assert.equal(rebuilds,1)
  session.dispose()
})
