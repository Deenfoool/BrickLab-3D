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
