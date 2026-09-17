import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  ENGINE_CAM_ECCENTRICITY_STUD,
  engineCamFollowerDisplacementV1,
} from '../kinematics/engine-cam-v1.js'

function matrix(position=[0,0,0],rotationZ=0){
  const m=new THREE.Matrix4().makeRotationZ(rotationZ)
  m.setPosition(...position)
  return m
}

test('4368 eccentricity is 4 LDU = 0.2 stud',()=>{
  assert.equal(ENGINE_CAM_ECCENTRICITY_STUD,0.2)
})

test('piston follower has zero displacement at its captured baseline phase',()=>{
  const baseline=matrix()
  const piston=matrix()
  const result=engineCamFollowerDisplacementV1({diskBaselineMatrix:baseline,diskCurrentMatrix:baseline.clone(),pistonBaselineMatrix:piston})
  assert.equal(result.valid,true)
  assert.ok(Math.abs(result.displacementStud)<1e-12)
  assert.equal(result.strokeStud,0.4)
})

test('half a crank turn produces the full 0.4 stud piston stroke along its guide axis',()=>{
  const baseline=matrix()
  const current=matrix([0,0,0],Math.PI)
  // Rotate piston so its local +X guide axis points along world +Y.
  const piston=matrix([0,0,0],Math.PI/2)
  const result=engineCamFollowerDisplacementV1({diskBaselineMatrix:baseline,diskCurrentMatrix:current,pistonBaselineMatrix:piston})
  assert.equal(result.valid,true)
  assert.ok(Math.abs(result.displacementStud+0.4)<1e-12)
})

test('one full crank revolution returns piston to baseline',()=>{
  const baseline=matrix()
  const current=matrix([0,0,0],Math.PI*2)
  const piston=matrix([0,0,0],Math.PI/2)
  const result=engineCamFollowerDisplacementV1({diskBaselineMatrix:baseline,diskCurrentMatrix:current,pistonBaselineMatrix:piston})
  assert.equal(result.valid,true)
  assert.ok(Math.abs(result.displacementStud)<1e-12)
})
