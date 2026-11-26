import {portsFor} from '../mechanics/catalog.js?v=volvo-spur-gears'
import {connectionMode} from '../mechanics/axial.js?v=torque-clutch'
import {candidateOffsets,joinedPose} from './placement.js?v=torque-clutch'
import {createAssembly,connectPlaced} from './model.js?v=volvo-spur-gears'
// Only move a loose part. Never silently sever an existing joint or belt.
export function smartConnections(moving,fixed,parts,links,belts=[]){
 if(!moving||!fixed||moving.id===fixed.id||links.some(l=>l.shaft.part===moving.id||l.socket.part===moving.id)||belts.some(l=>l.a.part===moving.id||l.b.part===moving.id))return []
 const assembly=createAssembly(parts,links,{belts}),results=[],seen=new Set()
 let work=0
 for(const own of portsFor(moving.design))for(const target of portsFor(fixed.design)){
  if(own.legacy||target.legacy||own.role==='gear'||target.role==='gear'||own.gender===target.gender)continue
  const ownMale=own.gender==='M',male=ownMale?own:target,female=ownMale?target:own
  const mode=connectionMode(male,female);if(!mode)continue
  const shaft={part:ownMale?moving.id:fixed.id,port:male.id},socket={part:ownMale?fixed.id:moving.id,port:female.id}
  for(const direction of [1,-1])for(const side of female.openings??['start'])for(const offset of candidateOffsets(male,female,direction,side,0)){
   if(++work>5000)return results.sort((a,b)=>a.distance-b.distance).slice(0,12)
   const fit=assembly.previewInsertion(shaft,socket,{offset,direction,side});if(!fit.ok)continue
   const pose={...moving,...joinedPose(moving,own,fixed,target,fit.placement)},key=JSON.stringify([shaft,socket,pose.position.map(x=>Math.round(x*100)),pose.rotation.map(x=>Math.round(x*1000))]);if(seen.has(key))continue;seen.add(key)
   const placed=parts.map(p=>p.id===moving.id?pose:p),checked=createAssembly(placed,links,{belts})
   if(checked.connections.length!==links.length||checked.belts.length!==belts.length)continue
   const a=placed.find(p=>p.id===shaft.part),b=placed.find(p=>p.id===socket.part),actual=connectPlaced(checked,a,b,{shaft,socket,placement:fit.placement})
   if(!actual.ok)continue
   results.push({pose,link:{shaft,socket,placement:actual.placement},label:own.id+' ↔ '+target.id,distance:Math.hypot(...pose.position.map((v,i)=>v-moving.position[i]))})
   if(results.length>=48)return results.sort((a,b)=>a.distance-b.distance).slice(0,12)
  }
 }
 return results.sort((a,b)=>a.distance-b.distance).slice(0,12)
}
