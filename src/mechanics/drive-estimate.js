// Steady-state estimate for one motor or manual rotary source, using solver ratios.
// Assumed efficiency is a user-specified end-to-end value, not measured friction.
export function driveOutputs(motion){
 if(!motion?.ok||motion.unit==='linear'||motion.solve)return []
 return [...(motion.spins??[])].flatMap(([id,s])=>!s.angleAt&&Number.isFinite(s.ratio)&&Math.abs(s.ratio)>1e-8?[{id,ratio:s.ratio}]:[])
}
export function estimateDrive({source,outputs,loads=[],efficiency=.85}){
 const rpm=Number(source?.rpm),stall=Number(source?.stallTorque)
 if(!Number.isFinite(rpm)||!Number.isFinite(stall)||stall<0||!Number.isFinite(efficiency)||efficiency<=0||efficiency>1)throw Error('invalid_input')
 const available=new Map(outputs.map(o=>[o.id,o.ratio]))
 let reflected=0
 const seen=new Set(),rows=[]
 for(const l of loads){
  if(seen.has(l.id)||!available.has(l.id)||!Number.isFinite(l.torque)||l.torque<0)throw Error('invalid_load')
  seen.add(l.id)
  const ratio=available.get(l.id),input=l.torque*Math.abs(ratio)/efficiency
  reflected+=input
  rows.push({id:l.id,ratio,loadTorque:l.torque,reflectedTorque:input})
 }
 const utilization=stall>0?reflected/stall:null
 const loadedRpm=stall>0?rpm*Math.max(0,1-utilization):0
 const result={noLoadRpm:rpm,stallTorque:stall,efficiency,reflectedTorque:reflected,utilization,loadedRpm,stalled:stall<=0||reflected>=stall,sourceAvailable:stall>0&&rpm!==0,
  outputs:outputs.map(o=>({id:o.id,ratio:o.ratio,noLoadRpm:rpm*o.ratio,loadedRpm:loadedRpm*o.ratio,
   singleOutputStallTorque:stall*efficiency/Math.abs(o.ratio)})),loads:rows}
 return result
}
export function sourceFromMotion(motion){
 const s=motion?.supply
 if(!s)return null
 // At zero speed, the existing approximate DC curve gives torque * power/100.
 return {rpm:s.powered?s.speed*30/Math.PI:0,stallTorque:s.powered?Math.abs(s.power/100)*s.torque:0,reason:s.reason??'',kind:'motor'}
}
