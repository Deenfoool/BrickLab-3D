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
