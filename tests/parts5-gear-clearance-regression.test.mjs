import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  GEAR_MESH_CLEARANCE_STUD,
  evaluateBevelMesh,
  evaluateSpurMesh,
  solveBevelSnap,
  solveSpurSnap,
} from '../parts5/gear-mesh-math-v1.js'

const gear=(teeth,center,axis)=>({
  teeth,
  pitchRadius:teeth/16,
  center:new THREE.Vector3(...center),
  axis:new THREE.Vector3(...axis),
  reference:new THREE.Vector3(0,0,1),
})

test('12T bevel snap uses the real 17 LDU per-axis spacing instead of overlapping raw pitch cones',()=>{
  const fixed=gear(12,[0,0,0],[1,0,0])
  const moving=gear(12,[0,.9,.9],[0,1,0])
  const solution=solveBevelSnap(moving,fixed,{captureDistance:2})
  assert.ok(solution)
  assert.equal(solution.clearanceStud,0.1)
  assert.ok(Math.abs(solution.targetDistance-Math.hypot(.85,.85))<1e-9)
  assert.ok(solution.targetDistance>solution.rawPitchDistance)

  const placed={...moving,center:solution.desiredCenter.clone()}
  const validation=evaluateBevelMesh(placed,fixed)
  assert.equal(validation.valid,true)
  assert.ok(validation.apexError<1e-9)
})

test('spur solver and validator share the same working backlash',()=>{
  const fixed=gear(20,[0,0,0],[0,1,0])
  const moving=gear(12,[2,0,0],[0,1,0])
  const solution=solveSpurSnap(moving,fixed,{captureDistance:2})
  assert.ok(solution)
  assert.equal(solution.clearanceStud,GEAR_MESH_CLEARANCE_STUD.spur)
  assert.equal(solution.targetDistance,12/16+20/16+GEAR_MESH_CLEARANCE_STUD.spur)

  const placed={...moving,center:solution.desiredCenter.clone()}
  const validation=evaluateSpurMesh(placed,fixed)
  assert.equal(validation.valid,true)
  assert.ok(validation.distanceError<1e-9)
})

test('clearance can be explicitly disabled for analytical callers',()=>{
  const a=gear(12,[0,0,0],[1,0,0])
  const b=gear(12,[0,.75,.75],[0,1,0])
  const validation=evaluateBevelMesh(a,b,{clearanceStud:0})
  assert.equal(validation.clearanceStud,0)
  assert.ok(Math.abs(validation.targetDistance-Math.hypot(.75,.75))<1e-9)
})
