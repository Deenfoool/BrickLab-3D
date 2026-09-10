import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { connectorToBrickLabV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { buildPhysicsPlanV4 } from '../connectors-v4/physics-policy-v4.js'

function endpoint(meta,id){
  const connector=parseShadowTextV4(`0 !LDCAD ${meta}`).operations[0].connector
  connector.endpointId=id
  return connectorToBrickLabV4(connector)
}
function object(id){
  const value=new THREE.Group()
  value.userData={instanceId:id,partId:`ldraw-${id}`}
  value.updateMatrixWorld(true)
  return value
}
function record(id,a,b,ca,cb){
  const match=matchConnectorV4(ca,cb)
  assert.equal(match.compatible,true)
  return {
    schemaVersion:4,
    graphVersion:'connection-graph-v4.0.1',
    id,
    a:{instanceId:a.userData.instanceId,partId:a.userData.partId,endpointId:ca.endpointId},
    b:{instanceId:b.userData.instanceId,partId:b.userData.partId,endpointId:cb.endpointId},
    activation:{family:'stud-anti-stud'},
    metadata:{activation:{family:'stud-anti-stud'}},
  }
}
function build(studs,antis){
  const top=object('rank-top'),bottom=object('rank-bottom')
  const connections=studs.map((stud,index)=>record(`stud-${index}`,top,bottom,stud,antis[index]))
  const map=new Map()
  for(const connector of studs) map.set(`${top.userData.partId}:${connector.endpointId}`,connector)
  for(const connector of antis) map.set(`${bottom.userData.partId}:${connector.endpointId}`,connector)
  return buildPhysicsPlanV4({objects:[top,bottom],connections,getConnector:(part,id)=>map.get(`${part}:${id}`)})
}

const stud=(pos,id)=>endpoint(`SNAP_CYL [gender=M] [caps=one] [secs=R 6 4] [pos=${pos.join(' ')}]`,id)
const anti=(pos,id)=>endpoint(`SNAP_CYL [gender=F] [caps=one] [secs=R 6 4] [pos=${pos.join(' ')}]`,id)

test('two contacts separated only along one common stud axis are not falsely rigid',()=>{
  // Canonical connector axis is local -Y, so these two contacts share the same
  // rotation line even though their origins are one stud apart.
  const plan=build(
    [stud([0,-10,0],'s0'),stud([0,10,0],'s1')],
    [anti([0,-10,0],'a0'),anti([0,10,0],'a1')],
  )
  assert.equal(plan.pass,false)
  assert.equal(plan.joints.length,0)
  assert.equal(plan.blockers.length,2)
  assert.ok(plan.blockers.every(blocker=>blocker.reason==='single-stud-collider-envelope-not-proven'))
})

test('two laterally separated parallel stud contacts certify one rigid bundle',()=>{
  const plan=build(
    [stud([-10,0,0],'s0'),stud([10,0,0],'s1')],
    [anti([-10,0,0],'a0'),anti([10,0,0],'a1')],
  )
  assert.equal(plan.pass,true)
  assert.equal(plan.blockers.length,0)
  assert.equal(plan.joints.length,1)
  assert.equal(plan.joints[0].rule.kind,'fixed')
  assert.equal(plan.joints[0].rule.bundle,'multi-stud-rigid')
  assert.deepEqual(new Set(plan.joints[0].connectionIds),new Set(['stud-0','stud-1']))
})
