import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  buildColliderProfile,
  clearLDrawColliderProfileCache,
  ldrawColliderProfileCacheSize,
} from '../collider-profiles-v3.js'
import { applyLDrawMechanismPose } from '../ldraw/mechanism-registry-v1.js'

function mesh(w,h,d,x,y,z){
  const value=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial())
  value.position.set(x,y,z)
  return value
}

function ldrawFrame(){
  const root=new THREE.Group()
  root.userData.partId='ldraw-test-frame'
  root.userData.ldraw={status:'ready'}
  root.add(mesh(4,.5,.45,0,1.75,0))
  root.add(mesh(4,.5,.45,0,-1.75,0))
  root.add(mesh(.5,3,.45,-1.75,0,0))
  root.add(mesh(.5,3,.45,1.75,0,0))
  return root
}

function contains(spec,x,y,z){
  const half=spec.size.clone().multiplyScalar(.5)
  return Math.abs(x-spec.center.x)<half.x-1e-6&&Math.abs(y-spec.center.y)<half.y-1e-6&&Math.abs(z-spec.center.z)<half.z-1e-6
}

test('arbitrary LDraw geometry creates a bounded compound surface profile',()=>{
  clearLDrawColliderProfileCache()
  const profile=buildColliderProfile(ldrawFrame(),{id:'ldraw-test-frame',connectors:[]})
  assert.equal(profile.kind,'ldraw-surface')
  assert.ok(profile.specs.length>1&&profile.specs.length<=72)
  assert.ok(profile.specs.every(spec=>spec.type==='box'&&spec.volume>0))
})

test('LDraw surface profile preserves a large through opening instead of filling its bounds',()=>{
  const profile=buildColliderProfile(ldrawFrame(),{id:'ldraw-test-frame-open',connectors:[]})
  assert.equal(profile.kind,'ldraw-surface')
  assert.equal(profile.specs.some(spec=>contains(spec,0,0,0)),false)
})

test('generated LDraw collider profiles are cached and returned as independent specs',()=>{
  clearLDrawColliderProfileCache()
  const definition={id:'ldraw-test-frame-cache',connectors:[]}
  const first=buildColliderProfile(ldrawFrame(),definition)
  const second=buildColliderProfile(ldrawFrame(),definition)
  assert.equal(ldrawColliderProfileCacheSize(),1)
  assert.equal(second.kind,'ldraw-surface-cache')
  second.specs[0].center.x+=99
  assert.notEqual(first.specs[0].center.x,second.specs[0].center.x)
})

test('flexible LDraw collider follows the saved bent pose instead of the straight source bounds',()=>{
  clearLDrawColliderProfileCache()
  const root=new THREE.Group()
  root.userData.partId='ldraw-32199';root.userData.color=0xd7263d;root.userData.ldraw={status:'ready'}
  applyLDrawMechanismPose(root,{bendXDeg:0,bendYDeg:0})
  const straight=buildColliderProfile(root,{id:'ldraw-32199',connectors:[]})
  applyLDrawMechanismPose(root,{bendXDeg:0,bendYDeg:40})
  const bent=buildColliderProfile(root,{id:'ldraw-32199',connectors:[]})
  const maxY=profile=>Math.max(...profile.specs.map(spec=>spec.center.y+spec.size.y/2))
  assert.match(straight.kind,/ldraw-surface/)
  assert.match(bent.kind,/ldraw-surface/)
  assert.ok(maxY(bent)>maxY(straight)+.5)
  assert.equal(ldrawColliderProfileCacheSize(),2)
})
