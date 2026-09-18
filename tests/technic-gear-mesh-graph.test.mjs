import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { PARTS } from '../parts.js'
import { createConnection } from '../connections-v3.js'
import { findExactGearMeshPairs } from '../snapping-v3.js'
import { analyzeTechnicAwareDrivetrain } from '../technic/drivetrain-v1.js'

function gearDefinition(id,{teeth,radius,anchor=[0,0,0],signs=[-1,1]}={}){
  return {
    id,name:id,
    connectors:[{id:'axle-hole',type:'axle-hole',position:[0,0,0],axis:[0,0,1]}],
    mechanics:{gear:{kind:'bevel',teeth,pitchRadius:radius,meshAnchorLdu:anchor,meshAxisLdu:[0,0,1],bevelApexSigns:signs,meshApexToleranceStud:.16}},
  }
}

const diff=gearDefinition('test-graph-62821',{teeth:28,radius:28/16,anchor:[0,0,27],signs:[-1]})
const red=gearDefinition('test-graph-18575',{teeth:20,radius:20/16})
PARTS.push(diff,red)

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
