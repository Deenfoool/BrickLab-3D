import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  AXLE_CONTACT_VERSION_V4,
  axlePairContactDistanceStudV4,
  technicAxleContactDistanceStudV4,
  technicAxleContactIntervalsV4,
  technicAxleContactReachStudV4,
} from '../connectors-v4/axle-contact-v4.js'

function connector({gender='male',sections,centered=true}={}){
  return{
    schemaVersion:4,
    family:'cylinder',
    gender,
    frame:{positionLdu:[0,0,0],orientation:[1,0,0,0,1,0,0,0,1]},
    geometry:{sections,caps:'none',centered},
    snap:{slide:true},
  }
}

const frame={
  position:new THREE.Vector3(0,0,0),
  axis:new THREE.Vector3(0,1,0),
  reference:new THREE.Vector3(1,0,0),
}

test('pure Technic axle is one continuous contact rail over its full length',()=>{
  const axle=connector({sections:[{shape:'A',radiusLdu:6,lengthLdu:100}]})
  assert.equal(AXLE_CONTACT_VERSION_V4,'axle-contact-v4.1.0')
  assert.deepEqual(technicAxleContactIntervalsV4(axle),[[-50,50]])
  assert.equal(technicAxleContactReachStudV4(axle),2.5)

  for(const y of [-2.49,-1.37,0,.83,2.49]){
    const distance=technicAxleContactDistanceStudV4(axle,frame,new THREE.Vector3(.11,y,0))
    assert.ok(Math.abs(distance-.11)<1e-9,`full rail should capture at y=${y}`)
  }
})

test('55013-style axle with stop exposes all 158 LDU of A-profile but excludes R8 stop',()=>{
  const axle=connector({sections:[
    {shape:'A',radiusLdu:6,lengthLdu:158},
    {shape:'R',radiusLdu:8,lengthLdu:2},
  ]})
  assert.deepEqual(technicAxleContactIntervalsV4(axle),[[-80,78]])
  assert.equal(technicAxleContactReachStudV4(axle),4)

  const nearStopRail=technicAxleContactDistanceStudV4(axle,frame,new THREE.Vector3(.08,3.89,0))
  assert.ok(Math.abs(nearStopRail-.08)<1e-9)

  // 79 LDU is inside the physical R8 stop, not the A6 axle rail. The nearest
  // usable axle material ends at 78 LDU, so the distance includes the axial gap.
  const onStop=technicAxleContactDistanceStudV4(axle,frame,new THREE.Vector3(0,3.95,0))
  assert.ok(Math.abs(onStop-.05)<1e-9)
})

test('hybrid pin+axle exposes only its axle section as a continuous rail',()=>{
  const hybrid=connector({sections:[
    {shape:'R',radiusLdu:6,lengthLdu:20},
    {shape:'A',radiusLdu:6,lengthLdu:40},
    {shape:'R',radiusLdu:6,lengthLdu:20},
  ]})
  assert.deepEqual(technicAxleContactIntervalsV4(hybrid),[[-20,20]])
})

test('pair distance uses receiver position against any point on the axle rail',()=>{
  const axle=connector({sections:[{shape:'A',radiusLdu:6,lengthLdu:160}]})
  const hole=connector({gender:'female',sections:[{shape:'A',radiusLdu:6,lengthLdu:20}]})
  const holeFrame={...frame,position:new THREE.Vector3(.2,3.4,0)}
  const distance=axlePairContactDistanceStudV4(hole,axle,holeFrame,frame,{family:'cylinder'})
  assert.ok(Math.abs(distance-.2)<1e-9)
})
