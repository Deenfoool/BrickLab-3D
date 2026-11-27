
import {Box3,Matrix4,Quaternion,Vector3} from 'three'
import {parts,loadPartModel} from './parts.js?v=system-complete'
import {baseRotation} from './placement.js?v=torque-clutch'
import {planWorldFill,planWorldTerrain,worldPartIds} from './world-plan.js'
import {newProject} from '../projects/documents.js'
export const provingName='BrickLab Proving Ground';
export const provingZones=Object.freeze([
 {name:'01 · Кольцевая трасса',description:'Закруглённые повороты, четыре контрольных створа'},
 {name:'02 · Скорость и торможение',description:'Северная прямая, точка старта'},
 {name:'03 · Гараж и парковка',description:'Западная часть карты'},
 {name:'04 · Подвеска',description:'Диагональные ступенчатые бугры'},
 {name:'05 · Внедорожный участок',description:'Ступенчатый рельеф'},
 {name:'06 · Подъём',description:'Лестничный склон'},
 {name:'07 · Рампа',description:'Настраиваемый наклон'},
 {name:'08 · Мост и балансир',description:'Подвижные шарнирные настилы'},
 {name:'09 · Роликовый стенд',description:'Два приводных цилиндрических ряда'},
 {name:'10 · Подъёмная платформа',description:'Вертикальное перемещение'},
 {name:'11 · Сцепление',description:'Синяя скользкая и тёмно-серая цепкая полосы'}
]);
const C={base:'#737b85',road:'#353b42',edge:'#a0a5a9',mark:'#f4f4f4',gold:'#e4b85e',brick:'#8b929a',green:'#648b50',ice:'#719cbb',grip:'#242930'};
const key=(x,z)=>x+','+z;
function planGround(available){
 const cells=[],sections=new Map(),moving=new Map();
 function append(batch,name,surface,motion){
  for(const c of batch){c.section=name;if(surface)c.surface=surface;if(motion)c.motion=motion;cells.push(c)}
  if(cells.length>2960)throw Error('Полигон превышает бюджет деталей.');
 }
 function fill(name,kind,x,z,width,depth,level,rows,color,surface,motion){
  // Partition large rectangles into bounded operations, with exact coverage.
  for(let dz=0;dz<depth;dz+=16)for(let dx=0;dx<width;dx+=16){
   append(planWorldFill({kind,x:x+dx,z:z+dz,width:Math.min(16,width-dx),depth:Math.min(16,depth-dz),level,rows,color,smart:true,bond:true,available},cells.length),name,surface,motion);
  }
 }
 function pack(mask,kind,level,describe){
  const remaining=new Map(mask),coords=[...mask.keys()].map(k=>k.split(',').map(Number)).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
  for(const [x,z] of coords){
   const value=remaining.get(key(x,z));if(value===undefined)continue;
   let wBest=1,dBest=1,span=32;
   for(let d=1;d<=32;d++){let w=0;while(w<span&&remaining.get(key(x+w,z+d-1))===value)w++;span=w;if(!w)break;if(w*d>wBest*dBest){wBest=w;dBest=d}}
   for(let dz=0;dz<dBest;dz++)for(let dx=0;dx<wBest;dx++)remaining.delete(key(x+dx,z+dz));
   const {section,color,surface}=describe(value);fill(section,kind,x,z,wBest,dBest,level,1,color,surface);
  }
 }
 const roadMask=new Map();
 // Rounded square: centerline radius 12 around a 38x38-stud inner square.
 for(let z=-38;z<=38;z++)for(let x=-38;x<=38;x++){
  const radial=Math.hypot(Math.max(0,Math.abs(x)-19),Math.max(0,Math.abs(z)-19)),off=Math.abs(radial-12);
  if(off>7)continue;
  const inside=off<=6;
  let type=inside?'road':'edge';
  if(inside&&Math.abs(z+31)<=6&&Math.abs(x)<=19&&x===-14)type='start';
  else if(inside&&off<.51&&((x+z)%8+8)%8<3)type='mark';
  if(inside&&type==='road'&&Math.abs(z)<=16&&x>24)type='ice';
  if(inside&&type==='road'&&Math.abs(z)<=16&&x< -24)type='grip';
  roadMask.set(key(x,z),type);
 }
 // Access lane across the inner field; connects at the asphalt edge.
 for(let z=-24;z<=24;z++)for(let x=-4;x<=4;x++)roadMask.set(key(x,z),'road');
 for(const z of [-24,24])for(let x=-4;x<=4;x++)roadMask.set(key(x,z),'road');
 const roadSection=provingZones[0].name;
 pack(new Map([...roadMask.keys()].map(k=>[k,'base'])),'plate',0,()=>({section:roadSection,color:C.base}));
 pack(roadMask,'tile',1,type=>({section:roadSection,color:type==='start'?C.gold:C[type],surface:type==='ice'?'ice':type==='grip'?'grip':'smooth'}));
 const pad=(name,x,z,w,d,color=C.edge)=>{fill(name,'plate',x,z,w,d,0,1,C.base);fill(name,'tile',x,z,w,d,1,1,color,'smooth')};
 const garage=provingZones[2].name;
 // Open-front service bay, roof on three load-bearing walls.
 pad(garage,-22,-22,14,17);
 fill(garage,'brick',-22,-22,14,1,2,6,C.brick);
 fill(garage,'brick',-22,-21,1,9,2,6,C.brick);
 fill(garage,'brick',-9,-21,1,9,2,6,C.brick);
 // Two layers of real plates spanning the supported walls.
 fill(garage,'plate',-22,-22,14,10,20,2,C.base);
 pad(garage,-8,-10,4,4);
 const suspension=provingZones[3].name;
 fill(suspension,'plate',-22,0,14,10,0,1,C.base);
 for(const [x,z] of [[-21,1],[-13,5]]){
  fill(suspension,'plate',x,z,4,4,1,2,C.brick,'studs');
  fill(suspension,'brick',x+1,z+1,2,2,3,1,C.gold,'studs');
 }
 const offroad=provingZones[4].name;
 append(planWorldTerrain({tool:'terrainHill',level:0,terrainHeight:6,terrainStep:2,color:C.green,available},{x:-22,z:12},{x:-9,z:22}),offroad,'studs');
 const climb=provingZones[5].name;
 append(planWorldTerrain({tool:'terrainSteps',level:0,terrainHeight:6,terrainStep:2,color:C.brick,available},{x:8,z:-22},{x:22,z:-12}),climb,'studs');
 const ramp=provingZones[6].name;
 // Pivot at near edge; rest pose is above the floor, tilt rises toward -Z.
 fill(ramp,'brick',8,-10,13,1,0,1,C.brick);
 fill(ramp,'plate',8,-9,13,8,3,2,C.gold,'grip','ramp');
 const bridge=provingZones[7].name;
 // Supports are deliberately outside the sweep of the moving deck.
 for(const x of [8,16]){
  const type=x===8?'bridge':'balance';
  fill(bridge,'brick',x,1,1,10,0,2,C.brick);
  fill(bridge,'brick',x+6,1,1,10,0,2,C.brick);
  fill(bridge,'plate',x+1,2,5,8,7,2,C.gold,'grip',type);
 }
 const lift=provingZones[9].name;
 fill(lift,'plate',-22,-4,12,3,0,1,C.base);
 fill(lift,'plate',-22,-4,12,3,2,2,C.gold,'grip','platform');
 // Zone entry stripes, laid directly on the base and outside the access lane.
 for(const [x,z,d] of [[-8,1,3],[-8,14,3],[5,-20,3],[5,-7,3],[5,4,3],[5,15,3]]){
  fill('Разметка зон','tile',x,z,2,d,0,1,C.gold,'smooth');
 }
 // Moving rollers are real pulleys, fitted from loaded geometry below.
 const roller=provingZones[8].name;
 for(const x of [8,22])fill(roller,'brick',x,12,1,10,0,1,C.brick);
 return cells;
}
export async function createProvingGround(signal){
 const available=worldPartIds.filter(id=>Object.hasOwn(parts,id)),models=new Map(),owned=new Set();
 const load=async designs=>{
  for(let i=0;i<designs.length;i+=4){
   signal.throwIfAborted();
   const batch=await Promise.allSettled(designs.slice(i,i+4).filter(id=>!models.has(id)).map(async id=>{
    if(!Object.hasOwn(parts,id))throw Error('Деталь отсутствует: '+id);
    const model=await loadPartModel(parts[id]);if(!model)throw Error('Не удалось загрузить '+id);
    models.set(id,model);if(parts[id].pack)owned.add(id);
   }));
   if(batch.some(r=>r.status==='rejected'))throw batch.find(r=>r.status==='rejected').reason;
  }
 };
 try{
  const cells=planGround(available);
  await load([...new Set([...cells.map(c=>c.design),'4185'])]);
  const records=[],groups=new Map(),obstacles=new Map();
  function add(p,name,motion,surface){
   p.id='pg-'+(records.length+1);if(surface)p.worldSurface=surface;
   records.push(p);
   if(!groups.has(name))groups.set(name,[]);
   groups.get(name).push(p.id);
   if(motion){if(!obstacles.has(motion))obstacles.set(motion,[]);obstacles.get(motion).push(p.id)}
  }
  for(const c of cells){
   const model=models.get(c.design),q=new Quaternion().fromArray(baseRotation);
   let b=model.bounds.clone().applyMatrix4(new Matrix4().makeRotationFromQuaternion(q)),size=b.getSize(new Vector3());
   const match=(x,z)=>Math.abs(x-(c.w??1)*20)<=2&&Math.abs(z-(c.d??1)*20)<=2;
   if(!match(size.x,size.z)&&match(size.z,size.x)){
    q.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2));
    b=model.bounds.clone().applyMatrix4(new Matrix4().makeRotationFromQuaternion(q));size=b.getSize(new Vector3());
   }
   if(!match(size.x,size.z))throw Error('Габариты детали '+c.design+' не соответствуют шаблону полигона.');
   const center=b.getCenter(new Vector3());
   add({design:c.design,color:c.color,rotation:q.toArray(),position:[c.x-center.x,c.y-b.min.y,c.z-center.z]},c.section,c.motion,c.surface);
  }
  const pulley=models.get('4185'),q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2);
  const b=pulley.bounds.clone().applyMatrix4(new Matrix4().makeRotationFromQuaternion(q)),size=b.getSize(new Vector3()),center=b.getCenter(new Vector3());
  if(Math.abs(size.y-size.z)>Math.max(size.y,size.z)*.2||size.x<=0||size.x>size.y)throw Error('Геометрия ролика 4185 не подходит.');
  const count=Math.floor(240/size.x);
  if(count<1||count>64)throw Error('Неверный размер ролика.');
  for(const [z,name] of [[14,'roller-a'],[19,'roller-b']])for(let i=0;i<count;i++){
   add({design:'4185',color:C.grip,rotation:q.toArray(),position:[300+(i-(count-1)/2)*size.x-center.x,Math.max(size.y/2,24)-center.y,z*20-center.z]},provingZones[8].name,name,'grip');
  }
  if(records.length>3000)throw Error('Полигон превышает 3000 деталей.');
  const obstacle=(id,kind,extra)=>({id:'pg-'+id,name:{ramp:'Рампа',bridge:'Качающийся мост',balance:'Балансир',platform:'Подъёмная платформа','roller-a':'Ролик A','roller-b':'Ролик B'}[id],kind,partIds:obstacles.get(id),axis:'x',pivot:'center',angle:15,speed:.35,travel:4,mass:4,...extra});
  return {...newProject(provingName,{parts:records}),sceneLayers:{groups:[...groups].map(([name,partIds],i)=>({id:'pg-zone-'+i,name,partIds,hidden:false})),hiddenPartIds:[]},world:{version:1,static:true,provingGround:1,spawn:{x:-17,z:-31,heading:90,level:2},obstacles:[obstacle('ramp','ramp',{pivot:'max',angle:8}),obstacle('bridge','bridge',{angle:15,pivot:'center'}),obstacle('balance','balance',{angle:18,mass:2}),obstacle('platform','platform',{travel:4,speed:.25}),obstacle('roller-a','roller',{speed:.5}),obstacle('roller-b','roller',{speed:.5})]}};
 }finally{for(const id of owned)for(const geometry of models.get(id).meshes)geometry.dispose()}
}
