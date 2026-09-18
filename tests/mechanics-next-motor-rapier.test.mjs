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
