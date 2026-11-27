// Server-only verification. Samples kinematics, not real-world strength, load or collision certification.
import {createAssembly,rotationMotion,rotationPoses,shiftSelector,connectPlaced,connectAligned} from '../src/editor/model.js'
import {portsFor} from '../src/mechanics/catalog.js'
import {parts as catalog} from '../src/editor/parts-data.js'
import {prepareTestDrive,newDriveState,stepTestDrive} from '../src/editor/vehicle-drive.js'
import {trackDrives,isTread,sprockets} from '../src/mechanics/treads.js'
const finite=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<1e7)
const validPart=p=>p&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=128&&typeof p.design==='string'&&Object.hasOwn(catalog,p.design)&&finite(p.position,3)&&finite(p.rotation,4)&&Math.abs(Math.hypot(...p.rotation)-1)<.001
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]))
const moved=(a,b)=>dist(a.position,b.position)>.01||1-Math.abs(a.rotation.reduce((s,v,i)=>s+v*b.rotation[i],0))>1e-6
const validPose=p=>finite(p?.position,3)&&finite(p?.rotation,4)&&Math.abs(Math.hypot(...p.rotation)-1)<.01
export function prepareVerification(doc){
 if(!Array.isArray(doc?.parts)||!Array.isArray(doc?.connections)||doc.parts.length===0||doc.parts.length>600||doc.connections.length>1800||!doc.parts.every(validPart)||new Set(doc.parts.map(p=>p.id)).size!==doc.parts.length)return null
 if(doc.belts!==undefined&&(!Array.isArray(doc.belts)||doc.belts.length>100))return null
 const parts=doc.parts,byId=new Map(parts.map(p=>[p.id,p]))
 if(doc.connections.some(c=>!c||!byId.has(c.shaft?.part)||!byId.has(c.socket?.part)||typeof c.shaft.port!=='string'||typeof c.socket.port!=='string'||!c.placement||!Number.isFinite(c.placement.offset)))return null
 const assembly=createAssembly(parts,doc.connections,{belts:doc.belts})
 if(assembly.connections.length!==doc.connections.length||assembly.belts.length!==(doc.belts?.length??0))return null
 return {parts,byId,assembly}
}
function samples(parts,byId,plan){
 if(!plan?.ok)return null
 const [lo,hi]=plan.range??[-360,360],angle=plan.unit==='linear'?1:Math.PI/180
 const limits=[lo,hi].filter(x=>Number.isFinite(x)&&Math.abs(x)>.01)
 for(const limit of limits){
  const values=[.2,.4,.6,.8].map(x=>limit*x*angle)
  const poses=values.map(v=>rotationPoses(parts,plan,v))
  if(poses.some(p=>!Array.isArray(p)||p.some(x=>!validPose(x)||!byId.has(x.id))))continue
  const changed=new Set(poses.flat().filter(p=>moved(byId.get(p.id),p)).map(p=>p.id))
  if(changed.size)return {poses,changed}
 }
 return null
}
function gearTransmission(plan,changed){
 const spins=plan.spins??plan.rotation?.spins
 return (plan.meshes??[]).some(m=>changed.has(m.a)&&changed.has(m.b)&&spins?.has(m.a)&&spins?.has(m.b)&&spins.get(m.a)!==spins.get(m.b))
}
function shiftedAssembly(parts,assembly,edits){
 if(!edits?.size||edits.size>30)return null
 const placed=parts.map(p=>edits.get(p.id)??p),byId=new Map(placed.map(p=>[p.id,p]))
 const checked=createAssembly(placed,[],{belts:assembly.belts.map(b=>b.record)})
 const changed=placed.filter(p=>edits.has(p.id)),fixed=placed.filter(p=>!edits.has(p.id))
 // Same retained-connection and inferred-snap logic as the editor.
 for(const l of assembly.connections)connectPlaced(checked,byId.get(l.shaft.part),byId.get(l.socket.part),{shaft:l.shaft,socket:l.socket,placement:l.fit.placement})
 connectAligned(checked,changed,fixed)
 const ring=changed.find(p=>portsFor(p.design).some(port=>port.role==='selector-guide'))
 if(ring)connectAligned(checked,[ring],changed.filter(p=>p.id!==ring.id))
 const kept=old=>checked.connections.some(l=>l.shaft.part===old.shaft.part&&l.socket.part===old.socket.part&&l.socket.port===old.socket.port&&(l.shaft.port===old.shaft.port||old.socket.port==='shift-groove'))
 if(assembly.connections.some(l=>!kept(l)&&assembly.port(l.shaft.part,l.shaft.port).role!=='clutch-driver'))return null
 return {parts:placed,assembly:checked,byId}
}
function gearbox(parts,assembly,drivers){
 // Explicit two-shift comparison: same input/output, different finite gear ratios.
 const selectors=parts.filter(p=>p.design==='18947'||p.design==='6641').slice(0,3)
 for(const selector of selectors){
  const states=[-1,1].map(d=>shiftedAssembly(parts,assembly,shiftSelector(selector.id,d,parts,assembly))).filter(Boolean)
  if(states.length!==2)continue
  for(const driver of drivers.slice(0,6)){
   const motions=states.map(s=>rotationMotion(driver.id,s.parts,s.assembly))
   if(motions.some(p=>!p?.ok||!p.spins||!p.meshes?.length))continue
   const [a,b]=motions
   for(const [id,spin] of a.spins){
    const other=b.spins.get(id)
    if(id===driver.id||!Number.isFinite(spin.ratio)||!Number.isFinite(other?.ratio)||Math.abs(spin.ratio-other.ratio)<.001)continue
    if(samples(states[0].parts,states[0].byId,a)?.changed.has(id)&&samples(states[1].parts,states[1].byId,b)?.changed.has(id))return true
   }
  }
 }
 return false
}
export function verifyMechanics(prepared,driver){
 const {parts,byId,assembly}=prepared,metrics=new Set()
 const candidates=parts.filter(p=>sprockets[p.design]||portsFor(p.design).some(q=>['gear','axle','key','piston','damper-cylinder','selector-guide','rim-seat'].includes(q.role)))
 const ordered=[...candidates.filter(p=>p.id===driver),...candidates.filter(p=>p.id!==driver)].slice(0,24)
 const tracks=trackDrives(parts,assembly.connections).filter(t=>t.closed&&t.drives.length>=2&&t.links.length>=6)
 for(const p of ordered){
  let plan,sample
  try{plan=rotationMotion(p.id,parts,assembly);sample=samples(parts,byId,plan)}catch{continue}
  if(!sample)continue
  const {changed,poses}=sample
  if(gearTransmission(plan,changed))metrics.add('gears')
  if((plan.belts??plan.rotation?.belts??[]).some(b=>b.record&&changed.has(b.a)&&changed.has(b.b)))metrics.add('belts')
  if(plan.kind==='engine'&&parts.some(p=>p.design==='3652'&&poses.flat().some(q=>q.id===p.id&&dist(p.position,q.position)>.1)))metrics.add('engine')
  if(plan.kind==='suspension'&&assembly.connections.some(l=>l.fit.motion.rotation==='spring')&&assembly.connections.some(l=>l.fit.motion.rotation==='slider'&&changed.has(l.shaft.part)))metrics.add('suspension')
  if(tracks.some(t=>t.links.filter(l=>changed.has(l.id)).length>=2&&t.drives.every(d=>changed.has(d.wheel.id))))metrics.add('tracks')
 }
 if(metrics.has('gears')&&parts.length<=250){try{if(gearbox(parts,assembly,ordered))metrics.add('gearbox')}catch{}}
 return [...metrics]
}
async function verifyDrive(prepared,settings){
 if(!settings||typeof settings!=='object')return false
 const {parts,assembly}=prepared,models=new Map()
 const designs=[...new Set(parts.filter(p=>portsFor(p.design).some(q=>['rim-seat','tyre-seat'].includes(q.role))||/^Wheel\s+\d/i.test(catalog[p.design]?.en??'')).map(p=>p.design))]
 if(designs.length<1||designs.length>16)return false
 const {loadPartModel}=await import('../src/editor/parts.js')
 for(const d of designs){const model=await loadPartModel(catalog[d],{smoothNormals:false});if(model)models.set(d,model)}
 const vehicle=prepareTestDrive(parts,assembly,models,{...settings,simulation:'kinematic',venue:'flat'},catalog)
 if(!vehicle.ready||vehicle.initial.length<3||!vehicle.groups.length)return false
 const state=newDriveState(vehicle),start=state.position.clone()
 let wheelMoved=false
 for(let i=0;i<90;i++){
  const result=stepTestDrive(vehicle,state,{throttle:1,steer:0,brake:false},1/60)
  if(!Number.isFinite(state.speed)||!state.position.toArray().every(Number.isFinite)||result.poses.some(p=>!validPose(p)))return false
  if(result.poses.some(p=>vehicle.initial.some(c=>c.wheel.id===p.id)&&moved(prepared.byId.get(p.id),p)))wheelMoved=true
 }
 if(!wheelMoved||state.position.distanceTo(start)<100)return false
 for(let i=0;i<60;i++)stepTestDrive(vehicle,state,{throttle:0,steer:0,brake:true},1/60)
 return Math.abs(state.speed)<.001
}
export async function verifyDocument(doc,request){
 const prepared=prepareVerification(doc)
 if(!prepared)return {metrics:[],reason:'invalid_geometry'}
 if(request.kind==='lesson'){
  const answers={basic:'b',mechanics:'c',drive:'a'}
  if(answers[request.lesson]!==request.answer)return {metrics:[],reason:'wrong_answer'}
  if(request.lesson==='basic')return prepared.assembly.connections.length>=1&&prepared.parts.length>=2?{metrics:['lesson'],reason:'passed'}:{metrics:[],reason:'needs_connection'}
  if(request.lesson==='mechanics'){const metrics=verifyMechanics(prepared,request.driver);return metrics.includes('gears')?{metrics:[...metrics,'lesson'],reason:'passed'}:{metrics,reason:'needs_gears'}}
  const ok=await verifyDrive(prepared,doc.testDrive);return ok?{metrics:['drive','lesson'],reason:'passed'}:{metrics:[],reason:'drive_failed'}
 }
 const metrics=request.kind==='drive'?(await verifyDrive(prepared,doc.testDrive)?['drive']:[]):verifyMechanics(prepared,request.driver)
 return {metrics,reason:metrics.length?'passed':request.kind==='drive'?'drive_failed':'no_verified_mechanism'}
}
