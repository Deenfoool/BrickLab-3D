
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
