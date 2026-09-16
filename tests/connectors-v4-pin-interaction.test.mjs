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

const LONG_PIN='0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2 R 6 16 R 8 4 R 6 16 _L 6.25 4 R 6 16 _L 6.25 2] [center=true] [ori=0 -1 0 1 0 0 0 0 1]'
const AXLE_PIN_65249='0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2 R 6 16 R 8 2 A 6 40] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]'
const PIN_HOLE='0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=R 8 2 R 6 16 R 8 2] [center=true] [slide=true]'
const AXLE_HOLE='0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=A 6 20] [center=true] [slide=true]'

function part(id,line,instanceId=id){
  const raw=parseShadowTextV4(line,{file:`parts/${id.slice(6)}.dat`}).operations.filter(operation=>operation.connector).map(operation=>operation.connector)
  const connectors=finalizeConnectorIdentitiesV4(`parts/${id.slice(6)}.dat`,raw).connectors.map(connector=>connectorToBrickLabV4(connector))
  const def={id,connectivityV4:{status:'ready',schemaVersion:4,systemVersion:CONNECTOR_SYSTEM_VERSION_V4,connectors,warnings:[]}}
  PARTS.push(def)
  const object=new THREE.Group()
  object.userData={partId:id,instanceId}
  return object
}

function connect(moving,target,{opposed=false}={}){
  moving.rotation.z=opposed?Math.PI/2:-Math.PI/2
  moving.updateMatrixWorld(true)
  target.updateMatrixWorld(true)
  const candidate=v4.findActiveCandidate(moving,[target],{maxResults:Number.POSITIVE_INFINITY,captureDistanceStud:.72})
  assert.ok(candidate,JSON.stringify(v4.findCandidates(moving,[target],{maxResults:Number.POSITIVE_INFINITY,captureDistanceStud:.72}).map(value=>({distance:value.distanceStud,alignment:value.alignment,solution:value.solution,activation:value.activationPreview}))))
  const result=v4.commitActiveCandidate(candidate)
  assert.equal(result.accepted,true,JSON.stringify(result))
  return result
}

test('42924 accepts three sequential interactive pin-hole snaps',()=>{
  v4.clearGraph()
  const pin=part('ldraw-42924',LONG_PIN,'pin-42924')
  for(const [index,x] of [-1,0,1].entries()){
    const hole=part(`ldraw-hole-${index}`,PIN_HOLE,`hole-${index}`)
    hole.position.x=x
    connect(hole,pin,{opposed:index===1})
  }
  assert.equal(v4.projectConnections().length,3)
})

test('65249 accepts a pin receiver and two sequential axle-hole snaps',()=>{
  v4.clearGraph()
  const pin=part('ldraw-65249',AXLE_PIN_65249,'axle-pin-65249')
  const contacts=[
    {line:PIN_HOLE,x:-1,id:'pin-receiver'},
    {line:AXLE_HOLE,x:0,id:'axle-receiver-a'},
    {line:AXLE_HOLE,x:1,id:'axle-receiver-b'},
  ]
  for(const contact of contacts){
    const receiver=part(`ldraw-${contact.id}`,contact.line,contact.id)
    receiver.position.x=contact.x
    connect(receiver,pin,{opposed:contact.id==='axle-receiver-a'})
  }
  assert.equal(v4.projectConnections().length,3)
})
