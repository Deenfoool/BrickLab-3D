import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { findPlacementCandidatesV4 } from '../connectors-v4/candidate-v4.js'

function generic(endpointId,gender,halfSizeLdu) {
  return {
    schemaVersion:4,endpointId,family:'generic',gender,group:'fixture-plug',
    frame:{
      positionLdu:[0,0,0],orientation:[1,0,0,0,1,0,0,0,1],
      positionStud:[0,0,0],orientationBrickLab:[1,0,0,0,1,0,0,0,1],axis:[0,-1,0],
    },
    geometry:{bounding:{kind:'cube',halfSizeLdu}},
    snap:{placement:'retain',match:'shape'},
    inheritance:{scale:'none',mirror:'cor'},source:{kind:'test'},
  }
}

function object(instanceId,partId,position=[0,0,0]) {
  const value=new THREE.Object3D()
  value.userData={instanceId,partId}
  value.position.fromArray(position)
  value.updateMatrixWorld(true)
  return value
}

test('generic bounding metadata influences best-pair ranking when group/position are otherwise equal',()=>{
  const moving=object('moving','moving-part')
  const mismatched=object('A-mismatch','mismatch-part',[0.1,0,0])
  const matched=object('Z-match','match-part',[0.1,0,0])
  const defs=new Map([
    ['moving-part',{id:'moving-part',connectivityV4:{status:'ready',connectors:[generic('male','male',8)]}}],
    ['mismatch-part',{id:'mismatch-part',connectivityV4:{status:'ready',connectors:[generic('female-big','female',18)]}}],
    ['match-part',{id:'match-part',connectivityV4:{status:'ready',connectors:[generic('female-fit','female',8)]}}],
  ])

  const candidates=findPlacementCandidatesV4(moving,[mismatched,matched],{
    getDefinition:id=>defs.get(id),captureDistanceStud:0.5,maxResults:8,
  })
  assert.equal(candidates.length,2)
  assert.equal(candidates[0].targetObject,matched)
  assert.equal(candidates[0].boundingMismatch,0)
  assert.ok(candidates[1].boundingMismatch>0.5)
  assert.ok(candidates[0].score<candidates[1].score)
})
