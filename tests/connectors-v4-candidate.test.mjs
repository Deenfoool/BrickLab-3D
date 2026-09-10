import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { findBestPlacementCandidateV4, findPlacementCandidatesV4 } from '../connectors-v4/candidate-v4.js'

function cylinder({endpointId,gender,shape='R',length=20,position=[0,0,0]}={}) {
  return {
    schemaVersion:4,endpointId,family:'cylinder',gender,group:null,
    frame:{
      positionLdu:position.map(v=>v*20),
      orientation:[1,0,0,0,1,0,0,0,1],
      positionStud:[...position],
      orientationBrickLab:[1,0,0,0,1,0,0,0,1],
      axis:[0,-1,0],
    },
    geometry:{sections:[{shape,radiusLdu:6,lengthLdu:length,elastic:false}],caps:'none',centered:true},
    snap:{slide:true},inheritance:{scale:'none',mirror:'cor'},source:{kind:'test'},
  }
}

function object(instanceId,partId,position=[0,0,0]) {
  const value=new THREE.Object3D()
  value.userData={instanceId,partId}
  value.position.fromArray(position)
  value.updateMatrixWorld(true)
  return value
}

function definition(id,connectors) { return {id,connectivityV4:{status:'ready',connectors}} }

test('V4 candidate scoring uses required solved translation instead of raw connector-center distance',()=>{
  const axle=cylinder({endpointId:'axle',gender:'male',shape:'A',length:80})
  const hole=cylinder({endpointId:'hole',gender:'female',shape:'R',length:20})
  // Axis is local -Y. The axle center is one stud above the hole center, but that
  // is a legal insertion depth for an 80-LDU axle through a 20-LDU open bore.
  const moving=object('moving','axle-part',[0,1,0])
  const target=object('target','hole-part',[0,0,0])
  const defs=new Map([
    ['axle-part',definition('axle-part',[axle])],
    ['hole-part',definition('hole-part',[hole])],
  ])
  const candidate=findBestPlacementCandidateV4(moving,[target],{getDefinition:id=>defs.get(id)})
  assert.ok(candidate)
  assert.ok(candidate.distanceStud<1e-8,'already-valid axial insertion should not be rejected because centers differ')
  assert.ok(Math.abs(candidate.solution.axial.offsetLdu+20)<1e-8)
})

test('V4 candidate search chooses the placement requiring the smallest translation',()=>{
  const male=cylinder({endpointId:'male',gender:'male',shape:'A',length:20})
  const femaleA=cylinder({endpointId:'female-a',gender:'female',shape:'A',length:20})
  const femaleB=cylinder({endpointId:'female-b',gender:'female',shape:'A',length:20})
  const moving=object('moving','moving-part',[0.20,0,0])
  const a=object('A','target-a',[0,0,0])
  const b=object('B','target-b',[0.15,0,0])
  const defs=new Map([
    ['moving-part',definition('moving-part',[male])],
    ['target-a',definition('target-a',[femaleA])],
    ['target-b',definition('target-b',[femaleB])],
  ])
  const candidates=findPlacementCandidatesV4(moving,[a,b],{getDefinition:id=>defs.get(id),captureDistanceStud:0.55})
  assert.equal(candidates.length,2)
  assert.equal(candidates[0].targetObject,b)
  assert.ok(candidates[0].distanceStud<candidates[1].distanceStud)
})

test('V4 aligned candidates respect the conservative pre-snap axis threshold',()=>{
  const male=cylinder({endpointId:'male',gender:'male',shape:'A',length:20})
  const female=cylinder({endpointId:'female',gender:'female',shape:'A',length:20})
  const moving=object('moving','moving-part',[0.1,0,0])
  moving.rotation.z=Math.PI/2
  moving.updateMatrixWorld(true)
  const target=object('target','target-part',[0,0,0])
  const defs=new Map([
    ['moving-part',definition('moving-part',[male])],
    ['target-part',definition('target-part',[female])],
  ])
  const candidate=findBestPlacementCandidateV4(moving,[target],{getDefinition:id=>defs.get(id),minAxisAlignment:0.9})
  assert.equal(candidate,null)
})
