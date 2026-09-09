import test from 'node:test'
import assert from 'node:assert/strict'
import RAPIER from '@dimforge/rapier3d-compat'
import { AudioManager, sanitizeSettings } from '../audio/manager.js'
import { SOUNDS, synthesize } from '../assets/audio/recipes.js'
import { MechanicalAudio, impactLevel, connectorSound } from '../audio/mechanics.js'
import { emitAudioEvent, observeAudioEvents } from '../audio-events.js'
const param=()=>({value:0,setTargetAtTime(v){this.value=v}})
function context(){
 const node=()=>({connect(){},disconnect(){},gain:param(),threshold:param(),ratio:param(),playbackRate:param(),positionX:param(),positionY:param(),positionZ:param(),start(){},stop(){this.onended?.()}})
 return {state:'running',currentTime:0,destination:{},createGain:node,createDynamicsCompressor:node,createBufferSource:node,createPanner:node,createBuffer:(channels,length,rate)=>({length,sampleRate:rate,copyToChannel(){}}),resume:async()=>{}}
}
const store=()=>({v:null,getItem(){return this.v},setItem(k,v){this.v=v}})
test('autoplay: context is never created before explicit unlock; settings persist safely',async()=>{
 let calls=0;const storage=store(),a=new AudioManager({storage,contextFactory:()=>{calls++;return context()}})
 assert.equal(a.play('snap'),null);assert.equal(calls,0)
 await a.unlock();assert.equal(calls,1)
 a.setSettings({master:.4,sfx:.2,music:.1,mute:true})
 assert.equal(a.play('snap'),null)
 const b=new AudioManager({storage});assert.deepEqual(b.settings,a.settings)
 assert.equal(sanitizeSettings({master:5,sfx:-1,music:'bad'}).music,.23)
 assert.doesNotThrow(()=>new AudioManager({storage:{getItem(){throw Error('denied')}}}))
})
test('all local recipes are deterministic, bounded, non-silent; variants differ; music joins periodically',()=>{
 for(const name of Object.keys(SOUNDS)){
   const a=synthesize(name,0),b=synthesize(name,0);assert.deepEqual(a,b)
   let peak=0,energy=0;for(const v of a){assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));energy+=v*v}
   assert.ok(peak<.8 && peak>.001,name);assert.ok(energy>0,name)
   if(name==='music') assert.ok(Math.abs(a[0]-a.at(-1))<.004,'music seam is smaller than a normal sample transition')
   else if(!['motor','gears','tyres'].includes(name))assert.notDeepEqual(a,synthesize(name,1),name)
 }
})
test('buffer reuse, cooldown, polyphony, loop lifecycle, mute and missing recipe fallback',async()=>{
 let now=0;const a=new AudioManager({storage:store(),contextFactory:context,random:()=>.5,now:()=>now});await a.unlock()
 const first=a.play('snap');assert.ok(first);assert.equal(a.play('snap'),null)
 now=100;const second=a.play('snap');assert.equal(first.source.buffer,second.source.buffer)
 for(let i=0;i<30;i++){now+=100;a.play('place',{key:String(i)})}
 assert.ok(a.voices.size<=a.maxVoices);assert.ok([...a.voices].filter(v=>v.name==='place').length<=4)
 a.startLoop('motor',{rpm:120,load:.5});const voice=a.loops.get('motor');assert.ok(voice)
 a.updateLoop('motor',{rpm:600,load:1});assert.ok(voice.source.playbackRate.value>1)
 a.stopLoop('motor');assert.equal(a.loops.size,0)
 assert.equal(a.play('missing'),null);assert.ok(a.failed.has('missing/2'))
 a.setHidden(true);assert.equal(a.play('click'),null);assert.equal(a.master.gain.value,0)
})
test('missing music file is noncritical and not fetched repeatedly',async()=>{
 const previous=globalThis.fetch;let calls=0
 globalThis.fetch=async()=>{calls++;return {ok:false,status:404}}
 try{const a=new AudioManager({storage:store(),contextFactory:context});await a.unlock();await a.loadMusic();await a.loadMusic();assert.equal(calls,1);assert.ok(a.failed.has('music/workbench.ogg'));assert.ok(a.play('snap'))}finally{globalThis.fetch=previous}
})
test('connector semantics and three impact thresholds',()=>{
 assert.equal(connectorSound({source:'pin',target:'pin-hole'}),'pin-insert')
 assert.equal(connectorSound({source:'axle',target:'axle-hole'}),'axle-insert')
 assert.equal(connectorSound({source:'axle',targetPart:'gear-20'}),'axle-gear')
 assert.equal(connectorSound({sourcePart:'wheel-road'}),'wheel-hub')
 assert.deepEqual([.01,.15,.4,1.2].map(impactLevel),[null,'impact-soft','impact-medium','impact-hard'])
})
test('optional event observers cannot break editor or physics',()=>{
 const off=observeAudioEvents(()=>{throw Error('audio unavailable')});assert.doesNotThrow(()=>emitAudioEvent('physics-step'));off()
})
test('real Rapier drop: impact detected, resting contact silent, identical trajectory with observer',async()=>{
 await RAPIER.init()
 function run(observe){
  const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/120
  world.createCollider(RAPIER.ColliderDesc.cuboid(1,.05,1).setTranslation(0,-.05,0))
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,.18,0))
  world.createCollider(RAPIER.ColliderDesc.cuboid(.008,.008,.008).setMass(.004).setRestitution(.01),body)
  let now=0;const sounds=[]
  const audio={context:{state:'running'},settings:{mute:false},now:()=>now,stopAll(){},play(name,options){sounds.push({name,step:now});return {}}}
  const observer=new MechanicalAudio(audio),session={world,running:true,components:[{body}]},positions=[]
  for(let i=0;i<360;i++){now=i*1000/120;world.step();if(observe)observer.contactsAfterStep(session,1/120);positions.push(body.translation().y)}
  world.free();return {sounds,positions}
 }
 const baseline=run(false),audible=run(true)
 assert.deepEqual(audible.positions,baseline.positions)
 assert.ok(audible.sounds.length>=1,JSON.stringify(audible.sounds))
 assert.ok(audible.sounds.length<=3,JSON.stringify(audible.sounds))
 assert.ok(audible.sounds.every(s=>s.step<1000),'resting contact never retriggers')
})
test('mechanical mix follows measured RPM/load, pauses and BUILD music; never one loop per part',()=>{
 let now=0;const loops=new Map(),audio={now:()=>now,listener(){},stopAll(){loops.clear()},startLoop(n,p={}){loops.set(n,p)},stopLoop(n){loops.delete(n)},play(){}}
 const mixer=new MechanicalAudio(audio),body={translation:()=>({x:0,y:0,z:0}),angvel:()=>({x:0,y:12,z:0})}
 const session={running:true,motorDrives:[{actualRpm:120,load:.2,bodyB:body}],shaftMonitors:[{body}],wheelMonitors:[]}
 mixer.update(session,'simulate');assert.ok(loops.has('motor'));assert.ok(loops.has('gears'));assert.ok(!loops.has('music'))
 const volume=loops.get('motor').volume;session.motorDrives[0].actualRpm=600;session.motorDrives[0].load=.8;now+=100;mixer.update(session,'simulate')
 assert.ok(loops.get('motor').volume>volume);assert.equal(loops.get('motor').rpm,600)
 session.running=false;now+=100;mixer.update(session,'simulate');assert.equal(loops.size,0)
 now+=100;mixer.update(null,'build');assert.deepEqual([...loops.keys()],['music'])
})
test('settings DOM sliders and mute persist and reload at 0–100%',async()=>{
 const {Window}=await import('happy-dom'),dom=new Window()
 const oldDocument=globalThis.document,oldWindow=globalThis.window
 globalThis.document=dom.document;globalThis.window=dom
 try{
  const {mountAudioSettings}=await import('../audio/settings.js'),storage=store(),audio=new AudioManager({storage})
  const panel=mountAudioSettings(audio),slider=panel.querySelector('[data-volume=master]'),mute=panel.querySelector('[data-mute]')
  slider.value='37';slider.dispatchEvent(new dom.Event('input'));mute.checked=true;mute.dispatchEvent(new dom.Event('change'))
  const restored=new AudioManager({storage});assert.equal(restored.settings.master,.37);assert.equal(restored.settings.mute,true)
  assert.equal(slider.nextElementSibling.value,'37%')
 }finally{globalThis.document=oldDocument;globalThis.window=oldWindow;await dom.happyDOM.close()}
})
