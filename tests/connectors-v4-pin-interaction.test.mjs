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

test('ordinary axle leaves neighbouring bores available after an off-grid first snap',()=>{
  v4.clearGraph()
  const axle=part('ldraw-regression-axle','0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 60] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]','regression-axle')
  for(const [index,x] of [-.94,.02,1.04].entries()){
    const hole=part(`ldraw-regression-axle-hole-${index}`,AXLE_HOLE,`regression-axle-hole-${index}`)
    hole.position.x=x
    connect(hole,axle)
  }
  assert.equal(v4.projectConnections().length,3)
})

test('pin and hybrid retain all bands after a slightly off-centre first placement',()=>{
  for(const [id,line] of [['42924',LONG_PIN],['65249',AXLE_PIN_65249]]){
    v4.clearGraph()
    const pin=part(`ldraw-offset-${id}`,line,`offset-${id}`)
    for(const [index,x] of [.06,1.02,-.96].entries()){
      const receiver=part(`ldraw-offset-${id}-${index}`,id==='65249'&&index!==2?AXLE_HOLE:PIN_HOLE,`offset-${id}-${index}`)
      receiver.position.x=x
      connect(receiver,pin)
    }
    assert.equal(v4.projectConnections().length,3)
  }
})

test('real 32270 gear snaps next to the 55013 stop and cannot overlap the collar',async()=>{
  const {readFileSync}=await import('node:fs')
  const {discoverPrimitiveConnectorsV4}=await import('../connector-discovery/discovery-v4.3.js')
  const {evaluateAxialOffsetV4}=await import('../connectors-v4/axial-fit-v4.js')
  v4.clearGraph()
  const shaft=part('ldraw-stop-55013',readFileSync(new URL('fixtures/55013-shadow.dat',import.meta.url),'utf8'),'stop-55013')
  const discovered=await discoverPrimitiveConnectorsV4('32270.dat',readFileSync(new URL('fixtures/32270.dat',import.meta.url),'utf8'),async()=>null)
  const holes=discovered.connectors.filter(c=>c.family==='cylinder'&&c.gender==='female'&&c.geometry.sections.every(s=>s.shape==='A'))
  assert.equal(holes.length,1)
  const id='ldraw-real-32270'
  const connectors=finalizeConnectorIdentitiesV4('parts/32270.dat',holes).connectors.map(c=>connectorToBrickLabV4(c))
  PARTS.push({id,connectivityV4:{status:'ready',schemaVersion:4,systemVersion:CONNECTOR_SYSTEM_VERSION_V4,connectors,warnings:[]}})
  const gear=new THREE.Group()
  gear.userData={partId:id,instanceId:'real-32270'}
  const axis=new THREE.Vector3(...connectors[0].frame.axis)
  gear.quaternion.setFromUnitVectors(axis,new THREE.Vector3(1,0,0))
  gear.position.x=3.4 // gear end at 78 LDU, immediately before the R8 collar
  gear.updateMatrixWorld(true)
  const candidate=v4.findActiveCandidate(gear,[shaft],{captureDistanceStud:.72})
  assert.ok(candidate,'stopped A6 shaft must remain active')
  assert.equal(v4.commitActiveCandidate(candidate).accepted,true)
  assert.ok(Math.abs(gear.position.x-3.4)<1e-4)
  const male=PARTS.find(p=>p.id==='ldraw-stop-55013').connectivityV4.connectors[0]
  assert.equal(evaluateAxialOffsetV4(connectors[0],male,70).valid,false,'R8 collar still blocks the gear')
  assert.equal(v4.reconcileGraph([gear,shaft]).kept,1)
})

test('moving the hybrid into an oppositely oriented pin hole preserves the free axle bands',()=>{
  v4.clearGraph()
  const shaft=part('ldraw-reverse-moving-65249',AXLE_PIN_65249,'reverse-moving-65249')
  const receiver=part('ldraw-reverse-fixed-hole',PIN_HOLE,'reverse-fixed-hole')
  receiver.rotation.z=Math.PI/2
  receiver.position.x=-1
  receiver.updateMatrixWorld(true)
  const candidate=v4.findActiveCandidate(shaft,[receiver],{captureDistanceStud:.72})
  assert.ok(candidate,'the short pin end must fit without moving to the axle end')
  assert.ok(Math.abs(candidate.solution.worldPosition[0])<1e-4,'must keep the selected physical band')
  assert.equal(v4.commitActiveCandidate(candidate).accepted,true)
  const objects=[shaft,receiver]
  for(const [index,x] of [0,1].entries()){
    const hole=part(`ldraw-reverse-axle-${index}`,AXLE_HOLE,`reverse-axle-${index}`)
    hole.position.x=x
    connect(hole,shaft,{opposed:index===1})
    objects.push(hole)
  }
  assert.equal(v4.reconcileGraph(objects).kept,3)
})

test('all shaft bands remain usable in every assembly order and entry direction',()=>{
  const profiles=[['pin',LONG_PIN],['hybrid',AXLE_PIN_65249],['axle','0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 60] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]']]
  const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]
  for(const [kind,line] of profiles)for(const order of orders)for(const opposed of [false,true]){
    v4.clearGraph()
    const key=`${kind}-${order.join('')}-${opposed}`
    const shaft=part(`ldraw-order-${key}`,line,`order-${key}`)
    const holes=[0,1,2].map(index=>{
      const hole=part(`ldraw-order-${key}-${index}`,kind==='pin'||kind==='hybrid'&&index===0?PIN_HOLE:AXLE_HOLE,`order-${key}-${index}`)
      hole.rotation.z=opposed?Math.PI/2:-Math.PI/2
      hole.position.x=index-1
      hole.updateMatrixWorld(true)
      return hole
    })
    const first=v4.findActiveCandidate(shaft,[holes[order[0]]],{captureDistanceStud:.72})
    assert.ok(first,key)
    assert.equal(v4.commitActiveCandidate(first).accepted,true,key)
    assert.ok(shaft.position.length()<1e-4,key)
    for(const index of order.slice(1))connect(holes[index],shaft,{opposed})
    assert.equal(v4.reconcileGraph([shaft,...holes]).kept,3,key)
    const intervals=v4.projectConnections().map(c=>c.occupancy.interval).sort((a,b)=>a[0]-b[0])
    for(let index=0;index<3;index++){
      assert.ok(Math.abs(intervals[index][0]-(-30+index*20))<1e-4,key)
      assert.ok(Math.abs(intervals[index][1]-(-10+index*20))<1e-4,key)
    }
  }
})
