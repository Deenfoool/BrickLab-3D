import { Vector3 } from 'three'
import { linearActuators, actuatorTravel, isRodPort } from '../mechanics/actuators.js'
import { portsFor } from '../mechanics/catalog.js?v=linear-actuator-1'
import { worldPort } from './placement.js?v=linear-actuator-1'
import { planarActuatorLinkage } from './actuator-linkage.js'
import { movePose } from '../mechanics/linkage.js'

const v=a=>new Vector3(...a)
// A rod branch can translate only if it is not also connected to the housing
// side. Never tear a closed mechanism apart to fake a successful animation.
export function actuatorBranch(actuator,parts,joints){
 const rod=new Set(),base=new Set(),neighbors=new Map(parts.map(p=>[p.id,[]]))
 for(const j of joints){
  if(j.a===actuator.id||j.b===actuator.id){
   const female=j.b===actuator.id,portId=female?j.socketPort:j.shaftPort
   const port=portsFor(actuator.design).find(p=>p.id===portId)
   ;(isRodPort(actuator.design,port)?rod:base).add(female?j.a:j.b)
  }else if(neighbors.has(j.a)&&neighbors.has(j.b)){neighbors.get(j.a).push(j.b);neighbors.get(j.b).push(j.a)}
 }
 const pending=[...rod]
 for(const id of pending)for(const next of neighbors.get(id)??[])if(!rod.has(next)){rod.add(next);pending.push(next)}
 return [...rod].some(id=>base.has(id))?null:rod
}
export function linearActuatorMotion(selected,parts,joints,rotation){
 const targets=[]
 const direct=parts.find(p=>p.id===selected&&linearActuators[p.design])
 for(const part of direct?[direct]:parts.filter(p=>linearActuators[p.design])){
  const spec=linearActuators[part.design],line=worldPort(part,{start:[0,0,0],axis:spec.axis})
  let inputSpin
  if(!direct){
   const input=joints.find(j=>j.b===part.id&&j.socketPort===spec.inputPort)
   const spin=input&&rotation?.ok&&rotation.spins.get(input.a)
   if(!spin)continue
   const alignment=v(spin.axis).dot(line.axis)
   if(Math.abs(alignment)<.99999)return {ok:false,reason:'actuator-input-axis'}
   inputSpin={...spin,alignment}
  }
  const branch=actuatorBranch(part,parts,joints)
  const planar=branch===null?planarActuatorLinkage(part,parts,joints,line):null
  if(branch===null&&!planar||rotation?.spins?.has(part.id)&&!direct||branch&&[...branch].some(id=>rotation?.spins?.has(id)))return {ok:false,reason:'actuator-closed-or-driven-branch'}
  const moving=branch??planar.affected,range=planar?.range??[-spec.initial,spec.stroke-spec.initial]
  if(targets.some(t=>t.part.id===part.id||t.moving.has(part.id)||moving.has(t.part.id)||[...moving].some(id=>t.moving.has(id))))return {ok:false,reason:'actuator-shared-output'}
  targets.push({part,spec,line,moving,inputSpin,planar,range})
 }
 if(!targets.length)return null
 if(direct)return {ok:true,kind:'actuator',unit:'linear',actuators:targets,range:targets[0].range,spins:new Map(),meshes:[],periodic:false}
 const limits=targets.flatMap(({spec,range,inputSpin:s})=>{
  const ratio=s.ratio*s.alignment
  if(s.angleAt||!Number.isFinite(ratio)||!ratio)return [-spec.turns*360,spec.turns*360]
  return range.map(d=>d*spec.turns*360/(spec.stroke*ratio))
 })
 return {...rotation,kind:'actuator',actuators:targets,periodic:false,range:[Math.min(0,...limits),Math.max(0,...limits)]}
}
export function actuatorPreview(parts,motion,poses,angle){
 const result=new Map(poses.map(p=>[p.id,p])),byId=new Map(parts.map(p=>[p.id,p]))
 for(const {part,spec,line,moving,inputSpin,planar,range} of motion.actuators){
  const inputAngle=motion.unit==='linear'?angle*spec.turns*2*Math.PI/spec.stroke:
   inputSpin.alignment*(inputSpin.angleAt?inputSpin.angleAt(angle):angle*inputSpin.ratio)
  const travel=actuatorTravel(part.design,inputAngle)
  if(!travel)return null
  const delta=Math.max(range[0],Math.min(range[1],travel.displacement))
  if(planar){
   const transforms=planar.solve(delta)
   if(!transforms)return null
   for(const [id,transform] of transforms){const original=result.get(id)??byId.get(id);if(original)result.set(id,movePose(original,transform))}
  }else for(const id of moving){const original=byId.get(id);if(original)result.set(id,{...original,position:v(original.position).addScaledVector(line.axis,delta).toArray()})}
  result.set(part.id,{...(result.get(part.id)??part),previewActuatorRod:delta,previewActuatorInput:travel.inputAngle})
 }
 return [...result.values()]
}
