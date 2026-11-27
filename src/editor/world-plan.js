export const STUD=20, PLATE=8;
export const WORLD_PARTS=Object.freeze({
 plate:Object.freeze({design:'3024',height:1}),
 brick:Object.freeze({design:'3005',height:3}),
 tile:Object.freeze({design:'3070b',height:1})
});
// Standard rectangular System parts only. Runtime filters the catalog;
// physical model dimensions are checked before placement, never fabricated.
const entries={
 plate:[['91405',16,16],['92438',8,16],['3036',6,8],['3958',6,6],['3035',4,8],['3032',4,6],['3031',4,4],['3034',2,8],['3795',2,6],['3020',2,4],['3021',2,3],['3022',2,2],['3460',1,8],['3666',1,6],['3710',1,4],['3623',1,3],['3023',1,2],['3024',1,1]],
 brick:[['3007',2,8],['2456',2,6],['3001',2,4],['3002',2,3],['3003',2,2],['3008',1,8],['3009',1,6],['3010',1,4],['3622',1,3],['3004',1,2],['3005',1,1]],
 tile:[['87079',2,4],['3068b',2,2],['6636',1,6],['2431',1,4],['63864',1,3],['3069b',1,2],['3070b',1,1],['3070a',1,1],['3070',1,1]]
};
export const worldPartIds=Object.freeze([...new Set(Object.values(entries).flat().map(x=>x[0]))]);
function candidates(kind,available,smart){
 const allowed=available===undefined?null:new Set(available);
 return entries[kind].filter(([id,w,d])=>(!allowed||allowed.has(id))&&(smart||w*d===1)).flatMap(([design,w,d])=>w===d?[{design,w,d}]:[{design,w,d},{design,w:d,d:w}]).sort((a,b)=>b.w*b.d-a.w*a.d||Math.max(b.w,b.d)-Math.max(a.w,a.d)||b.w-a.w||a.design.localeCompare(b.design));
}
export function planWorldFill({kind,x,z,width,depth,level,rows,color,smart=false,bond=true,available},existing=0){
 const part=Object.hasOwn(WORLD_PARTS,kind)?WORLD_PARTS[kind]:null;
 if(!part||!Number.isInteger(existing)||existing<0||![x,z,width,depth,level,rows].every(Number.isInteger)||x< -40||z< -40||x+width>41||z+depth>41||width<1||width>32||depth<1||depth>32||level<0||rows<1||rows>16||level+rows*part.height>120||!/^#[0-9a-f]{6}$/i.test(color))throw Error('Проверь размеры и координаты.');
 if(kind==='tile'&&rows!==1)throw Error('Плитка без выступов: только один ряд.');
 if(width*depth*rows>8192)throw Error('До 8192 stud-слоёв за операцию.');
 const options=candidates(kind,available,smart);
 if(!options.some(p=>p.w===1&&p.d===1))throw Error('Базовая деталь отсутствует в библиотеке.');
 const cells=[];
 function add(p,dx,dz,h){
  if(cells.length>=256||existing+cells.length>=3000)throw Error('До 256 деталей за операцию, до 3000 в мире.');
  const cell={design:p.design,x:(x+dx+(p.w-1)/2)*STUD,z:(z+dz+(p.d-1)/2)*STUD,y:(level+h*part.height)*PLATE,color};
  // Keep the original one-stud format for manual plate/brick fills.
  if(smart||kind==='tile')Object.assign(cell,{w:p.w,d:p.d,height:part.height*PLATE});
  cells.push(cell);
 }
 for(let h=0;h<rows;h++){
  const filled=new Uint8Array(width*depth);
  const mark=(dx,dz,p)=>{for(let iz=dz;iz<dz+p.d;iz++)for(let ix=dx;ix<dx+p.w;ix++)filled[iz*width+ix]=1};
  const fits=(dx,dz,p,xEnd,zEnd)=>{
   if(dx+p.w>xEnd||dz+p.d>zEnd)return false;
   for(let iz=dz;iz<dz+p.d;iz++)for(let ix=dx;ix<dx+p.w;ix++)if(filled[iz*width+ix])return false;
   return true;
  };
  function region(x0,z0,xEnd,zEnd){
   for(let dz=z0;dz<zEnd;dz++)for(let dx=x0;dx<xEnd;dx++){
    if(filled[dz*width+dx])continue;
    const p=options.find(p=>fits(dx,dz,p,xEnd,zEnd));
    if(!p)throw Error('Не удалось заполнить площадку.');
    mark(dx,dz,p);add(p,dx,dz,h);
   }
  }
  // Alternate a one-stud starter strip on brick courses. This shifts many
  // vertical seams but is not a structural strength guarantee.
  if(smart&&bond&&kind==='brick'&&h%2===1&&Math.max(width,depth)>1){
   if(width>=depth){region(0,0,1,depth);region(1,0,width,depth)}
   else{region(0,0,width,1);region(0,1,width,depth)}
  }else region(0,0,width,depth);
 }
 return cells;
}
export function worldCoverage(cells){return cells.reduce((n,c)=>n+(c.w??1)*(c.d??1),0)}

export function worldLine(a,b){
 let x=a.x,z=a.z;const dx=Math.abs(b.x-x),dz=Math.abs(b.z-z),sx=x<b.x?1:-1,sz=z<b.z?1:-1;let err=dx-dz;const out=[];
 for(;;){out.push({x,z});if(x===b.x&&z===b.z)break;const e=2*err;if(e> -dz){err-=dz;x+=sx}if(e<dx){err+=dx;z+=sz}}
 return out;
}
export function worldGestureCells(settings,start,end,trail=[],existing=0){
 const valid=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.z)&&p.x>=-40&&p.x<=40&&p.z>=-40&&p.z<=40;
 if(!valid(start)||!valid(end))throw Error('За пределами строительной площадки.');
 const {tool}=settings;
 if(['road','roadCorner','roadCurve','roadCross','roadT'].includes(tool))return planWorldRoad(settings,start,end,existing);
 if(['terrainHill','terrainSlope','terrainSteps','terrainBasin','terrainRough'].includes(tool))return planWorldTerrain(settings,start,end,existing);
 if(tool==='area'||tool==='wall'){
  const b={...end};
  if(tool==='wall'){if(Math.abs(b.x-start.x)>=Math.abs(b.z-start.z))b.z=start.z;else b.x=start.x}
  return planWorldFill({...settings,x:Math.min(start.x,b.x),z:Math.min(start.z,b.z),width:Math.abs(start.x-b.x)+1,depth:Math.abs(start.z-b.z)+1},existing)
 }
 if(tool!=='brush')throw Error('Выбери инструмент строительства.');
 const seen=new Set(),cells=[];
 for(const point of trail.length?trail:[start,end]){
  if(!valid(point))throw Error('За пределами строительной площадки.');
  const key=point.x+','+point.z;if(seen.has(key))continue;seen.add(key);
  cells.push(...planWorldFill({...settings,x:point.x,z:point.z,width:1,depth:1},existing+cells.length));
  if(cells.length>256)throw Error('До 256 деталей за один мазок.');
 }
 return cells;
}


const cellKey=(x,z)=>x+','+z;
const gridPoint=p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.z)&&p.x>=-40&&p.x<=40&&p.z>=-40&&p.z<=40;
// Compact equal-value grid cells to real catalog rectangles, never extending
// beyond the mask. Shared by terrain and road generation.
function packMask(mask,kind,level,available,existing,output,describe){
 const remaining=new Map(mask),coords=[...remaining.keys()].map(k=>k.split(',').map(Number)).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 for(const [x,z] of coords){
  const type=remaining.get(cellKey(x,z));if(type===undefined)continue;
  let bestW=1,bestD=1,span=32;
  for(let d=1;d<=32;d++){
   let w=0;while(w<span&&remaining.get(cellKey(x+w,z+d-1))===type)w++;
   span=w;if(!span)break;
   if(span*d>bestW*bestD){bestW=span;bestD=d}
  }
  for(let dz=0;dz<bestD;dz++)for(let dx=0;dx<bestW;dx++)remaining.delete(cellKey(x+dx,z+dz));
  const spec=describe(type);
  const batch=planWorldFill({kind,x,z,width:bestW,depth:bestD,level,rows:1,color:spec.color,smart:true,bond:false,available},existing+output.length);
  for(const c of batch){if(spec.road)c.road={...spec.road};output.push(c)}
  if(output.length>256)throw Error('До 256 деталей за операцию. Раздели участок.');
 }
}
const roadValue=(role,color,axis)=>JSON.stringify({role,color,axis});
const asphalt=r=>r.role==='road'||r.role==='mark';
function mergeSurface(a,b){
 if(!a)return b;
 const x=JSON.parse(a),y=JSON.parse(b);
 if(!asphalt(x))return asphalt(y)?b:a;
 if(!asphalt(y))return a;
 if(x.axis!==y.axis)return roadValue('road',y.role==='road'?y.color:x.role==='road'?x.color:y.asphaltColor??'#353b42','joint');
 if(x.role==='road'&&y.role==='mark'&&x.axis==='joint')return a;
 return b;
}
// Snap near a real asphalt centerline or an adjacent open end. The
// search uses complete cross-sections, including roads without markings.
export function snapRoadPoint(point,records,level,maxDistance=2){
 if(!gridPoint(point))return point;
 const cross=new Map();
 for(const r of records){
  if(r.protected||r.level!==level||!['road','mark'].includes(r.role)||!['x','z'].includes(r.axis)||!Number.isInteger(r.w)||!Number.isInteger(r.d)||r.w<1||r.d<1||r.w>32||r.d>32||!gridPoint({x:r.x,z:r.z})||!gridPoint({x:r.x+r.w-1,z:r.z+r.d-1}))continue;
  const xAxis=r.axis==='x',along=xAxis?point.x:point.z;
  for(let n=(xAxis?r.x:r.z);n<(xAxis?r.x+r.w:r.z+r.d);n++){
   if(Math.abs(n-along)>maxDistance)continue;
   const k=r.axis+':'+n,values=cross.get(k)??new Set();
   for(let v=(xAxis?r.z:r.x);v<(xAxis?r.z+r.d:r.x+r.w);v++)values.add(v);
   cross.set(k,values);
  }
 }
 let best=point,distance=maxDistance+.000001;
 for(const [key,values] of cross){
  const [axis,nText]=key.split(':'),n=Number(nText),v=[...values].sort((a,b)=>a-b);
  for(let i=0;i<v.length;){
   const lo=v[i];let hi=lo;i++;
   while(i<v.length&&v[i]===hi+1){hi=v[i];i++}
   if(![9,13,17,21,25].includes(hi-lo+1))continue;
   const center=(lo+hi)/2,candidate=axis==='x'?{x:n,z:center}:{x:center,z:n};
   const dist=Math.hypot(candidate.x-point.x,candidate.z-point.z);
   if(dist<distance){best=candidate;distance=dist}
  }
 }
 return best;
}
export function planWorldRoad(settings,start,end,existing=0){
 const {tool,level,roadWidth=13,sidewalk=2,marking='dash',foundation=true,roadColor='#353b42',sidewalkColor='#a0a5a9',turnFirst='x',radius=0,autoJoin=true,available,roadParts=[]}=settings;
 if(!gridPoint(start)||!gridPoint(end)||!Number.isInteger(level)||level<0||level+(foundation?2:1)>120||![9,13,17,21,25].includes(roadWidth)||![0,1,2,3].includes(sidewalk)||!['none','dash','solid'].includes(marking)||!['x','z'].includes(turnFirst)||!Number.isInteger(radius)||radius<0||radius>32||!/^#[0-9a-f]{6}$/i.test(roadColor)||!/^#[0-9a-f]{6}$/i.test(sidewalkColor))throw Error('Проверь параметры дороги.');
 const half=(roadWidth-1)/2,outer=half+sidewalk,surfaceLevel=level+(foundation?1:0),mask=new Map();
 if(autoJoin){
  start=snapRoadPoint(start,roadParts,surfaceLevel);
  if(!['roadCross','roadT'].includes(tool))end=snapRoadPoint(end,roadParts,surfaceLevel);
 }
 let joint=null;
 const put=(x,z,offset,along,axis)=>{
  if(Math.abs(offset)>outer+.00001)return;
  if(!gridPoint({x,z}))throw Error('Дорога выходит за границы площадки.');
  const onRoad=Math.abs(offset)<=half+.00001;
  const near=joint&&Math.max(Math.abs(x-joint.x),Math.abs(z-joint.z))<=outer;
  const stripe=onRoad&&Math.abs(offset)<.51&&!near&&(marking==='solid'||marking==='dash'&&((Math.floor(along)%6)+6)%6<3);
  const type=onRoad?(stripe?'mark':'road'):'walk';
  const value=roadValue(type,type==='mark'?'#f4f4f4':type==='road'?roadColor:sidewalkColor,axis);
  const k=cellKey(x,z);mask.set(k,mergeSurface(mask.get(k),value));
 };
 function segment(a,b,padA=0,padB=0,forceAxis){
  const horizontal=forceAxis?forceAxis==='x':a.z===b.z;
  if(!horizontal&&a.x!==b.x)throw Error('Дорога должна идти по сетке.');
  const from=horizontal?a.x:a.z,to=horizontal?b.x:b.z,fixed=horizontal?a.z:a.x;
  for(let n=Math.min(from,to)-(from<=to?padA:padB);n<=Math.max(from,to)+(from<=to?padB:padA);n++)
   for(let off=-outer;off<=outer;off++)put(horizontal?n:fixed+off,horizontal?fixed+off:n,off,n,horizontal?'x':'z');
 }
 if(tool==='road'){
  const b={...end},axis=Math.abs(b.x-start.x)>=Math.abs(b.z-start.z)?'x':'z';
  if(axis==='x')b.z=start.z;else b.x=start.x;
  segment(start,b,0,0,axis);
 }else if(tool==='roadCorner'||tool==='roadCurve'){
  const dx=Math.abs(end.x-start.x),dz=Math.abs(end.z-start.z);
  if(dx<=outer||dz<=outer)throw Error('Увеличь обе стороны поворота.');
  const corner=turnFirst==='x'?{x:end.x,z:start.z}:{x:start.x,z:end.z};
  if(tool==='roadCorner'){joint=corner;segment(start,corner,0,outer);segment(corner,end,outer,0)}
  else{
   const r=radius||Math.min(dx,dz,Math.max(outer+1,Math.round(Math.min(dx,dz)*.75)));
   if(r<=outer||r>Math.min(dx,dz))throw Error('Радиус должен быть больше половины ширины дороги с тротуаром и помещаться в обе стороны.');
   const u={x:Math.sign(corner.x-start.x),z:Math.sign(corner.z-start.z)},v={x:Math.sign(end.x-corner.x),z:Math.sign(end.z-corner.z)};
   const a={x:corner.x-u.x*r,z:corner.z-u.z*r},b={x:corner.x+v.x*r,z:corner.z+v.z*r},center={x:a.x+v.x*r,z:a.z+v.z*r};
   segment(start,a,0,0,turnFirst);
   segment(b,end,0,0,turnFirst==='x'?'z':'x');
   // Quarter-circle annulus sampled at stud centers; straight butt ends.
   for(let x=center.x-r-outer;x<=center.x+r+outer;x++)for(let z=center.z-r-outer;z<=center.z+r+outer;z++){
    const aCoord=(x-center.x)*u.x+(z-center.z)*u.z,bCoord=(x-center.x)*v.x+(z-center.z)*v.z;
    if(aCoord<=0||bCoord>=0)continue;
    const offset=Math.hypot(aCoord,bCoord)-r;
    put(x,z,offset,Math.atan2(aCoord,-bCoord)*r,'curve');
   }
  }
 }else if(tool==='roadCross'||tool==='roadT'){
  joint=start;
  const rx=Math.abs(end.x-start.x),rz=Math.abs(end.z-start.z);
  if(rx<=outer||rz<=outer)throw Error('Протяни перекрёсток за пределы центральной зоны.');
  segment({x:start.x-rx,z:start.z},{x:start.x+rx,z:start.z});
  if(tool==='roadCross')segment({x:start.x,z:start.z-rz},{x:start.x,z:start.z+rz});
  else segment(start,{x:start.x,z:start.z+Math.sign(end.z-start.z)*rz},outer,0);
 }else throw Error('Неизвестный тип дороги.');
 if(!mask.size||mask.size*(foundation?2:1)>8192)throw Error('Слишком большая дорога. Раздели её на участки.');
 const output=[],base=new Map(),replaceIds=[];
 if(foundation)for(const k of mask.keys())base.set(k,roadValue('base','#737b85','base'));
 // Repack only previously generated, unchanged pieces intersecting this
 // operation. Preserve their entire footprints, including cells outside it.
 // Use the original incoming mask for the selection (no cascading deletion).
 const incoming=new Map(mask),incomingBase=new Map(base),oldSurface=new Map(),oldBase=new Map();
 for(const part of (autoJoin?roadParts:[])){
  if(!part||!['base','road','mark','walk'].includes(part.role)||!Number.isInteger(part.w)||!Number.isInteger(part.d)||part.w<1||part.d<1||part.w>32||part.d>32||!gridPoint({x:part.x,z:part.z})||!gridPoint({x:part.x+part.w-1,z:part.z+part.d-1}))continue;
  const isBase=part.role==='base';
  if(part.level!==(isBase?level:surfaceLevel)||isBase&&!foundation)continue;
  const keys=[];for(let dz=0;dz<part.d;dz++)for(let dx=0;dx<part.w;dx++)keys.push(cellKey(part.x+dx,part.z+dz));
  if(!keys.some(k=>(isBase?incomingBase:incoming).has(k)))continue;
  if(part.protected)throw Error('Дорога пересекает изменённую, закреплённую или связанную деталь. Освободи участок вручную.');
  replaceIds.push(part.id);
  for(const k of keys)(isBase?oldBase:oldSurface).set(k,roadValue(part.role,part.color,part.axis));
 }
 for(const [k,v] of oldSurface)mask.set(k,incoming.has(k)?mergeSurface(v,incoming.get(k)):v);
 for(const [k,v] of oldBase)if(!base.has(k))base.set(k,v);
 // Clear markings where independent road directions cross, even when both
 // source markings are white. The incoming asphalt colour takes precedence.
 for(const [k,v] of mask){const a=JSON.parse(v);if(a.axis==='joint')mask.set(k,roadValue('road',roadColor,'joint'))}
 function describe(type,y){const a=JSON.parse(type);return {color:a.color,road:{role:a.role,axis:a.axis,level:y}}}
 const remaining=existing-replaceIds.length;
 if(base.size)packMask(base,'plate',level,available,remaining,output,t=>describe(t,level));
 packMask(mask,'tile',surfaceLevel,available,remaining,output,t=>describe(t,surfaceLevel));
 output.replaceIds=replaceIds;
 return output;
}
export function planWorldTerrain(settings,start,end,existing=0){
 const {tool,level,terrainHeight=6,terrainStep=2,terrainSeed=1,color,available}=settings;
 if(!gridPoint(start)||!gridPoint(end)||!Number.isInteger(level)||level<0||!Number.isInteger(terrainHeight)||terrainHeight<1||terrainHeight>24||level+terrainHeight>120||!Number.isInteger(terrainStep)||terrainStep<1||terrainStep>8||!Number.isInteger(terrainSeed)||!/^#[0-9a-f]{6}$/i.test(color))throw Error('Проверь настройки рельефа.');
 const x0=Math.min(start.x,end.x),z0=Math.min(start.z,end.z),w=Math.abs(start.x-end.x)+1,d=Math.abs(start.z-end.z)+1;
 if(w>32||d>32)throw Error('Участок рельефа до 32 × 32 stud.');
 const heights=new Map();
 for(let z=0;z<d;z++)for(let x=0;x<w;x++){
  const u=w===1?0:x/(w-1),v=d===1?0:z/(d-1);
  const radial=Math.max(0,1-Math.hypot((u-.5)*2,(v-.5)*2));
  let h;
  if(tool==='terrainHill')h=Math.round(terrainHeight*radial);
  else if(tool==='terrainBasin')h=Math.round(terrainHeight*(1-radial));
  else if(tool==='terrainSlope'||tool==='terrainSteps'){
   const horizontal=w>=d,forward=horizontal?end.x>=start.x:end.z>=start.z,t=horizontal?u:v;
   h=Math.round(terrainHeight*(forward?t:1-t));
   if(tool==='terrainSteps')h=Math.floor(h/terrainStep)*terrainStep;
  }else if(tool==='terrainRough'){
   const noise=Math.sin((x+x0)*12.9898+(z+z0)*78.233+terrainSeed*19.19)*43758.5453;
   h=Math.floor((noise-Math.floor(noise))*(terrainHeight+1));
  }else throw Error('Неизвестный рельеф.');
  heights.set(cellKey(x+x0,z+z0),h);
 }
 if([...heights.values()].reduce((n,h)=>n+h,0)>8192)throw Error('Слишком большой объём рельефа. Раздели участок.');
 const output=[];
 // Solid terraced structure: courses of 3-plate bricks plus plates in
 // remaining heights. Each column has support from its own base.
 for(let y=0;y<terrainHeight;y+=3){
  const bricks=new Map([...heights].filter(([,h])=>h>=y+3).map(([k])=>[k,color]));
  if(bricks.size)packMask(bricks,'brick',level+y,available,existing,output,c=>({color:c}));
  for(let s=0;s<3;s++){
   const plates=new Map([...heights].filter(([,h])=>h>y+s&&h<y+3).map(([k])=>[k,color]));
   if(plates.size)packMask(plates,'plate',level+y+s,available,existing,output,c=>({color:c}));
  }
 }
 if(!output.length)throw Error('Увеличь область или высоту рельефа.');
 return output;
}
