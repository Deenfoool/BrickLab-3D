// Installation suggestions are derived from final poses and existing connectors.
// Swept AABB rejects non-mating obstacles conservatively. It is not a mesh-level
// collision solver; mating bodies are exempt only for compatible axial directions.
import {Box3,Matrix4,Quaternion,Vector3} from 'three'
import {portsFor} from '../mechanics/catalog.js?v=volvo-spur-gears'
import {connectionMode,evaluateInsertion} from '../mechanics/axial.js?v=torque-clutch'
import {retainedPlacement,worldPort} from './placement.js?v=torque-clutch'
const V=a=>new Vector3(...a),EPS=.15
const axes=[[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0]]
const valid=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite)
export function installationBounds(part,model){
 if(!model?.bounds||!valid(part.position,3)||!valid(part.rotation,4)||!part.rotation.some(Boolean))return null
 const b=new Box3().copy(model.bounds).applyMatrix4(new Matrix4().compose(V(part.position),new Quaternion(...part.rotation).normalize(),new Vector3(part.mirrored?-1:1,1,1)))
 return !b.isEmpty()&&[...b.min.toArray(),...b.max.toArray()].every(Number.isFinite)?b:null
}
// Exact time interval of overlap for translated world AABBs (fixed orientation).
// Ignore contacts of <= EPS LDU; intentional near-touching surfaces are normal.
export function sweptOverlap(moving,fixed,direction,distance){
 let lo=0,hi=distance
 for(const k of ['x','y','z']){
  const a=fixed.min[k]-moving.max[k]+EPS,b=fixed.max[k]-moving.min[k]-EPS,v=direction[k]
  if(a>=b)return false
  if(Math.abs(v)<1e-10){if(a>=0||b<=0)return false;continue}
  lo=Math.max(lo,Math.min(a/v,b/v));hi=Math.min(hi,Math.max(a/v,b/v))
  if(hi-lo<=1e-7)return false
 }
 return hi-lo>1e-7
}
function axialDirections(link,moving,byId){
 const a=byId.get(link.shaft?.part),b=byId.get(link.socket?.part)
 if(!a||!b)return []
 const male=portsFor(a.design).find(p=>p.id===link.shaft.port),female=portsFor(b.design).find(p=>p.id===link.socket.port)
 const mode=connectionMode(male,female)
 // Sphere, pivot, elastomer and special anchors need a separate motion model.
 if(!mode||mode.anchor||mode.rimSeat||mode.tube||mode.clutch||mode.rotation==='detented')return []
 const actual=retainedPlacement(a,male,b,female,link.placement)
 if(!actual||!link.placement||Math.abs(actual.placement.offset-link.placement.offset)>.02)return []
 const directions=[]
 for(const side of female.openings??[]){
  const fit=evaluateInsertion(male,female,{...actual.placement,side})
  if(!fit.ok)continue
  if(fit.placement.keyStep&&Math.abs(Math.sin((fit.placement.roll-actual.placement.roll)/2))>.001)continue
  const sign=(side==='start'?-1:1)*(moving.id===a.id?1:-1)
  const dir=worldPort(b,female).axis.multiplyScalar(sign)
  if(dir.lengthSq()>.99)directions.push(dir)
 }
 return directions
}
function projection(box,dir){
 let min=0,max=0
 for(const k of ['x','y','z']){const a=box.min[k]*dir[k],b=box.max[k]*dir[k];min+=Math.min(a,b);max+=Math.max(a,b)}
 return [min,max]
}
function fallback(part,reason){return {id:part.id,kind:'manual',reason,from:[...part.position],to:[...part.position]}}
export function planInstallation(build,steps,models,{maxChecks=2500000}={}){
 const byId=new Map(build.parts.map(p=>[p.id,p])),boxes=new Map(),edges=new Map(),installed=new Set(),results=[]
 for(const p of build.parts){boxes.set(p.id,installationBounds(p,models.get(p.design)));edges.set(p.id,[])}
 for(const l of build.connections??[]){const a=l.shaft?.part,b=l.socket?.part;if(a!==b&&edges.has(a)&&edges.has(b)){edges.get(a).push({other:b,link:l});edges.get(b).push({other:a,link:l})}}
 let checks=0,exhausted=false,unknownInstalled=false
 function planPart(p){
  const box=boxes.get(p.id)
  if(!box||unknownInstalled)return fallback(p,'missing_geometry')
  if(exhausted)return fallback(p,'budget')
  const mates=edges.get(p.id).filter(e=>installed.has(e.other)),mateIds=new Set(mates.map(e=>e.other))
  const options=mates.map(e=>axialDirections(e.link,p,byId))
  if(options.some(a=>!a.length))return fallback(p,'unsupported_joint')
  let dirs=options.length?options[0].filter(d=>options.every(choices=>choices.some(q=>d.dot(q)>.9999))):axes.map(V)
  dirs=dirs.filter((d,i)=>!dirs.slice(0,i).some(q=>q.dot(d)>.9999))
  if(!dirs.length)return fallback(p,'conflicting_axes')
  let best=null
  for(const dir of dirs){
   const [low,high]=projection(box,dir)
   let distance=Math.max(28,Math.min(90,(high-low)*.65+18))
   for(const id of mateIds){const b=boxes.get(id);if(b)distance=Math.max(distance,projection(b,dir)[1]-low+8)}
   if(distance>1500)continue
   let blocked=false
   for(const id of installed){
    if(mateIds.has(id))continue
    if(++checks>maxChecks){exhausted=true;return best??fallback(p,'budget')}
    if(sweptOverlap(box,boxes.get(id),dir,distance)){blocked=true;break}
   }
   if(!blocked&&(!best||distance<best.distance)){
    best={id:p.id,kind:mates.length?'axial':'free',reason:null,from:V(p.position).addScaledVector(dir,distance).toArray(),to:[...p.position],distance}
   }
  }
  return best??fallback(p,'blocked')
 }
 for(const step of steps){
  const pending=new Set(step.ids.filter(id=>byId.has(id)&&!installed.has(id))),tracks=[]
  // Preserve user step boundaries. Prefer a part attached to the installed model
  // inside the step; stable order breaks ties. No invented links.
  while(pending.size){
   let id=pending.values().next().value
   for(const candidate of pending){if(edges.get(candidate).some(e=>installed.has(e.other))){id=candidate;break}}
   pending.delete(id);const p=byId.get(id)
   tracks.push(planPart(p));installed.add(id)
   if(!boxes.get(id))unknownInstalled=true
  }
  results.push(tracks)
 }
 return results
}
export function sampleInstallation(track,progress){
 const t=Math.max(0,Math.min(1,Number.isFinite(progress)?progress:0)),smooth=t*t*(3-2*t)
 return {visible:track.kind!=='manual'||t>=1,position:track.from.map((v,i)=>v+(track.to[i]-v)*smooth)}
}
