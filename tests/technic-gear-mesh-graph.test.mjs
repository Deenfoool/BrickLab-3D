import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { PARTS } from '../parts.js'
import { createConnection } from '../connections-v3.js'
import { findExactGearMeshPairs } from '../snapping-v3.js'
import { analyzeTechnicAwareDrivetrain } from '../technic/drivetrain-v1.js'
import { solveShaftRatios } from '../kinematics/solver-v1.js'

function gearDefinition(id,{teeth,radius,anchor=[0,0,0],signs=[-1,1]}={}){
  return {
    id,name:id,
    connectors:[{id:'axle-hole',type:'axle-hole',position:[0,0,0],axis:[0,0,1]}],
    mechanics:{gear:{kind:'bevel',teeth,pitchRadius:radius,meshAnchorLdu:anchor,meshAxisLdu:[0,0,1],bevelApexSigns:signs,meshApexToleranceStud:.16}},
  }
}

const diff=gearDefinition('test-graph-62821',{teeth:28,radius:28/16,anchor:[0,0,27],signs:[-1]})
diff.mechanics.gear.differentialHousing=true
const red=gearDefinition('test-graph-18575',{teeth:20,radius:20/16})
const blue=gearDefinition('test-graph-6589',{teeth:12,radius:12/16})
PARTS.push(diff,red,blue)

function objectFor(def,id){
  const root=new THREE.Group()
  root.userData={partId:def.id,instanceId:id}
  const visual=new THREE.Group()
  visual.userData.ldrawVisual=true
  visual.scale.setScalar(1/20)
  root.add(visual)
  return root
}

test('exact 20T ↔ 28T bevel contact is a persistent gear-mesh graph edge and drivetrain mesh',()=>{
  const housing=objectFor(diff,'yellow-differential')
  const pinion=objectFor(red,'red-20t')
  pinion.position.set(1.85,0,0)
  pinion.rotation.y=Math.PI/2
  housing.updateMatrixWorld(true)
  pinion.updateMatrixWorld(true)

  const [candidate]=findExactGearMeshPairs([housing,pinion])
  assert.ok(candidate)
  const link=createConnection(candidate.movingGear.object,candidate.source,candidate.fixedGear.object,candidate.target)
  assert.equal(link.kind,'gear-mesh')

  const drivetrain=analyzeTechnicAwareDrivetrain([housing,pinion],[link])
  assert.equal(drivetrain.physicalGearMeshes.length,1)
  assert.equal(drivetrain.physicalGearMeshes[0].kind,'bevel')
  const mesh=drivetrain.physicalGearMeshes[0]
  assert.deepEqual(new Set([mesh.a.teeth,mesh.b.teeth]),new Set([20,28]))
  assert.ok(Math.abs(Math.abs(mesh.ratioAB*mesh.ratioBA)-1)<1e-9)
})

test('saved mesh and differential seat propagate Kinematics from either 20T or carrier',()=>{
  const housing=objectFor(diff,'yellow-carrier')
  const pinion=objectFor(red,'red-pinion')
  const inner=objectFor(blue,'blue-inner-12t')
  pinion.position.set(2.2,0,.3) // deliberately outside strict live mesh tolerance
  pinion.rotation.y=Math.PI/2
  housing.updateMatrixWorld(true);pinion.updateMatrixWorld(true);inner.updateMatrixWorld(true)
  const connections=[
    {id:'saved-mesh',kind:'gear-mesh',a:{instanceId:'red-pinion'},b:{instanceId:'yellow-carrier'}},
    {id:'saved-seat',kind:'differential-seat',a:{instanceId:'yellow-carrier'},b:{instanceId:'blue-inner-12t'}},
  ]
  const drivetrain=analyzeTechnicAwareDrivetrain([housing,pinion,inner],connections)
  const redShaft=drivetrain.shaftByPart.get('red-pinion').id
  const carrierShaft=drivetrain.shaftByPart.get('yellow-carrier').id
  const blueShaft=drivetrain.shaftByPart.get('blue-inner-12t').id
  assert.ok(drivetrain.physicalGearMeshes.some(mesh=>mesh.authoritativeGraphLink))
  assert.equal(drivetrain.differentialSeats.length,1)
  for(const driver of [redShaft,carrierShaft]){
    const solved=solveShaftRatios(driver,drivetrain.gearMeshes)
    assert.equal(solved.conflicts.length,0)
    assert.ok(Number.isFinite(solved.ratios[redShaft]))
    assert.ok(Number.isFinite(solved.ratios[carrierShaft]))
    assert.ok(Number.isFinite(solved.ratios[blueShaft]))
  }
})

test('saved bevel mesh outside live tolerance preserves orientation-derived rotation direction',()=>{
  const housing=objectFor(diff,'direction-carrier')
  const pinion=objectFor(red,'direction-pinion')
  // Mirror the 20T to the opposite side. The nearest valid bevel apex uses
  // opposite apex signs, so this pair must rotate with a positive signed ratio.
  pinion.position.set(-2.2,0,.3)
  pinion.rotation.y=Math.PI/2
  housing.updateMatrixWorld(true);pinion.updateMatrixWorld(true)
  const drivetrain=analyzeTechnicAwareDrivetrain([housing,pinion],[
    {id:'saved-direction-mesh',kind:'gear-mesh',a:{instanceId:'direction-pinion'},b:{instanceId:'direction-carrier'}},
  ])
  const mesh=drivetrain.physicalGearMeshes.find(item=>item.authoritativeGraphLink)
  assert.ok(mesh)
  assert.ok(mesh.ratioAB>0)
  assert.ok(mesh.ratioBA>0)
})

test('62821 and seated 6589 are recovered from scene geometry without a persisted V4 seat record',()=>{
  const housing=objectFor(diff,'geometry-carrier')
  const inner=objectFor(blue,'geometry-inner-12t')
  // First verified 62821 seat is [0,0,-17] LDU. The fixture-aware fallback uses
  // the actual LDraw visual transform, so this remains valid under recentering.
  inner.position.set(0,0,-17/20)
  housing.updateMatrixWorld(true);inner.updateMatrixWorld(true)
  const drivetrain=analyzeTechnicAwareDrivetrain([housing,inner],[])
  assert.equal(drivetrain.differentialSeats.length,1)
  assert.equal(drivetrain.differentialSeats[0].inferred,true)
  assert.equal(drivetrain.differentialSeats[0].source,'verified-ldraw-seat-geometry')
})

test('18575 ↔ 62821 mesh is recovered from scene geometry when an old project has no gear-mesh record',()=>{
  const housing=objectFor(diff,'geometry-ring-carrier')
  const pinion=objectFor(red,'geometry-ring-pinion')
  // Deliberately outside the strict live apex tolerance used by normal detection,
  // but still close to the verified assembled bevel relation.
  pinion.position.set(2.2,0,.3)
  pinion.rotation.y=Math.PI/2
  housing.updateMatrixWorld(true);pinion.updateMatrixWorld(true)
  const drivetrain=analyzeTechnicAwareDrivetrain([housing,pinion],[])
  const mesh=drivetrain.physicalGearMeshes.find(item=>item.inferredFromScene)
  assert.ok(mesh)
  assert.equal(mesh.authoritativeVerifiedPair,true)
  assert.deepEqual(new Set([mesh.a.teeth,mesh.b.teeth]),new Set([20,28]))
})
