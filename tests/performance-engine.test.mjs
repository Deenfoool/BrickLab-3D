import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { SpatialHash3D } from '../performance/spatial-index-v1.js'
import { FrameBudgetScheduler } from '../performance/work-queue-v1.js'
import { createPerformanceEngine } from '../performance/runtime-v1.js'
import { findBestPlacementCandidateV4 } from '../connectors-v4/candidate-v4.js'

function connector(endpointId,gender,position=[0,0,0],length=20){
  return {
    schemaVersion:4,endpointId,family:'cylinder',gender,group:null,
    frame:{positionLdu:position.map(v=>v*20),orientation:[1,0,0,0,1,0,0,0,1],positionStud:[...position],orientationBrickLab:[1,0,0,0,1,0,0,0,1],axis:[0,-1,0]},
    geometry:{sections:[{shape:'A',radiusLdu:6,lengthLdu:length,elastic:false}],caps:'none',centered:true},
    snap:{slide:true},inheritance:{scale:'none',mirror:'cor'},source:{kind:'performance-test'},
  }
}
function definition(id,connectors){return{id,connectivityV4:{status:'ready',systemVersion:'test',connectors}}}
function object(instanceId,partId,position){
  const root=new THREE.Object3D();root.userData={instanceId,partId};root.position.fromArray(position);root.updateMatrixWorld(true);return root
}

test('SpatialHash3D examines a local subset on a thousand-object fixture',()=>{
  const index=new SpatialHash3D({cellSize:4})
  for(let i=0;i<2000;i+=1)index.upsert(`o${i}`,i,{x:i*3,y:0,z:0},.4)
  const result=index.querySphere({x:1500,y:0,z:0},1)
  assert.ok(result.values.length>0)
  assert.ok(result.examined<20,`examined ${result.examined} of 2000`)
})

test('FrameBudgetScheduler yields work across slices and can restart a keyed analysis',async()=>{
  const frames=[];let clock=0
  const scheduler=new FrameBudgetScheduler({budgetMs:2,now:()=>clock++,scheduleFrame:callback=>frames.push(callback)})
  const seen=[]
  const promise=scheduler.schedule(Array.from({length:30},(_,i)=>i),value=>seen.push(value),{key:'scan'})
  while(frames.length)frames.shift()()
  const result=await promise
  assert.equal(result.aborted,false)
  assert.equal(seen.length,30)
  assert.ok(scheduler.stats().frames>1,'large analysis yields between frame slices')

  const first=scheduler.schedule([1,2,3],()=>{}, {key:'doctor'})
  const second=scheduler.schedule([4],()=>{}, {key:'doctor'})
  while(frames.length)frames.shift()()
  assert.equal((await first).aborted,true)
  assert.equal((await second).aborted,false)
})

test('performance SNAP target query preserves the same best V4 candidate without scanning the full scene',async()=>{
  const male=connector('male','male')
  const female=connector('female','female')
  const defs=new Map([
    ['moving',definition('moving',[male])],
    ['target',definition('target',[female])],
  ])
  const moving=object('moving-instance','moving',[0,0,0])
  const near=object('near','target',[0.18,0,0])
  const objects=[moving,near]
  for(let i=0;i<1500;i+=1)objects.push(object(`far-${i}`,'target',[20+i*2,0,(i%7)*3]))

  const scheduler=new FrameBudgetScheduler({budgetMs:1000,scheduleFrame:callback=>setTimeout(callback,0)})
  const engine=createPerformanceEngine({getDefinition:id=>defs.get(id),scheduler})
  await engine.rebuild(objects,'fixture')
  const spatial=engine.querySnapTargets([moving],objects,{captureDistanceStud:.72})
  assert.ok(spatial)
  assert.ok(spatial.sceneExamined<40,`scene examined ${spatial.sceneExamined}`)
  assert.ok(spatial.endpointExamined<40,`endpoint examined ${spatial.endpointExamined}`)
  assert.ok(spatial.connectorObjects.includes(near))
  assert.ok(spatial.connectorObjects.length<10)

  const full=findBestPlacementCandidateV4(moving,objects.slice(1),{getDefinition:id=>defs.get(id),captureDistanceStud:.72})
  const indexed=findBestPlacementCandidateV4(moving,spatial.connectorObjects,{getDefinition:id=>defs.get(id),captureDistanceStud:.72})
  assert.ok(full&&indexed)
  assert.equal(indexed.key,full.key)
  assert.equal(indexed.targetObject,near)
})
