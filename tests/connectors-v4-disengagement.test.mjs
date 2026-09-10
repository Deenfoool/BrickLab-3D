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

const dom = new Window()
for (const key of ['window','document','CustomEvent','HTMLElement']) globalThis[key] = key === 'window' ? dom : dom[key]
await RAPIER.init()
const STUD=PHYSICS_UNITS.studMeters

function endpoint(meta,id) {
  const connector = parseShadowTextV4(`0 !LDCAD ${meta}`).operations[0].connector
  connector.endpointId = id
  return connectorToBrickLabV4(connector)
}

function object(id) {
  const value = new THREE.Group()
  value.userData = { instanceId:id, partId:`ldraw-${id}` }
  value.updateMatrixWorld(true)
  return value
}

function createMember(world,value) {
  value.updateMatrixWorld(true)
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  value.matrixWorld.decompose(position,rotation,scale)
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x*STUD,position.y*STUD,position.z*STUD)
      .setRotation({x:rotation.x,y:rotation.y,z:rotation.z,w:rotation.w}),
  )
  const matrix = value.matrixWorld.clone()
  return {
    body,
    component:{
      body,
      bodyWorldMatrix:matrix,
      bodyWorldInverse:matrix.clone().invert(),
      bodyWorldRotation:rotation.clone(),
      bodyWorldRotationInverse:rotation.clone().invert(),
    },
  }
}

function connection(family,a,b,connectorA,connectorB,id='keyed-link') {
  const match = matchConnectorV4(connectorA,connectorB)
  assert.equal(match.compatible,true)
  return {
    schemaVersion:4,
    graphVersion:'connection-graph-v4.0.1',
    id,
    a:{instanceId:a.userData.instanceId,partId:a.userData.partId,endpointId:connectorA.endpointId},
    b:{instanceId:b.userData.instanceId,partId:b.userData.partId,endpointId:connectorB.endpointId},
    activation:{family},
    metadata:{activation:{family}},
    match,
  }
}

function worldFrame(value,connector) {
  const position = new THREE.Vector3(...connector.frame.positionStud).applyMatrix4(value.matrixWorld)
  const orientation = new THREE.Matrix3().fromArray(connector.frame.orientationBrickLab)
  const axis = new THREE.Vector3(0,-1,0).applyMatrix3(orientation).transformDirection(value.matrixWorld)
  const reference = new THREE.Vector3(1,0,0).applyMatrix3(orientation).transformDirection(value.matrixWorld)
  return {position,axis,reference}
}

test('keyed semantic links disappear after the physical profile disengages', () => {
  const axle = endpoint('SNAP_CYL [gender=M] [caps=none] [secs=A 6 160] [center=true] [slide=true]','axle')
  const hole = endpoint('SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]','hole')
  const a = object('axle')
  const b = object('beam')
  const record = connection('technic-axle-keyed-hole',a,b,axle,hole)

  assert.equal(drivetrainSemanticLinksV4([record]).length,1)
  assert.equal(drivetrainSemanticLinksV4([record],new Set([record.id])).length,0)

  const connectors = new Map([
    [`${a.userData.partId}:${axle.endpointId}`,axle],
    [`${b.userData.partId}:${hole.endpointId}`,hole],
  ])
  const plan = buildPhysicsPlanV4({
    objects:[a,b],
    connections:[record],
    getConnector:(partId,endpointId)=>connectors.get(`${partId}:${endpointId}`),
  })
  assert.equal(plan.pass,true)
  assert.equal(plan.joints[0].rule.kind,'prismatic')

  const world = new RAPIER.World({x:0,y:0,z:0})
  const memberA = createMember(world,a)
  const memberB = createMember(world,b)
  let rebuilds = 0
  const session = {
    RAPIER,
    world,
    members:new Map([[a.userData.instanceId,memberA],[b.userData.instanceId,memberB]]),
    simulationTime:0,
    jointCount:0,
    internalJointCount:0,
    rebuildConnectorV4Drivetrain(){ rebuilds += 1 },
    applyMotorTorques(){},
    syncObjects(){
      for (const [value,member] of [[a,memberA],[b,memberB]]) {
        const p=member.body.translation(), q=member.body.rotation()
        value.position.set(p.x/STUD,p.y/STUD,p.z/STUD)
        value.quaternion.set(q.x,q.y,q.z,q.w)
        value.updateMatrixWorld(true)
      }
    },
    dispose(){ world.free?.() },
  }
  const state = installConnectorPhysicsV4(session,plan,{worldFrame})
  assert.equal(state.active,1)
  assert.equal(session.jointCount,1)
  assert.deepEqual(state.units,{studMeters:STUD,anchorUnit:'m'})

  memberB.body.setTranslation({x:0,y:20*STUD,z:0},true)
  session.syncObjects()
  assert.equal(rebuilds,0,'release hysteresis must require confirmation')
  session.syncObjects()
  assert.equal(state.released,1)
  assert.equal(state.active,0)
  assert.equal(session.jointCount,0)
  assert.equal(rebuilds,1,'keyed disengagement must split drivetrain semantics once')
  session.syncObjects()
  assert.equal(rebuilds,1,'released joint must not rebuild drivetrain repeatedly')
  session.dispose()
})
