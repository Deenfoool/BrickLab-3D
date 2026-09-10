import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'
const dom=new Window()
for(const key of ['window','document','localStorage','CustomEvent','MutationObserver','CSS','HTMLElement','Storage']) globalThis[key]=key==='window'?dom:dom[key]
globalThis.requestAnimationFrame=()=>0
const {PARTS}=await import('../parts.js')
const {CONNECTOR_SYSTEM_VERSION_V4}=await import('../connectors-v4/schema-v4.js')
const {finalizeConnectorIdentitiesV4}=await import('../connectors-v4/identity-v4.js')
const {parseShadowTextV4}=await import('../connectors-v4/ldcad-parser-v4.js')
const {connectorToBrickLabV4}=await import('../connectors-v4/shadow-resolver-v4.js')
const {BrickLabConnectorV4:v4}=await import('../connectors-v4/runtime-v4.js')
function part(id,line){
 const raw=parseShadowTextV4(line).operations.filter(o=>o.connector).map(o=>o.connector)
 const connectors=finalizeConnectorIdentitiesV4(id,raw).connectors.map(c=>connectorToBrickLabV4(c))
 const def={id,connectivityV4:{status:'ready',schemaVersion:4,systemVersion:CONNECTOR_SYSTEM_VERSION_V4,connectors,warnings:[]}}
 PARTS.push(def)
 const o=new THREE.Group();o.userData={partId:id,instanceId:id};return o
}
const axle=part('ldraw-qa-axle','0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 240] [center=true] [slide=true]')
const hole=part('ldraw-qa-hole','0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]')
test('runtime transaction, native snapshots, restore and invalidation use actual endpoints',()=>{
 v4.clearGraph();axle.position.set(0,0,0);hole.position.set(0,0,0)
 const candidate=v4.findActiveCandidate(axle,[hole])
 assert.ok(candidate)
 assert.equal(v4.commitActiveCandidate(candidate).accepted,true)
 const original=v4.enrichProject({parts:[axle,hole].map(o=>({instanceId:o.userData.instanceId}))})
 assert.equal(original.connectionsV4.length,1)
 hole.position.y=2;assert.equal(v4.reconcileGraph([axle,hole]).updated,1)
 const moved=v4.projectConnections()[0]
 assert.notDeepEqual(moved.occupancy.interval,original.connectionsV4[0].occupancy.interval)
 // A nearby-target query must not delete unrelated graph entries.
 v4.findActiveCandidate(new THREE.Group(),[])
 assert.equal(v4.projectConnections().length,1)
 hole.position.x=1;assert.equal(v4.reconcileGraph([axle,hole]).removed,1)
 hole.position.set(0,0,0)
 v4.restoreConnections(original.connectionsV4)
 assert.equal(v4.reconcileGraph([axle,hole]).kept,1)
 v4.restoreConnections([]);assert.equal(v4.projectConnections().length,0)
 v4.restoreConnections(original.connectionsV4);assert.equal(v4.reconcileGraph([axle]).kept,0)
})
test('a stale preview is solved against the latest target pose before commit',()=>{
 v4.clearGraph();axle.position.set(0,0,0);hole.position.set(0,0,0)
 const candidate=v4.findActiveCandidate(axle,[hole]);hole.position.x=.2
 assert.equal(v4.commitActiveCandidate(candidate).accepted,true)
 assert.ok(Math.abs(axle.position.x-.2)<1e-9)
 assert.equal(v4.reconcileGraph([axle,hole]).kept,1)
})
test('untrusted physicsReady flag cannot bypass runtime certification',()=>{
 const records=v4.projectConnections().map(c=>({...c,physicsReady:true}))
 v4.restoreConnections(records)
 assert.equal(v4.physicsBlockers([axle,hole]).length,1)
})
