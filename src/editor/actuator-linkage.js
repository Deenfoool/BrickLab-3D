import {Quaternion,Vector3} from 'three'
import {jointBodies,turnPose} from '../mechanics/linkage.js'
import {isRodPort,currentActuatorSpec} from '../mechanics/actuators.js'
import {portsFor} from '../mechanics/catalog.js?v=linear-actuator-1'

const vec=a=>new Vector3(...a)
const EPS=.02
const unit=()=>({rotation:new Quaternion(),translation:new Vector3()})
const point=(p,t)=>t?p.clone().applyQuaternion(t.rotation).add(t.translation):p.clone()
const axisOf=(a,t)=>t?a.clone().applyQuaternion(t.rotation):a.clone()
const sameAxis=(a,b)=>Math.abs(a.axis.dot(b.axis))>.99999&&a.start.clone().sub(b.start).cross(a.axis).length()<EPS
const parallel=(a,b)=>Math.abs(a.dot(b))>.99999
const signed=(a,b,axis)=>Math.atan2(a.clone().cross(b).dot(axis),a.dot(b))
const project=(p,axis)=>p.clone().addScaledVector(axis,-p.dot(axis))
const samePose=(a,b)=>Math.abs(a.rotation.dot(b.rotation))>1-1e-9&&a.translation.distanceToSquared(b.translation)<1e-10
// Expose the rod as a virtual rigid body only within the kinematic graph.
// The actual document still contains one catalog actuator.
export function planarActuatorLinkage(actuator,parts,joints,line){
 const spec=currentActuatorSpec(actuator)
 if(!spec)return null
 const rodId=Symbol('actuator rod')
 const rodPort=id=>isRodPort(actuator.design,portsFor(actuator.design).find(p=>p.id===id))
 const split=joints.map(j=>({...j,a:j.a===actuator.id&&rodPort(j.shaftPort)?rodId:j.a,b:j.b===actuator.id&&rodPort(j.socketPort)?rodId:j.b}))
 const graph=jointBodies([...parts.map(p=>p.id),rodId],split)
 const housing=graph.byPart.get(actuator.id),rod=graph.byPart.get(rodId)
 if(housing===rod)return null
 function hinges(body){
  const found=[]
  for(const edge of body.edges){
   if(edge.joint.motion!=='continuous'||Math.abs(edge.axis.dot(line.axis))>1e-5)continue
   const other=edge.other(body)
   if(other===housing||other===rod)continue
   found.push({body:other,pin:null,edge})
   if(other.edges.length===2){
    const second=other.edges.find(e=>e!==edge&&e.joint.motion==='continuous'&&sameAxis(e,edge))
    if(second&&second.other(other)!==housing&&second.other(other)!==rod&&second.other(other)!==body)
     found.push({body:second.other(other),pin:other,edge})
   }
  }
  return found
 }
 const connected=new Set([housing]),queue=[housing]
 // Include the virtual slider itself, otherwise its output branch is disconnected.
 connected.add(rod);queue.push(rod)
 for(const body of queue)for(const edge of body.edges){const other=edge.other(body);if(!connected.has(other)){connected.add(other);queue.push(other)}}
 const affected=new Set(queue.flatMap(body=>body.ids).filter(id=>id!==rodId))
 for(const rear of hinges(housing))for(const front of hinges(rod)){
  const base=rear.body,rocker=front.body,axis=rear.edge.axis
  if(base===rocker||rear.pin===rocker||front.pin===base||!parallel(axis,front.edge.axis))continue
  for(const fulcrum of hinges(base)){
   if(fulcrum.body!==rocker||!parallel(axis,fulcrum.edge.axis)||[rear.pin,front.pin].includes(fulcrum.pin)&&fulcrum.pin)continue
   const a=project(rear.edge.start,axis),b=project(front.edge.start,axis),c=project(fulcrum.edge.start,axis)
   const start=b.clone().sub(a),center=c.clone().sub(a),radius=b.distanceTo(c),length=start.length(),distance=center.length()
   if(Math.min(length,radius,distance)<EPS||Math.abs(start.clone().normalize().dot(line.axis)-1)>1e-5)continue
   const branch=Math.sign(center.clone().cross(start).dot(axis))
   if(!branch||Math.abs(center.clone().cross(start).dot(axis))<EPS)continue
   const low=Math.max(-spec.initial,Math.abs(distance-radius)-length)
   const high=Math.min(spec.stroke-spec.initial,distance+radius-length)
   if(low>EPS||high<-EPS)continue
   function solve(delta){
    const nextLength=length+delta
    if(delta<low-1e-7||delta>high+1e-7||nextLength<EPS)return null
    const along=(nextLength**2-radius**2+distance**2)/(2*distance)
    const height=branch*Math.sqrt(Math.max(0,nextLength**2-along**2))
    const direction=center.clone().divideScalar(distance)
    const nextB=a.clone().addScaledVector(direction,along).addScaledVector(axis.clone().cross(direction),height)
    const swing=signed(start,nextB.clone().sub(a),axis)
    const housingPose=turnPose(rear.edge.start,axis,swing)
    const rodPose={rotation:housingPose.rotation,translation:housingPose.translation.clone().addScaledVector(line.axis.clone().applyQuaternion(housingPose.rotation),delta)}
    const rockerPose=turnPose(fulcrum.edge.start,axis,signed(b.clone().sub(c),nextB.clone().sub(c),axis))
    const fixed=unit(),byBody=new Map()
    const assign=(body,pose)=>{if(!body)return true;if(byBody.has(body))return samePose(byBody.get(body),pose);byBody.set(body,pose);return true}
    if(!assign(base,fixed)||!assign(rocker,rockerPose)||!assign(housing,housingPose)||!assign(rod,rodPose)||!assign(rear.pin,fixed)||!assign(front.pin,rockerPose)||!assign(fulcrum.pin,fixed))return null
    // Rigidly carry unactuated branches. Validate every original joint, not just
    // the chosen triangle, to reject extra constraints and incompatible shafts.
    const work=[...byBody.keys()]
    for(const body of work)for(const edge of body.edges){const other=edge.other(body);if(!byBody.has(other)){byBody.set(other,byBody.get(body));work.push(other)}}
    for(const edge of graph.edges){
     const x=byBody.get(edge.a),y=byBody.get(edge.b)
     if(!x&&!y||x&&y&&samePose(x,y))continue
     if(!x||!y)return null
     if(point(edge.start,x).distanceTo(point(edge.start,y))>EPS)return null
     if(edge.joint.motion==='continuous'){
      if(!parallel(axisOf(edge.axis,x),axisOf(edge.axis,y)))return null
     }else if(edge.joint.motion!=='ball')return null
    }
    const transforms=new Map()
    for(const [body,pose] of byBody)for(const id of body.ids)if(id!==rodId)transforms.set(id,pose)
    return transforms
   }
   if(!solve(0))continue
   const range=[low,high].map(limit=>{
    let last=0
    for(let i=1;i<=20;i++){
     const target=limit*i/20
     if(solve(target)){last=target;continue}
     let blocked=target
     for(let step=0;step<16;step++){const mid=(last+blocked)/2;if(solve(mid))last=mid;else blocked=mid}
     return last
    }
    return last
   })
   if(range[1]-range[0]<.001)continue
   return {affected,range,solve}
  }
 }
 return null
}
