import test from 'node:test'
import assert from 'node:assert/strict'
import {rackPinionEquation,rotationCouplingEquation} from '../mechanics-next/transmission/equations.js'
import {solveRotationalDrag} from '../mechanics-next/interaction/drag-driver.js'

test('native rack travel follows pitch radius and signed pinion rotation',()=>{
  for(const direction of [1,-1]){
    const result=solveRotationalDrag({bodyId:'pinion',angleRad:Math.PI,discovery:{equations:[rackPinionEquation({id:'mesh',gearBody:'pinion',rackBody:'rack',pitchRadius:.5,direction})]}})
    assert.equal(result.status,'solved');assert.ok(Math.abs(result.values['rack::slide']-direction*Math.PI*.5)<1e-9)
  }
})
test('native rack follower propagates through an upstream gear relation',()=>{
  const equations=[rotationCouplingEquation({id:'gears',bodyA:'input',bodyB:'pinion',ratioAB:-2}),rackPinionEquation({id:'rack',gearBody:'pinion',rackBody:'rack',pitchRadius:.5,direction:1})]
  const result=solveRotationalDrag({bodyId:'input',angleRad:Math.PI/2,discovery:{equations}})
  assert.equal(result.status,'solved');assert.ok(Math.abs(result.values['rack::slide']+Math.PI/2)<1e-9)
})
test('native incompatible pinions fail closed instead of applying a rack target',()=>{
  const equations=[rotationCouplingEquation({id:'drive',bodyA:'a',bodyB:'b',ratioAB:1}),rackPinionEquation({id:'one',gearBody:'a',rackBody:'rack',pitchRadius:1,direction:1}),rackPinionEquation({id:'two',gearBody:'b',rackBody:'rack',pitchRadius:1,direction:-1})]
  const result=solveRotationalDrag({bodyId:'a',angleRad:1,discovery:{equations}})
  assert.equal(result.status,'conflict')
})
