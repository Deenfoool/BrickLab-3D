import { test } from 'node:test'
import assert from 'node:assert/strict'

const {
  defaultLDrawMechanismPose,
  ldrawMechanismDescriptor,
  normalizeLDrawMechanismPose,
}=await import('../ldraw/mechanism-registry-v1.js')
const { technicPartProfileV1 }=await import('../technic/part-profile-v1.js')
const { classifyLDrawDefinition }=await import('../ldraw/mechanical-intelligence-v1.js')
const { projectSnapshotFingerprint }=await import('../projects/library-v1.js')

test('known flexible, universal, hinge and ball-joint LDraw ids have explicit semantics',()=>{
  assert.equal(technicPartProfileV1({id:'ldraw-32199'}).role,'flex-axle')
  assert.equal(technicPartProfileV1({id:'ldraw-9244'}).role,'universal-joint')
  assert.equal(technicPartProfileV1({id:'ldraw-43056c01'}).role,'hinge-joint')
  assert.equal(technicPartProfileV1({id:'ldraw-59141'}).role,'ball-joint')
})

test('flexible axle is not downgraded to a rigid axle by metadata classification',()=>{
  const result=classifyLDrawDefinition({id:'ldraw-32199',name:'Technic Axle Flexible 11'})
  assert.equal(result.class,'flex-axle')
  assert.equal(result.properties.flexible,true)
})

test('aliases resolve to canonical mechanism definitions',()=>{
  assert.equal(ldrawMechanismDescriptor('ldraw-55709').canonical,'32199')
  assert.equal(ldrawMechanismDescriptor('ldraw-9244').assemblyFile,'3712c01.dat')
  assert.equal(ldrawMechanismDescriptor('ldraw-59141').canonical,'50923')
})

test('mechanism poses are complete, finite and clamped to physical editor limits',()=>{
  assert.deepEqual(defaultLDrawMechanismPose('ldraw-43056c01'),{angleDeg:0})
  assert.deepEqual(normalizeLDrawMechanismPose('ldraw-43056c01',{angleDeg:999}),{angleDeg:175})
  assert.deepEqual(normalizeLDrawMechanismPose('ldraw-32199',{bendXDeg:-999,bendYDeg:20}),{
    bendXDeg:-95,bendYDeg:20,
  })
})

test('complete assemblies describe independent movable components',()=>{
  const cardan=ldrawMechanismDescriptor('ldraw-9244')
  assert.deepEqual(cardan.components.map(item=>item.role),['input-yoke','output-yoke','cross'])
  const hinge=ldrawMechanismDescriptor('ldraw-43056c01')
  assert.equal(hinge.components.find(item=>item.role==='moving-leaf').poseKey,'angleDeg')
})

test('project fingerprint changes when an internal mechanism pose changes',()=>{
  const snapshot={name:'pose',parts:[{instanceId:'a',partId:'ldraw-43056c01',position:[0,0,0],rotation:[0,0,0],mechanismPose:{angleDeg:0}}]}
  const changed=structuredClone(snapshot);changed.parts[0].mechanismPose.angleDeg=45
  assert.notEqual(projectSnapshotFingerprint(snapshot),projectSnapshotFingerprint(changed))
})
