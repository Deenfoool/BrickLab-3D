import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as THREE from 'three'
import { evaluateBevelMesh } from '../parts5/gear-mesh-math-v1.js'

const source=()=>readFile(new URL('../technic/drivetrain-v1.js',import.meta.url),'utf8')

test('Technic drivetrain uses LDraw mesh anchors instead of the carrier axle-hole as the gear centre',async()=>{
  const text=await source()
  assert.match(text,/function explicitGearFrame\(/)
  assert.match(text,/gear\?\.meshAnchorLdu/)
  assert.match(text,/applyMatrix4\(visual\.matrix\)\.applyMatrix4\(object\.matrixWorld\)/)
  assert.match(text,/gearFrameSource:frame\.source \?\? 'rotary-port'/)
})

test('62821 28T ring and 18575 20T double bevel produce a valid 90 degree mesh at the real ring plane',()=>{
  // LDraw runtime flips Z and scales 1 LDU to 1/20 stud. The 62821 ring working
  // plane is +27 LDU in source space, therefore -1.35 stud after the visual transform.
  const differential={
    teeth:28,
    pitchRadius:28/16,
    center:new THREE.Vector3(0,0,-27/20),
    axis:new THREE.Vector3(0,0,-1),
    bevelApexSigns:[-1],
  }
  const pinion={
    teeth:20,
    pitchRadius:20/16,
    center:new THREE.Vector3(1.85,0,0),
    axis:new THREE.Vector3(1,0,0),
    bevelApexSigns:[-1,1],
  }
  const mesh=evaluateBevelMesh(differential,pinion,{apexTolerance:.16})
  assert.equal(mesh.valid,true)
  assert.equal(mesh.signA,-1)
  assert.ok(mesh.apexError<1e-9)
  assert.ok(mesh.axisOrthogonality<1e-9)
})

test('62821 ring stays one-sided and cannot mesh through the back of the carrier',()=>{
  const differential={
    pitchRadius:28/16,
    center:new THREE.Vector3(0,0,-27/20),
    axis:new THREE.Vector3(0,0,-1),
    bevelApexSigns:[-1],
  }
  const pinion={
    pitchRadius:20/16,
    center:new THREE.Vector3(1.85,0,-2.7),
    axis:new THREE.Vector3(1,0,0),
    bevelApexSigns:[-1,1],
  }
  assert.equal(evaluateBevelMesh(differential,pinion,{apexTolerance:.16}).valid,false)
})
