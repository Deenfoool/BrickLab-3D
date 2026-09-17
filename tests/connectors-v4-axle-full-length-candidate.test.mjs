import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { findPlacementCandidatesV4 } from '../connectors-v4/candidate-v4.js'

const orientation=[1,0,0,0,1,0,0,0,1]

function cylinder(endpointId,gender,sections){
  return{
    schemaVersion:4,
    endpointId,
    family:'cylinder',
    gender,
    frame:{
      positionLdu:[0,0,0],
      positionStud:[0,0,0],
      orientation:[...orientation],
      orientationBrickLab:[...orientation],
      axis:[0,-1,0],
    },
    geometry:{sections,caps:'none',centered:true},
    snap:{slide:true},
  }
}

function definition(id,connector){
  return{id,connectivityV4:{status:'ready',connectors:[connector]}}
}

function object(partId,x,y,z){
  const value=new THREE.Group()
  value.userData={partId,instanceId:`${partId}-${x}-${y}-${z}`}
  value.position.set(x,y,z)
  value.updateMatrixWorld(true)
  return value
}

const axle5=cylinder('axle-5','male',[{shape:'A',radiusLdu:6,lengthLdu:100,elastic:false}])
const axle8Stop=cylinder('axle-8-stop','male',[
  {shape:'A',radiusLdu:6,lengthLdu:158,elastic:false},
  {shape:'R',radiusLdu:8,lengthLdu:2,elastic:false},
])
const axleHole=cylinder('axle-hole','female',[{shape:'A',radiusLdu:6,lengthLdu:20,elastic:false}])

function candidatesFor(axleConnector,holeY){
  const defs=new Map([
    ['axle',definition('axle',axleConnector)],
    ['hole',definition('hole',axleHole)],
  ])
  const shaft=object('axle',0,0,0)
  const receiver=object('hole',.18,holeY,0)
  return findPlacementCandidatesV4(receiver,[shaft],{
    getDefinition:id=>defs.get(id),
    captureDistanceStud:.3,
    minAxisAlignment:.99,
    maxResults:20,
  })
}

test('axle 5 captures a receiver near either end and at arbitrary middle positions',()=>{
  for(const y of [-2.35,-1.17,.43,2.35]){
    const candidates=candidatesFor(axle5,y)
    assert.ok(candidates.length>0,`expected continuous contact candidate at y=${y}`)
    const best=candidates[0]
    assert.equal(best.activationPreview.family,'technic-axle-keyed-hole')
    assert.ok(Math.abs(best.distanceStud-.18)<1e-7)
    assert.ok(Math.abs(best.solution.diagnostics.continuousAxleContactStud-.18)<1e-7)
  }
})

test('axle 8 with stop keeps continuous capture almost to the stop',()=>{
  const candidates=candidatesFor(axle8Stop,3.82)
  assert.ok(candidates.length>0)
  const best=candidates[0]
  assert.equal(best.activationPreview.family,'technic-axle-keyed-hole')
  assert.ok(Math.abs(best.distanceStud-.18)<1e-7)
})
