import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  ldrawMechanicalPivotLocalV1,
  mechanicalPivotWorldV1,
  preserveMechanicalPivotWorldV1,
} from '../editor/mechanical-rotation-pivot-v1.js'

const closeVec=(a,b,eps=1e-10)=>a.distanceTo(b)<=eps

test('LDraw visual offset is treated as the mechanical rotation pivot',()=>{
  const parent=new THREE.Group()
  const object=new THREE.Group()
  const visual=new THREE.Group()
  visual.userData.ldrawVisual=true
  visual.position.set(1.25,.4,-.7)
  object.add(visual)
  object.position.set(3,2,-1)
  parent.add(object)
  parent.updateMatrixWorld(true)

  const local=ldrawMechanicalPivotLocalV1(object)
  assert.deepEqual(local.toArray(),[1.25,.4,-.7])
  const fixed=mechanicalPivotWorldV1(object,local)

  object.rotation.set(.3,-.45,.8)
  object.updateMatrixWorld(true)
  assert.equal(closeVec(mechanicalPivotWorldV1(object,local),fixed),false)
  assert.equal(preserveMechanicalPivotWorldV1(object,local,fixed),true)
  assert.equal(closeVec(mechanicalPivotWorldV1(object,local),fixed),true)
})

test('pivot correction also works under a transformed parent',()=>{
  const parent=new THREE.Group()
  parent.position.set(-2,1,4)
  parent.rotation.y=.6
  const object=new THREE.Group()
  const visual=new THREE.Group()
  visual.userData.ldrawVisual=true
  visual.position.set(.8,-.25,.5)
  object.add(visual)
  object.position.set(1.5,.2,-.4)
  parent.add(object)
  parent.updateMatrixWorld(true)

  const local=ldrawMechanicalPivotLocalV1(object)
  const fixed=mechanicalPivotWorldV1(object,local)
  object.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI/2)
  object.updateMatrixWorld(true)
  preserveMechanicalPivotWorldV1(object,local,fixed)
  assert.equal(closeVec(mechanicalPivotWorldV1(object,local),fixed),true)
})
