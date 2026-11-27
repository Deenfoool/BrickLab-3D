
import {Quaternion,Vector3} from 'three'
export const obstacleKinds=Object.freeze({bridge:'Качающийся мост',balance:'Балансир',roller:'Ролик',platform:'Подвижная платформа',ramp:'Регулируемая рампа'});
const finite=(n,min,max,def)=>Number.isFinite(n)&&n>=min&&n<=max?n:def;
export function readObstacles(value){
 const seen=new Set(),used=new Set(),out=[];
 for(const raw of Array.isArray(value)?value.slice(0,32):[]){
  if(!raw||typeof raw.id!=='string'||seen.has(raw.id)||!Object.hasOwn(obstacleKinds,raw.kind)||!Array.isArray(raw.partIds))continue;
  const ids=[...new Set(raw.partIds.filter(p=>typeof p==='string'&&p.length<=120))];
  if(!ids.length||ids.length>256||ids.some(id=>used.has(id)))continue;
  seen.add(raw.id);ids.forEach(id=>used.add(id));
  out.push({id:raw.id,name:String(raw.name??obstacleKinds[raw.kind]).slice(0,80),kind:raw.kind,partIds:ids,axis:raw.axis==='z'?'z':'x',pivot:['center','min','max'].includes(raw.pivot)?raw.pivot:'center',angle:finite(raw.angle,0,45,20),speed:finite(raw.speed,.1,3,.5),travel:finite(raw.travel,1,16,4),mass:finite(raw.mass,.5,30,3)});
 }
 return out;
}
const units=.01;
const axisFor=s=>new Vector3(s.axis==='x'?1:0,0,s.axis==='z'?1:0);
export function obstaclePivot(spec,box){
 const pivot=box.getCenter(new Vector3());
 if(spec.kind==='bridge'||spec.kind==='ramp'){
  const perpendicular=spec.axis==='x'?'z':'x';
  if(spec.pivot!=='center')pivot[perpendicular]=box[spec.pivot][perpendicular];
 }
 return pivot;
}
export function obstacleTransform(spec,time){
 const axis=axisFor(spec),translation=new Vector3(),rotation=new Quaternion();
 const phase=time*spec.speed*2*Math.PI;
 if(spec.kind==='platform')translation.y=spec.travel*8*(1-Math.cos(phase))/2;
 if(spec.kind==='ramp')rotation.setFromAxisAngle(axis,spec.angle*Math.PI/180);
 if(spec.kind==='roller')rotation.setFromAxisAngle(axis,phase);
 return {translation,rotation};
}
// Passive bodies use a real Rapier revolute joint; driven ones are
// position-based kinematic bodies. Both expose their contact velocities.
export function mountObstacles(rapier,world,records){
 const mounted=[];
 for(const record of records??[]){
  const {spec,pivot,boxes,visual}=record,axis=axisFor(spec);
  const passive=spec.kind==='bridge'||spec.kind==='balance';
  const base=pivot.clone().multiplyScalar(units),initial=obstacleTransform(spec,0);
  visual.position.copy(pivot).add(initial.translation);visual.quaternion.copy(initial.rotation);
  const desc=passive?rapier.RigidBodyDesc.dynamic().setLinearDamping(.5).setAngularDamping(1.2).setCanSleep(false):rapier.RigidBodyDesc.kinematicPositionBased();
  const body=world.createRigidBody(desc.setTranslation(base.x,base.y+initial.translation.y*units,base.z).setRotation(initial.rotation));
  if(spec.kind==='roller'){
   const b=record.bounds,size=b.getSize(new Vector3()),length=size[spec.axis],radius=Math.max(size.y,size[spec.axis==='x'?'z':'x'])/2;
   const q=new Quaternion().setFromUnitVectors(new Vector3(0,1,0),axis);
   world.createCollider(rapier.ColliderDesc.cylinder(length*units/2,radius*units).setRotation(q).setFriction(.9),body);
  }else{
   const total=boxes.reduce((n,b)=>n+b.size.x*b.size.y*b.size.z,0);
   for(const b of boxes){
    const c=b.center.clone().sub(pivot).multiplyScalar(units),s=b.size.clone().multiplyScalar(units/2);
    const collider=rapier.ColliderDesc.cuboid(s.x,s.y,s.z).setTranslation(c.x,c.y,c.z).setFriction(b.friction);
    if(passive)collider.setMass(spec.mass*(b.size.x*b.size.y*b.size.z)/Math.max(total,.001));
    world.createCollider(collider,body);
   }
  }
  if(passive){
   const fixed=world.createRigidBody(rapier.RigidBodyDesc.fixed().setTranslation(base.x,base.y,base.z));
   const joint=world.createImpulseJoint(rapier.JointData.revolute({x:0,y:0,z:0},{x:0,y:0,z:0},axis),fixed,body,true);
   const max=spec.angle*Math.PI/180;
   joint.setLimits(-max,max);
   // Light centering spring. Wheel reaction impulses and chassis contacts
   // displace the deck; it is not driven through a canned animation.
   joint.configureMotorPosition(0,spec.mass*spec.speed, spec.mass*.35);
  }
  mounted.push({record,body,base,passive});
 }
 return {
  count:mounted.length,
  beforeStep(time){
   for(const m of mounted)if(!m.passive){
    const t=obstacleTransform(m.record.spec,time);
    m.body.setNextKinematicTranslation(m.base.clone().addScaledVector(t.translation,units));
    m.body.setNextKinematicRotation(t.rotation);
   }
  },
  sync(){
   for(const {record,body} of mounted){
    const p=body.translation(),q=body.rotation();
    record.visual.position.set(p.x/units,p.y/units,p.z/units);
    record.visual.quaternion.set(q.x,q.y,q.z,q.w);
    record.visual.updateMatrixWorld(true);
   }
  },
  reset(){for(const {record} of mounted){record.visual.position.copy(record.pivot);record.visual.quaternion.identity();record.visual.updateMatrixWorld(true)}}
 };
}
