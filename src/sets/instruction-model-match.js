// Conservative geometry fallback. The PDF inventory remains authoritative.
export const MODEL_SIZE=24
export const MODEL_LIMIT=180
const side=MODEL_SIZE
const finiteColor=c=>typeof c==='string'&&/^#[a-f0-9]{6}$/i.test(c)
export function modelCandidates(inventory,resolve,limit=MODEL_LIMIT){
 const entries=new Map()
 for(const item of inventory){
  if(item.spare)continue
  if(typeof item.partNum!=='string'||item.colorId==null||!finiteColor(item.color))return null
  const key=JSON.stringify([item.partNum,String(item.colorId)])
  const model=resolve(item)
  if(!model?.design)return null // Missing competing geometry must not create artificial certainty.
  const row={key,item:[item.partNum,String(item.colorId)],model,color:item.color.toLowerCase()}
  const old=entries.get(key)
  if(old&&(old.model.design!==model.design||old.color!==row.color))return null
  entries.set(key,row)
  if(entries.size>limit)return null
 }
 return entries.size>=2?[...entries.values()]:null
}
export function normalizedModelImage(rgba,width,height){
 if(rgba.length!==width*height*4||width<1||height<1)return null
 let x0=width,y0=height,x1=-1,y1=-1,count=0
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>100){
  x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++
 }
 if(count<16||x0<=0||y0<=0||x1>=width-1||y1>=height-1)return null
 const w=x1-x0+1,h=y1-y0+1,pixels=new Uint8ClampedArray(side*side*4).fill(255)
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const p=(Math.min(y1,y0+Math.floor((y+.5)*h/side))*width+Math.min(x1,x0+Math.floor((x+.5)*w/side)))*4,q=(y*side+x)*4
  const alpha=rgba[p+3]/255
  for(let c=0;c<3;c++)pixels[q+c]=Math.round(255+(rgba[p+c]-255)*alpha)
 }
 return {pixels,aspect:Math.log(w/h)}
}
const ink=(p,i)=>Math.min(p[i],p[i+1],p[i+2])<215
export function modelDistance(sample,reference){
 if(!sample?.pixels||!reference?.pixels||sample.pixels.length!==side*side*4||reference.pixels.length!==side*side*4||!Number.isFinite(sample.aspect)||!Number.isFinite(reference.aspect))return Infinity
 const aspect=Math.abs(sample.aspect-reference.aspect)
 if(aspect>.29)return Infinity
 let union=0,intersection=0,delta=0,dr=0,dg=0,db=0
 for(let i=0;i<sample.pixels.length;i+=4){
  const a=ink(sample.pixels,i),b=ink(reference.pixels,i)
  if(a||b)union++
  if(a&&b){
   intersection++
   const x=sample.pixels,y=reference.pixels
   dr+=x[i]-y[i];dg+=x[i+1]-y[i+1];db+=x[i+2]-y[i+2]
   delta+=Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2])
  }
 }
 if(union<30||intersection<20)return Infinity
 const shape=1-intersection/union,appearance=delta/(intersection*765)
 const chroma=Math.max(Math.abs(dr-dg),Math.abs(dg-db),Math.abs(db-dr))/(255*intersection)
 if(shape>.24||appearance>.16||chroma>.085)return Infinity
 return shape*.5+appearance*.32+aspect*.18+chroma*.18
}
function rotate(view){
 const a=view.pixels,b=new Uint8ClampedArray(a.length)
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  const from=(y*side+x)*4,to=(x*side+side-1-y)*4
  b.set(a.subarray(from,from+4),to)
 }
 return {...view,pixels:b,aspect:-view.aspect}
}
export function rankModels({samples,references}){
 if(!references?.length)return []
 const identities=new Set(references.map(r=>JSON.stringify(r.item)))
 if(identities.size<2)return []
 return samples.flatMap(sample=>{
  if(sample.item?.[0]||!sample.pixels)return []
  const byKey=new Map()
  for(const reference of references){
   const key=JSON.stringify(reference.item)
   let view=reference,best=Infinity
   for(let i=0;i<4;i++){best=Math.min(best,modelDistance(sample,view)+i*.001);view=rotate(view)}
   if(best<(byKey.get(key)?.score??Infinity))byKey.set(key,{item:reference.item,score:best})
  }
  const [first,second]=[...byKey.values()].sort((a,b)=>a.score-b.score)
  if(!first||first.score>.10||(second?.score??Infinity)-first.score<.04)return []
  // Geometry identifies a part/color pair, never a printed LEGO Element ID.
  return [[...sample.region,...first.item]]
 })
}
