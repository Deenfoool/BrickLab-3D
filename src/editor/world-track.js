
import * as THREE from 'three'
import {parts,partMesh,loadPartModel} from './parts.js?v=system-complete'
import {hiddenSceneParts,readSceneLayers} from './scene-layers.js'
import {worldPartIds} from './world-plan.js'
export const worldSurfaces=Object.freeze({auto:'Авто',smooth:'Гладкая плитка',studs:'Шипованная поверхность',grip:'Высокое сцепление',ice:'Скользкая поверхность'});
const friction={smooth:.55,studs:.9,grip:1.2,ice:.16};
const rectParts=new Set(worldPartIds),up=new THREE.Vector3(0,1,0),down=up.clone().negate();
export function readWorldConfig(value){
 const s=value?.spawn??{},valid=(n,min,max,def)=>Number.isInteger(n)&&n>=min&&n<=max?n:def;
 return {version:1,static:true,spawn:{x:valid(s.x,-40,40,0),z:valid(s.z,-40,40,0),heading:valid(s.heading,-180,180,0),level:s.level===null||s.level===undefined?null:valid(s.level,0,120,null)}};
}
export function surfaceFor(p){
 if(Object.hasOwn(friction,p.worldSurface))return friction[p.worldSurface];
 const name=parts[p.design]?.en??'';
 return /^Tile\b/i.test(name)||p.worldRoad?.role==='road'||p.worldRoad?.role==='mark'||p.worldRoad?.role==='walk'?friction.smooth:friction.studs;
}
function matrixFor(p){return new THREE.Matrix4().compose(new THREE.Vector3(...p.position),new THREE.Quaternion(...p.rotation).normalize(),new THREE.Vector3(p.mirrored?-1:1,1,1))}
function localBodyBounds(p,model){
 const b=model.bounds.clone(),size=b.getSize(new THREE.Vector3());
 // Rectangular System brick/plate studs protrude four LDU above the body.
 // LDraw Y increases down. Only remove the stud cap from known dimensions.
 if(rectParts.has(p.design)&&[12,28].some(h=>Math.abs(size.y-h)<.3))b.min.y+=4;
 return b;
}
export function worldPartBounds(p,model){return localBodyBounds(p,model).applyMatrix4(matrixFor(p))}
function axisAligned(p){
 const m=matrixFor(p).elements;
 return [0,4,8].every(i=>[m[i],m[i+1],m[i+2]].filter(v=>Math.abs(v)>.9999).length===1);
}
function boxRecord(b,f){
 return {min:b.min.toArray(),max:b.max.toArray(),friction:f};
}
// Merge adjoining cuboids only if both other axes and friction match.
// Allow tiny geometry seams (< 0.1 LDU), not stud-sized holes or bridges.
export function mergeWorldBoxes(records){
 let result=records.map(b=>({min:[...b.min],max:[...b.max],friction:b.friction}));
 const round=n=>Math.round(n*1000)/1000;
 for(let pass=0;pass<2;pass++)for(let axis=0;axis<3;axis++){
  const other=[0,1,2].filter(i=>i!==axis),buckets=new Map();
  for(const b of result){
   const key=JSON.stringify([b.friction,...other.flatMap(i=>[round(b.min[i]),round(b.max[i])])]);
   if(!buckets.has(key))buckets.set(key,[]);
   buckets.get(key).push(b);
  }
  result=[];
  for(const bucket of buckets.values()){
   bucket.sort((a,b)=>a.min[axis]-b.min[axis]);
   let current=null;
   for(const b of bucket){
    if(current&&b.min[axis]<=current.max[axis]+.05)current.max[axis]=Math.max(current.max[axis],b.max[axis]);
    else{current=b;result.push(current)}
   }
  }
 }
 return result;
}
export function spawnFromBounds(config,boxes){
 const {spawn}=readWorldConfig(config),x=spawn.x*20,z=spawn.z*20;
 const heights=[0,...boxes.filter(b=>x>=b.min[0]&&x<=b.max[0]&&z>=b.min[2]&&z<=b.max[2]).map(b=>b.max[1])];
 let y;
 if(spawn.level===null)y=Math.max(...heights);
 else{
  const target=spawn.level*8;
  y=heights.filter(h=>Math.abs(h-target)<1).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0];
  if(y===undefined)throw Error('На выбранной высоте нет опоры для точки старта.');
 }
 return {position:[x,y,z],heading:spawn.heading*Math.PI/180};
}
function validPart(p){return p&&typeof p.id==='string'&&typeof p.design==='string'&&Object.hasOwn(parts,p.design)&&Array.isArray(p.position)&&p.position.length===3&&p.position.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)&&Array.isArray(p.rotation)&&p.rotation.length===4&&p.rotation.every(Number.isFinite)&&Math.abs(Math.hypot(...p.rotation)-1)<.01}
export async function loadWorldTrack(document,signal){
 if(document?.world?.version!==1||!Array.isArray(document.parts)||document.parts.length>3000)throw Error('Нужен сохранённый мир до 3000 деталей.');
 const hidden=hiddenSceneParts(readSceneLayers(document.sceneLayers,new Set(document.parts.map(p=>p?.id))),document.parts);
 const visible=document.parts.filter(p=>!hidden.has(p?.id));
 if(visible.some(p=>!validPart(p)))throw Error('В мире есть неизвестные детали или повреждённые координаты.');
 const models=new Map(),group=new THREE.Group(),collisionMeshes=[],ownedGeometry=new Set(),ownedMaterials=new Set(),visualGroups=new Map(),instanceObjects=[];
 group.name='BrickLab World';group.userData.worldTrack=true;
 const collMat=new THREE.MeshBasicMaterial({visible:false});ownedMaterials.add(collMat);
 function dispose(){
  group.removeFromParent();
  for(const mesh of instanceObjects)mesh.dispose();
  for(const geometry of ownedGeometry)geometry.dispose();
  for(const material of ownedMaterials)material.dispose();
  for(const [design,model] of models)if(parts[design]?.pack)for(const geometry of model.meshes)geometry.dispose();
  group.clear();
 }
 function collisionBox(min,max,f,rotation,position){
  const local=new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max));
  const size=local.getSize(new THREE.Vector3()),center=local.getCenter(new THREE.Vector3());
  if(size.x<.01||size.y<.01||size.z<.01)return;
  const geo=new THREE.BoxGeometry(size.x,size.y,size.z);geo.computeBoundingBox();ownedGeometry.add(geo);
  const mesh=new THREE.Mesh(geo,collMat);mesh.visible=false;
  if(rotation){mesh.quaternion.copy(rotation);mesh.position.copy(center.applyQuaternion(rotation).add(position))}
  else mesh.position.copy(center);
  mesh.userData={type:'box',friction:f};group.add(mesh);collisionMeshes.push(mesh);
 }
 try{
  const designs=[...new Set(visible.map(p=>p.design))];
  for(let i=0;i<designs.length;i+=4){
   signal.throwIfAborted();
   const batch=await Promise.allSettled(designs.slice(i,i+4).map(async design=>{
    const model=await loadPartModel(parts[design]);if(!model)throw Error('Нет геометрии '+design);models.set(design,model);
   }));
   if(batch.some(r=>r.status==='rejected'))throw batch.find(r=>r.status==='rejected').reason;
  }
  signal.throwIfAborted();
  const boxes=[];
  for(const p of visible){
   const model=models.get(p.design),f=surfaceFor(p),matrix=matrixFor(p);
   const hex=typeof p.color==='string'&&/^#[a-f0-9]{6}$/i.test(p.color)?p.color:parts[p.design].color;
   if(p.mirrored){
    const object=partMesh(model,hex);ownedMaterials.add(object.userData.finish);
    object.matrix.copy(matrix);object.matrixAutoUpdate=false;group.add(object);
   }else{
    const key=p.design+':'+hex;
    let list=visualGroups.get(key);
    if(!list){list={model,color:hex,matrices:[]};visualGroups.set(key,list)}
    list.matrices.push(matrix);
   }
   const name=parts[p.design].en??'';
   // Slopes use actual static triangles; other intricate LEGO pieces use
   // conservative oriented boxes. No per-stud rigid bodies.
   if(/^Slope\b/i.test(name)&&model.meshes.reduce((n,g)=>n+(g.index?.count??g.attributes.position.count)/3,0)<=12000){
    for(const geometry of model.meshes){
     geometry.computeBoundingBox();
     const mesh=new THREE.Mesh(geometry,collMat);mesh.visible=false;mesh.matrix.copy(matrix);mesh.matrixAutoUpdate=false;
     mesh.userData={type:'trimesh',friction:f};group.add(mesh);collisionMeshes.push(mesh);
    }
   }else if(axisAligned(p))boxes.push(boxRecord(worldPartBounds(p,model),f));
   else{
    const b=localBodyBounds(p,model);
    if(p.mirrored){const a=-b.max.x;b.max.x=-b.min.x;b.min.x=a}
    collisionBox(b.min.toArray(),b.max.toArray(),f,new THREE.Quaternion(...p.rotation).normalize(),new THREE.Vector3(...p.position));
   }
  }
  for(const {model,color,matrices} of visualGroups.values()){
   const prototype=partMesh(model,color);ownedMaterials.add(prototype.userData.finish);
   for(const child of prototype.children){
    const mesh=new THREE.InstancedMesh(child.geometry,child.material,matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);instanceObjects.push(mesh);
   }
  }
  // The editor's visible building grid is also a finite solid base in a run.
  const floorGeo=new THREE.BoxGeometry(1620,8,1620),floorMat=new THREE.MeshStandardMaterial({color:0x929ca6,roughness:.8});
  ownedGeometry.add(floorGeo);ownedMaterials.add(floorMat);
  const floor=new THREE.Mesh(floorGeo,floorMat);floor.position.y=-4;group.add(floor);
  boxes.push({min:[-810,-8,-810],max:[810,0,810],friction:.8});
  const merged=mergeWorldBoxes(boxes);
  for(const b of merged)collisionBox(b.min,b.max,b.friction);
  group.updateMatrixWorld(true);
  const colliders=collisionMeshes.map(mesh=>({mesh,bounds:mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),normal:new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)}));
  // Spatial lookup for kinematic support and spawn probes.
  const bins=new Map(),binSize=100;
  for(const c of colliders){
   for(let x=Math.floor(c.bounds.min.x/binSize);x<=Math.floor(c.bounds.max.x/binSize);x++)for(let z=Math.floor(c.bounds.min.z/binSize);z<=Math.floor(c.bounds.max.z/binSize);z++){
    const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(c);
   }
  }
  const ray=new THREE.Raycaster(new THREE.Vector3(),down),hits=[],normal=new THREE.Vector3();
  function heightAt(x,z,top,bottom){
   if(![x,z,top,bottom].every(Number.isFinite)||top<bottom)return;
   ray.ray.origin.set(x,top,z);ray.far=top-bottom;let height;
   for(const c of bins.get(Math.floor(x/binSize)+','+Math.floor(z/binSize))??[]){
    if(x<c.bounds.min.x||x>c.bounds.max.x||z<c.bounds.min.z||z>c.bounds.max.z||c.bounds.min.y>top||c.bounds.max.y<(height??bottom))continue;
    hits.length=0;c.mesh.raycast(ray,hits);
    for(const hit of hits)if(hit.point.y>=(height??bottom)&&normal.copy(hit.face.normal).applyNormalMatrix(c.normal).y>.25)height=hit.point.y;
   }
   return height;
  }
  const cfg=readWorldConfig(document.world),spawn=cfg.spawn,x=spawn.x*20,z=spawn.z*20;
  const high=Math.max(960,...colliders.map(c=>c.bounds.max.y))+10;
  const y=spawn.level===null?heightAt(x,z,high,-.1):heightAt(x,z,spawn.level*8+1,spawn.level*8-1);
  if(!Number.isFinite(y))throw Error('На точке старта нет поверхности. Измени уровень в World.');
  const heading=spawn.heading*Math.PI/180,start=new THREE.Vector3(x,y,z);
  return {group,start,heading,heightAt,collisionMeshes,stats:{parts:visible.length,colliders:collisionMeshes.length},dispose};
 }catch(e){dispose();throw e}
}
