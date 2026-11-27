
export const STUD=20, PLATE=8;
export const WORLD_PARTS=Object.freeze({plate:Object.freeze({design:'3024',height:1}),brick:Object.freeze({design:'3005',height:3})});
export function planWorldFill({kind,x,z,width,depth,level,rows,color},existing=0){
 const part=Object.hasOwn(WORLD_PARTS,kind)?WORLD_PARTS[kind]:null;
 if(!part||!Number.isInteger(existing)||existing<0||![x,z,width,depth,level,rows].every(Number.isInteger)||x< -40||z< -40||x+width>41||z+depth>41||width<1||width>32||depth<1||depth>32||level<0||rows<1||rows>16||level+rows*part.height>120||!/^#[0-9a-f]{6}$/i.test(color))throw Error('Проверь размеры и координаты.');
 const count=width*depth*rows;
 if(count>256||existing+count>3000)throw Error('До 256 деталей за операцию, до 3000 в мире.');
 const cells=[];
 for(let h=0;h<rows;h++)for(let dz=0;dz<depth;dz++)for(let dx=0;dx<width;dx++)cells.push({design:part.design,x:(x+dx)*STUD,z:(z+dz)*STUD,y:(level+h*part.height)*PLATE,color});
 return cells;
}

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
