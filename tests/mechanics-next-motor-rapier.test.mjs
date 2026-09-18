import test from 'node:test'
import assert from 'node:assert/strict'
import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import {createMechanicsMotorRuntime} from '../mechanics-next/physics/motor-runtime.js'
await RAPIER.init()

test('native motor stays at live RPM on lightweight real Rapier rotors without restarting the world',()=>{
  const world=new RAPIER.World({x:0,y:0,z:0});world.timestep=1/120
  const rotor=(mass,x,size)=>{
    const body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,0,0).setCanSleep(false))
    world.createCollider(RAPIER.ColliderDesc.cuboid(size,size,size).setMass(mass),body)
    return body
  }
  const motor=rotor(.045,-.1,.01),driven=rotor(.0005,.1,.0015)
  const member=body=>({body,component:{bodyWorldRotation:new THREE.Quaternion()}})
  const state={type:'motor',rpm:120,direction:1,running:true}
  const runtime=createMechanicsMotorRuntime({pass:true,drives:[{id:'native-live',controlId:'motor',axisWorld:[1,0,0],motorBodyId:'motor',drivenBodyId:'shaft',defaultRpm:120,defaultDirection:1,stallTorque:.045,damping:1}]},{resolveMember:id=>member(id==='motor'?motor:driven),controlState:()=>state})
  const handles=[motor.handle,driven.handle]
  try{
    for(const [rpm,direction]of [[120,1],[30,1],[30,-1],[30,0],[120,-1]]){
      Object.assign(state,{rpm,direction})
      for(let step=0;step<12;step++){
        motor.resetTorques(true);driven.resetTorques(true)
        runtime.step(1/120);world.step()
        const actual=(driven.angvel().x-motor.angvel().x)*60/(Math.PI*2)
        assert.ok(Math.abs(actual-rpm*direction)<.05,`target ${rpm*direction}, actual ${actual}`)
      }
      assert.equal(runtime.snapshot()[0].targetRpm,rpm*direction)
      assert.deepEqual([motor.handle,driven.handle],handles)
    }
  }finally{world.free()}
})
import {createMechanicsCouplingRuntime} from '../mechanics-next/physics/coupling-runtime.js'

test('lightweight real Rapier shafts receive F/N/R coupling impulses in the same world',()=>{
  const world=new RAPIER.World({x:0,y:0,z:0});world.timestep=1/120
  const make=(x)=>{const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,0,0).setCanSleep(false));world.createCollider(RAPIER.ColliderDesc.cuboid(.0015,.0015,.012).setMass(.0005),b);return b}
  const a=make(-.1),b=make(.1),members=new Map([['a',a],['b',b]])
  const mode={value:'forward'}
  const runtime=createMechanicsCouplingRuntime({pass:true,couplers:[{id:'fnr',kind:'angular',terms:[{coordinate:'angular',bodyId:'a',coefficient:-1,axisWorld:[0,0,1]},{coordinate:'angular',bodyId:'b',coefficient:1,axisWorld:[0,0,1]}],controlledTransmission:{controlId:'box',modeRatios:{forward:1,neutral:0,reverse:-1},defaultMode:'forward',bodyA:'a',bodyB:'b'}}]},{resolveMember:id=>({body:members.get(id),component:{bodyWorldRotation:new THREE.Quaternion()}}),controlState:()=>({mode:mode.value})})
  try{
    for(const value of ['forward','neutral','reverse']){
      mode.value=value;a.setAngvel({x:0,y:0,z:4},true);b.setAngvel({x:0,y:0,z:0},true)
      runtime.step(1/120);world.step()
      const av=a.angvel().z,bv=b.angvel().z
      if(value==='neutral'){assert.equal(bv,0);assert.ok(Math.abs(av-4)<1e-5)}
      else{assert.ok(Math.abs(bv-(value==='forward'?av:-av))<1e-5);assert.ok(Math.abs(bv)>1)}
    }
  }finally{world.free()}
})

import {runPhysicsMicrostep} from '../physics-pipeline-v1.js'

test('native fixed-step projection preserves the transmission after Rapier integrates external torque',()=>{
  const world=new RAPIER.World({x:0,y:0,z:0});world.timestep=1/120
  const make=x=>{const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x,0,0).setCanSleep(false));world.createCollider(RAPIER.ColliderDesc.cuboid(.0015,.0015,.012).setMass(.0005),b);return b}
  const a=make(-.1),b=make(.1)
  const coupling=createMechanicsCouplingRuntime({pass:true,couplers:[{id:'drive',kind:'angular',terms:[{coordinate:'angular',bodyId:'a',coefficient:-1,axisWorld:[0,0,1]},{coordinate:'angular',bodyId:'b',coefficient:1,axisWorld:[0,0,1]}]}]},{resolveMember:id=>({body:id==='a'?a:b,component:{bodyWorldRotation:new THREE.Quaternion()}})})
  const session={world,components:[],resetCustomTorques(){a.resetTorques(true);b.resetTorques(true)},mechanicsNextPhysics:{beforeStep(dt){coupling.step(dt)},afterStep(dt){coupling.step(dt,{advancePhase:false})}},applyScenarioForcesV2(){a.addTorque({x:0,y:0,z:1e-7},true)}}
  try{for(let step=0;step<12;step++){runPhysicsMicrostep(session,1/120);assert.ok(Math.abs(a.angvel().z-b.angvel().z)<1e-4)}assert.ok(b.angvel().z>1)}finally{world.free()}
})
