import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {screenDragAngle,solveRotationalDrag} from '../mechanics-next/interaction/drag-driver.js'
import {rotationCouplingEquation,differentialEquation} from '../mechanics-next/transmission/equations.js'

test('native mouse direction wraps without jumps around the mechanical pivot',()=>{
  assert.ok(screenDragAngle([10,0],[0,10],[0,0]).angleRad>0)
  assert.ok(screenDragAngle([10,0],[0,10],[0,0],{axisScreenSign:-1}).angleRad<0)
  const nearWrap=screenDragAngle([-10,.1],[-10,-.1],[0,0]).angleRad
  assert.ok(Math.abs(nearWrap)<.03)
})
test('native drag propagates signed gear ratios and rejects contradictory loops',()=>{
  const eq=(a,b,ratio)=>rotationCouplingEquation({id:a+b,bodyA:a,bodyB:b,ratioAB:ratio})
  const discovery={equations:[eq('a','b',-2),eq('b','c',-.5)]}
  const result=solveRotationalDrag({bodyId:'a',angleRad:1,discovery})
  assert.equal(result.status,'solved');assert.equal(result.values['b::theta'],-2);assert.equal(result.values['c::theta'],1)
  const conflict=solveRotationalDrag({bodyId:'a',angleRad:1,discovery:{equations:[eq('a','b',-1),eq('b','c',-1),eq('c','a',-1)]}})
  assert.equal(conflict.status,'conflict')
})
test('native differential side drive stays underdetermined without a closure',()=>{
  const equation=differentialEquation({id:'diff',carrier:'carrier',left:'left',right:'right'})
  const result=solveRotationalDrag({bodyId:'left',angleRad:1,balancedDifferentials:false,discovery:{equations:[equation]}})
  assert.equal(result.status,'underdetermined')
})
test('production activation loads only native Kinematics and fails closed when its gate rejects',async()=>{
  const source=await readFile(new URL('../kinematics/activation-v1.js',import.meta.url),'utf8')
  assert.doesNotMatch(source,/runtime-v1\.js|lifecycle-guard|rack-pinion-runtime|legacy fallback/)
  const start=source.indexOf('async function activate(event)'),end=source.indexOf("button.addEventListener('click', activate)",start)
  const code=source.slice(start,end).replace("import('../mechanics-next/production/kinematics-owner.js')","loadNative()")
  const run=new Function('globalThis','button','loadNative',`let loading=false;const language=()=> 'en',toast=()=>{},localizeButton=()=>{},copy=()=>({loading:'Loading',error:'Blocked'});${code};return activate()`)
  for(const accepted of [false,true]){
    let calls=0,active=false
    const native={enter:async()=>({accepted,gate:{blockers:accepted?[]:['blocked']}}),active:()=>active,exit:()=>{active=false}}
    const globals={BrickLabSubsystems:{editor:{mode:()=> 'build'}}},button={dataset:{}}
    const originalError=console.error;console.error=()=>{}
    try{await run(globals,button,async()=>{calls++;active=accepted;return{default:native}})}finally{console.error=originalError}
    assert.equal(calls,1);assert.equal(button.dataset.kinematicsState,accepted?'active':'error')
    assert.equal(globals.BrickLabKinematics,accepted?native:undefined)
    assert.equal(button.disabled,false)
  }
})
