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

test('V4 candidate scoring uses connector capture correction instead of raw connector-center distance',()=>{
  const axle=cylinder({endpointId:'axle',gender:'male',shape:'A',length:80})
  const hole=cylinder({endpointId:'hole',gender:'female',shape:'R',length:20})
  const moving=object('moving','axle-part',[0,1,0])
  const target=object('target','hole-part',[0,0,0])
  const defs=new Map([
    ['axle-part',definition('axle-part',[axle])],
    ['hole-part',definition('hole-part',[hole])],
  ])
  const candidate=findBestPlacementCandidateV4(moving,[target],{getDefinition:id=>defs.get(id)})
  assert.ok(candidate)
  assert.ok(candidate.distanceStud<1e-8,'already-valid axial insertion should not be rejected because connector centers differ axially')
  assert.ok(Math.abs(candidate.solution.axial.offsetLdu+20)<1e-8)
})

test('V4 candidate search chooses the placement requiring the smallest connector correction',()=>{
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

test('V4 aligned candidates respect an explicitly conservative pre-snap axis threshold',()=>{
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

test('default V4 discovery cone catches a nearby connector around 35 degrees off-axis',()=>{
  const male=cylinder({endpointId:'male',gender:'male',shape:'A',length:20})
  const female=cylinder({endpointId:'female',gender:'female',shape:'A',length:20})
  const moving=object('moving','moving-part',[0.08,0,0])
  moving.rotation.z=THREE.MathUtils.degToRad(35)
  moving.updateMatrixWorld(true)
  const target=object('target','target-part',[0,0,0])
  const defs=new Map([
    ['moving-part',definition('moving-part',[male])],
    ['target-part',definition('target-part',[female])],
  ])
  const candidate=findBestPlacementCandidateV4(moving,[target],{getDefinition:id=>defs.get(id)})
  assert.ok(candidate,'nearby 35-degree connector should be discoverable and corrected')
  assert.ok(candidate.alignment>0.8)
})

test('opposite LDCad connector axes are rejected instead of treated as perfect via abs(dot)',()=>{
  const male=cylinder({endpointId:'male',gender:'male',shape:'A',length:20})
  const female=cylinder({endpointId:'female',gender:'female',shape:'A',length:20})
  const moving=object('moving','moving-part',[0.05,0,0])
  moving.rotation.z=Math.PI
  moving.updateMatrixWorld(true)
  const target=object('target','target-part',[0,0,0])
  const defs=new Map([
    ['moving-part',definition('moving-part',[male])],
    ['target-part',definition('target-part',[female])],
  ])
  const candidate=findBestPlacementCandidateV4(moving,[target],{getDefinition:id=>defs.get(id)})
  assert.equal(candidate,null)
})

test('capture is endpoint-centric so an edge connector on a large rotating part is not lost',()=>{
  const male=cylinder({endpointId:'male',gender:'male',shape:'A',length:20,position:[3,0,0]})
  const female=cylinder({endpointId:'female',gender:'female',shape:'A',length:20})
  const moving=object('moving','moving-part')
  moving.rotation.z=THREE.MathUtils.degToRad(30)
  moving.updateMatrixWorld(true)
  const endpoint=new THREE.Vector3(3,0,0).applyQuaternion(moving.quaternion)
  const target=object('target','target-part',endpoint.toArray())
  const defs=new Map([
    ['moving-part',definition('moving-part',[male])],
    ['target-part',definition('target-part',[female])],
  ])
  const candidate=findBestPlacementCandidateV4(moving,[target],{getDefinition:id=>defs.get(id),captureDistanceStud:0.3})
  assert.ok(candidate)
  assert.ok(candidate.distanceStud<1e-7,'mating endpoints are already coincident')
  assert.ok(candidate.originTranslationStud>0.5,'object origin may move substantially while rotating around an edge connector')
})

test('preferred candidate hysteresis stabilizes adjacent nearly-equal snap points without bypassing validity',()=>{
  const male=cylinder({endpointId:'male',gender:'male',shape:'A',length:20})
  const femaleA=cylinder({endpointId:'female-a',gender:'female',shape:'A',length:20})
  const femaleB=cylinder({endpointId:'female-b',gender:'female',shape:'A',length:20})
  const moving=object('moving','moving-part',[0,0,0])
  const a=object('A','target-a',[0.10,0,0])
  const b=object('B','target-b',[0.115,0,0])
  const defs=new Map([
    ['moving-part',definition('moving-part',[male])],
    ['target-a',definition('target-a',[femaleA])],
    ['target-b',definition('target-b',[femaleB])],
  ])
  const first=findPlacementCandidatesV4(moving,[a,b],{getDefinition:id=>defs.get(id),captureDistanceStud:0.4})
  assert.equal(first[0].targetObject,a)
  const preferredKey=first.find(candidate=>candidate.targetObject===b)?.key
  const stabilized=findPlacementCandidatesV4(moving,[a,b],{getDefinition:id=>defs.get(id),captureDistanceStud:0.4,preferredKey})
  assert.equal(stabilized[0].targetObject,b)
})
