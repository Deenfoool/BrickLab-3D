// Export a reproducible, local-only engineering snapshot. No project geometry or account data.
export function engineeringReport({name,driver,parts,connections,belts,hidden,importIssues,motion,drive,collisions,motorBench}){
 const spins=[...(motion?.spins??motion?.rotation?.spins??[])].map(([id,s])=>({id,ratio:Number.isFinite(s.ratio)?s.ratio:null,nonlinear:typeof s.angleAt==='function'}))
 const recommendations=[]
 if(importIssues.length)recommendations.push('Review rejected import records; they describe the original load, not the current model.')
 if(motion&&!motion.ok)recommendations.push('Review the solver constraint and connector alignment before applying power.')
 if(drive?.stalled)recommendations.push('Reduce assumed resistance or select a lower output speed ratio. Check motor power and efficiency.')
 if(drive&&!drive.sourceAvailable)recommendations.push('Check the selected motor supply and power, or manual source assumptions.')
 if(collisions?.samples.some(s=>s.pairs.length))recommendations.push('Locate suspect crossings and inspect clearances at those sampled positions.')
 if(!collisions||collisions.truncated||collisions.samples.some(s=>s.limited||s.unavailable||s.unsolved))recommendations.push('Collision coverage is incomplete; inspect additional poses and excluded mating pairs manually.')
 return {format:'bricklab-engineering-report',version:1,createdAt:new Date().toISOString(),name,driver:driver??null,scope:{parts,connections,belts,hidden},importIssues,
  kinematics:motion?{ok:motion.ok===true,kind:motion.kind??'rotation',reason:motion.reason??null,range:motion.range??null,unit:motion.unit??'degree',spins}:null,
  driveEstimate:drive??null,motorBench:motorBench??null,collisionInspection:collisions??null,recommendations,
  limitations:['Approximate single-source steady-state model, with user-assumed loads and efficiency.','Collision checks are discrete surface-crossing samples, excluding accepted mating pairs; not a continuous or solid containment check.','Motor bench uses approximate native joints, cuboid colliders and conditional contact filtering; gears/belts are not dynamically driven.','No physical strength, safety, fatigue, or load certification.']}
}
export function downloadEngineeringReport(report){
 const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a')
 a.href=url;a.download='bricklab-engineering-report.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
