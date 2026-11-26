// Reuse the editor's actual connector, gear, belt and kinematics rules.
import {createAssembly,connectPlaced,gearPoses,rotationMotion,rotationPoses} from '../editor/model.js?v=track-builder'
import {portsFor} from '../mechanics/catalog.js?v=volvo-spur-gears'
import {evaluateSpurMesh} from '../mechanics/gears.js'
import {grooveOf,beltLayout,grooveKey} from '../mechanics/belts.js?v=belt-drive'
import {Quaternion} from 'three'
const finite=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite)
const spinRoles=new Set(['axle','axle-pin','friction-axle-pin','duplo-axle','gear','rim-seat','tyre-seat','selector-spline','torque-clutch-inner','torque-clutch-outer','ball','ball-socket'])
const motors=new Set(['u9479c01','10089c01'])
const endpoint=e=>({part:e?.part??null,port:e?.port??e?.groove??null})
export function prepareMechanismInspection(doc){
 const parts=[],seen=new Set(),excluded=[]
 for(const p of doc.parts??[]){
  if(!p||typeof p.id!=='string'||!p.id||seen.has(p.id)||!finite(p.position,3)||!finite(p.rotation,4)||!p.rotation.some(Boolean)){
   excluded.push(p?.id??null);continue
  }
  seen.add(p.id)
  parts.push({...p,design:String(p.design),position:[...p.position],rotation:new Quaternion().fromArray(p.rotation).normalize().toArray()})
 }
 const byId=new Map(parts.map(p=>[p.id,p])),assembly=createAssembly(parts,[],{belts:doc.belts})
 const links=[],accepted=[]
 for(const link of doc.connections??[]){
  const a=byId.get(link?.shaft?.part),b=byId.get(link?.socket?.part)
  let reason
  if(!a||!b||a===b)reason='invalid-endpoint'
  else if(!link.placement)reason='missing-placement'
  else try{const fit=connectPlaced(assembly,a,b,link,true);if(fit.ok)accepted.push(link);else reason=fit.reason??'invalid-connection'}catch{reason='invalid-connection'}
  if(reason)links.push({a:endpoint(link?.shaft),b:endpoint(link?.socket),reason})
 }
 const belts=[],used=new Set(),beltIds=new Set()
 for(const record of doc.belts??[]){
  let reason
  const a=record?.a,b=record?.b
  if(typeof record?.id!=='string'||!record.id.trim()||beltIds.has(record.id)||!a||!b||a.part===b.part||typeof a.groove!=='string'||typeof b.groove!=='string')reason='invalid-belt'
  else if(used.has(grooveKey(a))||used.has(grooveKey(b)))reason='occupied-groove'
  else{const layout=beltLayout(grooveOf(byId.get(a.part),a.groove),grooveOf(byId.get(b.part),b.groove));if(!layout.ok)reason=layout.reason;else{beltIds.add(record.id);used.add(grooveKey(a));used.add(grooveKey(b))}}
  if(reason)belts.push({a:endpoint(a),b:endpoint(b),reason})
 }
 const gears=gearPoses(parts),meshes=[]
 // Do not block the browser on a quadratic full-catalog scan.
 const meshScan=gears.length<=300
 if(meshScan)for(let i=0;i<gears.length;i++)for(let j=i+1;j<gears.length;j++){
  const result=evaluateSpurMesh(gears[i],gears[j])
  if(result.ok)meshes.push({a:gears[i].part,b:gears[j].part,ratio:result.ratio})
 }
 const drivers=parts.filter(p=>motors.has(p.design)||portsFor(p.design).some(port=>spinRoles.has(port.role)||port.rotor))
 return {parts,assembly,excluded,links,belts,accepted:accepted.length,validBelts:assembly.belts.length,gears,meshes,meshScan,drivers,limited:parts.length>5000||gears.length>300}
}
export function inspectDrive(state,driver){
 if(state.limited)return {status:'limit'}
 if(!state.drivers.some(p=>p.id===driver))return {status:'unknown'}
 try{
  const motion=rotationMotion(driver,state.parts,state.assembly)
  if(!motion)return {status:'no-motion'}
  if(!motion.ok)return {status:'blocked',reason:motion.reason??'constraint'}
  const range=Array.isArray(motion.range)?motion.range:[0,360],linear=motion.unit==='linear'
  const lo=Math.max(range[0],linear?-20:-90),hi=Math.min(range[1],linear?20:90)
  const values=lo<=hi?[...new Set([lo,(lo+hi)/2,hi])]:[]
  const affected=new Set(),samples=[]
  for(const value of values){
   const poses=rotationPoses(state.parts,motion,linear?value:value*Math.PI/180)
   const valid=Array.isArray(poses)&&poses.every(p=>finite(p.position,3)&&finite(p.rotation,4))
   if(valid)for(const p of poses)affected.add(p.id)
   samples.push({value,valid})
  }
  const spins=[...(motion.spins??motion.rotation?.spins??new Map())].map(([id,s])=>({id,ratio:Number.isFinite(s.ratio)?s.ratio:null,nonlinear:typeof s.angleAt==='function'}))
  return {status:samples.length&&samples.every(s=>s.valid)?'solved':'partial',kind:motion.kind??'rotation',range,linear,samples,affected:affected.size,spins,meshes:motion.meshes??[],supply:motion.supply??null}
 }catch{return {status:'error'}}
}
