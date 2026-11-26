// Run a detached, bounded experiment using the editor's existing Rapier world.
// This is NOT a dynamic gear/belt solver: native joints and clutches only.
import {assemblyJoints,createAssembly} from './model.js?v=volvo-spur-gears'
import {controlPlusBodies} from '../mechanics/motors.js'
import {createPhysicalAssembly} from '../mechanics/physical-assembly.js?v=engineering-bench-1'
import {loadRapier} from '../mechanics/physics-world.js'
export async function runMotorBench({parts,links,models,motorId,seconds=3,signal,onProgress}){
 if(parts.length>400||!parts.some(p=>p.id===motorId&&controlPlusBodies.has(p.design)))throw Error('bench_limit_or_motor')
 const motor=parts.find(p=>p.id===motorId)
 const assembly=createAssembly(parts,links,{belts:[]}),joints=assemblyJoints(parts,assembly)
 const rapier=await loadRapier();signal.throwIfAborted()
 const simulation=createPhysicalAssembly(rapier,parts,joints,models,{pinned:[motorId],gravityEnabled:false})
 const samples=[],duration=Math.max(1,Math.min(5,Number(seconds)||3)),steps=Math.round(duration*20),start=performance.now()
 try{
  if(!simulation.motors.some(m=>m.part===motor.id))throw Error('bench_no_output')
  for(let i=0;i<=steps;i++){
   signal.throwIfAborted()
   if(performance.now()-start>12000)return {samples,diagnostics:simulation.diagnostics,complete:false,seconds:duration}
   if(i)simulation.advance(.05)
   const data=simulation.motors.find(m=>m.part===motorId)
   if(i%4===0||i===steps)samples.push({time:i/20,rpm:data.rpm,torque:data.appliedTorque,angleRadians:data.angleRadians,powered:data.powered,stalled:data.stalled})
   onProgress?.(i,steps)
   if(i%2===0)await new Promise(r=>setTimeout(r,0))
  }
  return {samples,diagnostics:simulation.diagnostics,complete:true,seconds:duration}
 }finally{simulation.dispose()}
}
