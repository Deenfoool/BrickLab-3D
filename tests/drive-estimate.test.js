import test from 'node:test'
import assert from 'node:assert/strict'
import {estimateDrive,driveOutputs,sourceFromMotion} from '../src/mechanics/drive-estimate.js'
import {engineeringReport} from '../src/editor/engineering-report.js'
const source={rpm:300,stallTorque:.2}
const outputs=[{id:'slow',ratio:-.5},{id:'fast',ratio:2}]
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9)
test('speed, direction and stall torque reflect actual ratios',()=>{
 const r=estimateDrive({source,outputs,efficiency:.8})
 close(r.outputs[0].noLoadRpm,-150)
 close(r.outputs[0].singleOutputStallTorque,.32)
 close(r.outputs[1].singleOutputStallTorque,.08)
 assert.equal(r.stalled,false)
})
test('multiple resisting loads reflect to one input and can stall',()=>{
 const r=estimateDrive({source,outputs,efficiency:1,loads:[{id:'slow',torque:.1},{id:'fast',torque:.025}]})
 close(r.reflectedTorque,.1);close(r.loadedRpm,150)
 assert.equal(estimateDrive({source,outputs,efficiency:1,loads:[{id:'fast',torque:.11}]}).stalled,true)
 assert.throws(()=>estimateDrive({source,outputs,loads:[{id:'slow',torque:1},{id:'slow',torque:1}]}))
})
test('nonlinear and linear drives are not treated as constant ratios',()=>{
 const spins=new Map([['a',{ratio:1}],['b',{angleAt:x=>x*x}],['c',{ratio:0}]])
 assert.deepEqual(driveOutputs({ok:true,spins}),[{id:'a',ratio:1}])
 assert.deepEqual(driveOutputs({ok:true,spins,unit:'linear'}),[])
 assert.deepEqual(driveOutputs({ok:true,spins,solve:()=>[]}),[])
 assert.equal(sourceFromMotion({supply:{powered:false,speed:100,torque:.18,power:100}}).stallTorque,0)
})
test('engineering export omits removed collision diagnostics and geometry',()=>{
 const report=engineeringReport({name:'fixture',driver:'a',parts:2,connections:1,belts:0,hidden:0,importIssues:[],motion:{ok:true,spins:new Map([['a',{ratio:1}]])},drive:null,collisions:{truncated:true,samples:[]}})
 assert.equal(report.format,'bricklab-engineering-report')
 assert.equal(Object.hasOwn(report,'collisionInspection'),false)
 assert.equal(report.scope.parts,2)
 assert.equal(report.kinematics.spins[0].ratio,1)
})
