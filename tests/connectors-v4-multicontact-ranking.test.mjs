import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { findPlacementCandidatesV4 } from '../connectors-v4/candidate-v4.js'

function stud(endpointId,gender,position) {
  return {
    schemaVersion:4,endpointId,family:'cylinder',gender,group:null,
    frame:{
      positionLdu:position.map(value=>value*20),
      orientation:[1,0,0,0,1,0,0,0,1],
      positionStud:[...position],orientationBrickLab:[1,0,0,0,1,0,0,0,1],axis:[0,-1,0],
    },
    geometry:{sections:[{shape:'R',radiusLdu:6,lengthLdu:4,elastic:false}],caps:'one',centered:false},
    snap:{slide:false},inheritance:{scale:'none',mirror:'cor'},source:{kind:'test'},
  }
}

function object(instanceId,partId,position=[0,0,0]) {
  const value=new THREE.Object3D()
  value.userData={instanceId,partId}
  value.position.fromArray(position)
  value.updateMatrixWorld(true)
  return value
}

function grid(prefix,gender,width=4,depth=2) {
  const result=[]
  for(let z=0;z<depth;z+=1)for(let x=0;x<width;x+=1){
    result.push(stud(`${prefix}${z*width+x}`,gender,[x,0,z]))
  }
  return result
}

const source=grid('s','male')
const goodTarget=grid('a','female')
const badTarget=[stud('single','female',[0,0,0])]
const defs=new Map([
  ['moving-part',{id:'moving-part',connectivityV4:{status:'ready',connectors:source}}],
  ['good-part',{id:'good-part',connectivityV4:{status:'ready',connectors:goodTarget}}],
  ['bad-part',{id:'bad-part',connectivityV4:{status:'ready',connectors:badTarget}}],
])

test('a full 2x4 stud pattern outranks a slightly closer isolated stud',()=>{
  const moving=object('moving','moving-part')
  const good=object('good','good-part',[0.12,0,0])
  const bad=object('bad','bad-part',[0.02,0,0])
  const candidates=findPlacementCandidatesV4(moving,[bad,good],{
    getDefinition:id=>defs.get(id),
    captureDistanceStud:0.72,
    maxResults:64,
  })
  assert.ok(candidates.length>0)
  assert.equal(candidates[0].targetObject,good)
  assert.equal(candidates[0].activationPreview.family,'stud-anti-stud')
  assert.equal(candidates[0].supportCount,8)
  const isolated=candidates.find(candidate=>candidate.targetObject===bad)
  assert.ok(isolated)
  assert.equal(isolated.supportCount,1)
  assert.ok(candidates[0].score<isolated.score)
})

test('a yawed 2x4 brick uses a second stud to rotate itself onto the full grid',()=>{
  const moving=object('moving-yawed','moving-part')
  const yaw=THREE.MathUtils.degToRad(12)
  moving.rotation.y=yaw
  moving.updateMatrixWorld(true)
  const target=object('grid-target','good-part')

  const candidates=findPlacementCandidatesV4(moving,[target],{
    getDefinition:id=>defs.get(id),
    captureDistanceStud:0.72,
    maxResults:64,
  })
  assert.ok(candidates.length>0)
  const best=candidates[0]
  assert.equal(best.targetObject,target)
  assert.equal(best.supportCount,8,'refined pose should align the complete 2x4 stud pattern')
  assert.equal(best.multiContactTwistRefined,true)
  assert.ok(Math.abs(Math.abs(best.solution.diagnostics.twistCorrectionRad)-yaw)<1e-3,'grid refinement corrects the initial yaw')

  const solvedQuaternion=new THREE.Quaternion(...best.solution.worldQuaternion)
  const solvedForward=new THREE.Vector3(1,0,0).applyQuaternion(solvedQuaternion)
  assert.ok(Math.abs(solvedForward.z)<1e-4,'final brick grid is axis-aligned with the target')
})

test('a single stud remains rotationally free and is not given an artificial yaw lock',()=>{
  const singleSource=[stud('single-source','male',[0,0,0])]
  const singleTarget=[stud('single-target','female',[0,0,0])]
  const localDefs=new Map([
    ['single-moving',{id:'single-moving',connectivityV4:{status:'ready',connectors:singleSource}}],
    ['single-target-part',{id:'single-target-part',connectivityV4:{status:'ready',connectors:singleTarget}}],
  ])
  const moving=object('single-moving-instance','single-moving')
  moving.rotation.y=THREE.MathUtils.degToRad(27)
  moving.updateMatrixWorld(true)
  const target=object('single-target-instance','single-target-part')
  const candidates=findPlacementCandidatesV4(moving,[target],{
    getDefinition:id=>localDefs.get(id),captureDistanceStud:0.72,maxResults:8,
  })
  assert.equal(candidates.length,1)
  assert.equal(candidates[0].supportCount,1)
  assert.equal(Boolean(candidates[0].multiContactTwistRefined),false)
  assert.ok(Math.abs(candidates[0].solution.diagnostics.twistCorrectionRad)<1e-9)
})
