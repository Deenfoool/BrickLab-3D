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

const source=[]
const goodTarget=[]
for (let z=0; z<2; z+=1) {
  for (let x=0; x<4; x+=1) {
    const index=z*4+x
    source.push(stud(`s${index}`,'male',[x,0,z]))
    goodTarget.push(stud(`a${index}`,'female',[x,0,z]))
  }
}
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
