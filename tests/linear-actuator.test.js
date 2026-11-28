import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {linearActuators,actuatorTravel} from '../src/mechanics/actuators.js'
import {portsFor} from '../src/mechanics/catalog.js'
import {evaluateInsertion,connectionMode} from '../src/mechanics/axial.js'
registerHooks({resolve(specifier,context,next){if(specifier==='three')return next(new URL('../vendor/three/build/three.module.min.js',import.meta.url).href,context);if(specifier.startsWith('three/addons/'))return next(new URL(specifier.replace('three/addons/','../vendor/three/examples/jsm/'),import.meta.url).href,context);return next(specifier,context)}})
const {createAssembly,connectAligned,rotationMotion,rotationPoses}=await import('../src/editor/model.js')
const {joinedPose}=await import('../src/editor/placement.js')
const {actuatorBranch}=await import('../src/editor/actuator-motion.js')
const part=(id,design,position=[0,0,0])=>({id,design,position,rotation:[0,0,0,1]})
test('large actuator stroke is 5 studs with reverse direction and travel stops',()=>{
 for(const id of Object.keys(linearActuators)){
  const spec=linearActuators[id],direction=spec.initial?-1:1
  assert.ok(Math.abs(actuatorTravel(id,direction*26*Math.PI).displacement-direction*50)<1e-8)
  const end=actuatorTravel(id,direction*100*Math.PI)
  assert.equal(end.extension,spec.initial?0:100)
  assert.equal(end.atLimit,true)
 }
})
test('43097 housing snaps to 61904 at the same keyed datum; shaft remains independently rotatable',()=>{
 const housing=portsFor('43097-f2').find(p=>p.id==='actuator-housing-seat'),mount=portsFor('61904').find(p=>p.id==='actuator-bracket-seat')
 assert.equal(connectionMode(housing,mount).rotation,'fixed')
 const fit=evaluateInsertion(housing,mount,{offset:0,direction:1,roll:0})
 assert.ok(fit.ok);assert.equal(fit.placement.keyStep,2*Math.PI)
 assert.equal(evaluateInsertion(housing,mount,{offset:1,direction:1}).ok,false)
 const a=part('a','43097-f2'),b=part('b','61904',[50,50,50])
 Object.assign(b,joinedPose(b,mount,a,housing,fit.placement))
 assert.deepEqual(b.position,a.position)
 const assembly=createAssembly([a,b],[])
 assert.equal(connectAligned(assembly,[a],[b]).some(l=>l.shaft.port===housing.id),true)
 const input=portsFor(a.design).find(p=>p.actuatorInput)
 assert.equal(connectionMode(portsFor('3705').find(p=>p.role==='axle'),input).rotation,'continuous')
})
test('manual preview moves only the rod and its open branch; rejects closed loops',()=>{
 const a=part('a','43097-f2'),b=part('b','61904'),p=part('p','3673',[-10,0,290])
 const assembly=createAssembly([a,b,p],[])
 const links=connectAligned(assembly,[a],[b,p])
 assert.ok(links.some(l=>l.socket.part==='a'&&l.socket.port==='shadow-9d46d615dac1'))
 const motion=rotationMotion('a',[a,b,p],assembly)
 assert.ok(motion.ok);assert.deepEqual(motion.range,[-100,0])
 const poses=rotationPoses([a,b,p],motion,-50)
 assert.ok(Math.abs(poses.find(p=>p.id==='a').previewActuatorRod+50)<1e-8)
 assert.ok(Math.abs(poses.find(p=>p.id==='p').position[2]-240)<1e-8)
 assert.ok(!poses.some(p=>p.id==='b'))
 assert.equal(actuatorBranch(a,[a,b,p],[{a:'p',b:'a',socketPort:'shadow-9d46d615dac1'},{a:'a',b:'b',shaftPort:'actuator-housing-seat'},{a:'p',b:'b'}]),null)
})

test('actual input axle rotates independently and drives the rod through the full stroke',()=>{
 const a=part('a','43097-f2'),b=part('b','61904'),shaft=part('shaft','3705')
 const input=portsFor(a.design).find(p=>p.actuatorInput),male=portsFor(shaft.design)[0]
 const fit=evaluateInsertion(male,input,{offset:-60,direction:1,roll:0})
 assert.ok(fit.ok)
 Object.assign(shaft,joinedPose(shaft,male,a,input,fit.placement))
 const assembly=createAssembly([a,b,shaft],[])
 connectAligned(assembly,[a],[b,shaft])
 connectAligned(assembly,[shaft],[b])
 const motion=rotationMotion('shaft',[a,b,shaft],assembly)
 assert.ok(motion?.ok)
 assert.equal(motion.kind,'actuator')
 const end=motion.range.find(n=>Math.abs(n)>1)
 assert.ok(Math.abs(Math.abs(end)-9360)<1e-5)
 const poses=rotationPoses([a,b,shaft],motion,end*Math.PI/180)
 assert.ok(Math.abs(poses.find(p=>p.id==='a').previewActuatorRod+100)<1e-6)
 assert.ok(poses.some(p=>p.id==='shaft'))
 assert.ok(!poses.some(p=>p.id==='b'))
})
test('simple closed planar rocker linkage keeps all three hinge axes aligned',async()=>{
 const {planarActuatorLinkage}=await import('../src/editor/actuator-linkage.js')
 const {Vector3}=await import('three')
 const a=part('a','43097-f2'),bracket=part('bracket','61904'),base=part('base','32316'),rocker=part('rocker','32316')
 const line=start=>({start,axis:[1,0,0]})
 const j=(a,b,point,more={})=>({a,b,motion:'continuous',shaftLine:line(point),socketLine:line(point),...more})
 const joints=[j('a','bracket',[0,0,0],{motion:'fixed',shaftPort:'actuator-housing-seat'}),j('bracket','base',[0,0,-30]),j('rocker','a',[0,0,290],{socketPort:'shadow-9d46d615dac1'}),j('base','rocker',[0,100,100])]
 const parts=[a,bracket,base,rocker]
 const mechanism=planarActuatorLinkage(a,parts,joints,{start:new Vector3(),axis:new Vector3(0,0,1)})
 assert.ok(mechanism)
 assert.ok(mechanism.range[0]<-50)
 const poses=mechanism.solve(-50)
 assert.ok(poses)
 const transform=poses.get('a'),front=new Vector3(0,0,240).applyQuaternion(transform.rotation).add(transform.translation)
 const rockerPose=poses.get('rocker'),end=new Vector3(0,0,290).applyQuaternion(rockerPose.rotation).add(rockerPose.translation)
 assert.ok(front.distanceTo(end)<.02)
 const rear=new Vector3(0,0,-30).applyQuaternion(transform.rotation).add(transform.translation)
 assert.ok(rear.distanceTo(new Vector3(0,0,-30))<.02)
})
test('actual LDraw pack produces independently movable housing, input and rod meshes',async()=>{
 const {readFile}=await import('node:fs/promises')
 const {loadPartModel,parts,partMesh,previewActuatorMesh}=await import('../src/editor/parts.js')
 const old=globalThis.fetch
 try{
  globalThis.fetch=async url=>new Response(await readFile(url))
  const model=await loadPartModel(parts['43097-f2'])
  assert.deepEqual(new Set(model.meshes.map(g=>g.userData.actuatorSection)),new Set(['housing','input','rod']))
  const object=partMesh(model,'#555555')
  previewActuatorMesh(object,{previewActuatorRod:-50,previewActuatorInput:Math.PI})
  for(const mesh of object.children){
   const section=mesh.geometry.userData.actuatorSection
   assert.equal(mesh.position.z,section==='rod'?-50:0)
   assert.equal(mesh.rotation.z,section==='input'?Math.PI:0)
  }
  previewActuatorMesh(object,{})
  assert.ok(object.children.every(mesh=>mesh.position.z===0&&mesh.rotation.z===0))
  object.userData.finish.dispose()
 }finally{globalThis.fetch=old}
})
