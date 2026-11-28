// Independent, conservative matching of cleaned composited artwork.
// Pixels are RGBA on white; retain aspect ratio and neutral shade evidence.
export const CLEAN_SIZE=40
export function cleanComponent(rgba,w,h){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||w*h>400000||rgba.length!==w*h*4)return null
 const mask=new Uint8Array(w*h),queue=new Int32Array(w*h)
 for(let i=0;i<mask.length;i++)mask[i]=Number(rgba[i*4+3]>0)
 const groups=[]
 for(let start=0;start<mask.length;start++){
  if(!mask[start])continue
  let head=0,tail=1;queue[0]=start;mask[start]=0
  let x0=w,y0=h,x1=-1,y1=-1
  while(head<tail){
   const p=queue[head++],x=p%w,y=Math.floor(p/w)
   x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)
   for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
    const n=yy*w+xx;if(mask[n]){mask[n]=0;queue[tail++]=n}
   }
  }
  if(tail>=2)groups.push({positions:queue.slice(0,tail),box:[x0,y0,x1,y1]})
 }
 groups.sort((a,b)=>b.positions.length-a.positions.length)
 const first=groups[0]
 if(!first||first.positions.length<12||groups[1]?.positions.length>first.positions.length*.4)return null
 const [x0,y0,x1,y1]=first.box
 const output=new Uint8ClampedArray(rgba.length)
 for(const group of groups){
  const [a,b,c,d]=group.box
  if(group!==first&&(a<x0||b<y0||c>x1||d>y1))continue
  for(const p of group.positions)output.set(rgba.subarray(p*4,p*4+4),p*4)
 }
 return {pixels:output,box:[x0,y0,x1+1,y1+1]}
}
const median=values=>{values.sort((a,b)=>a-b);const i=Math.floor(values.length/2);return values.length%2?values[i]:(values[i-1]+values[i])/2}
function describe(p){
 const ink=[[],[],[]],chroma=[[],[],[]]
 let count=0
 for(let i=0;i<p.length;i+=4){
  const a=p[i]/255,b=p[i+1]/255,c=p[i+2]/255
  if(Math.min(a,b,c)>=.82)continue
  count++;ink[0].push(a);ink[1].push(b);ink[2].push(c)
  if(Math.max(a,b,c)-Math.min(a,b,c)>.16){const m=(a+b+c)/3;chroma[0].push(a-m);chroma[1].push(b-m);chroma[2].push(c-m)}
 }
 return count>10?{tone:ink.map(median),chroma:chroma[0].length>=Math.max(3,.2*count)?chroma.map(median):[0,0,0]}:null
}
const delta=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])))
function metrics(a,b,da,db){
 if(!a?.pixels||!b?.pixels||a.pixels.length!==b.pixels.length||!Number.isFinite(a.aspect)||!Number.isFinite(b.aspect)||!da||!db)return null
 let union=0,both=0,ink=0,pixel=0
 for(let i=0;i<a.pixels.length;i+=4){
  const aa=Math.min(a.pixels[i],a.pixels[i+1],a.pixels[i+2])<214,bb=Math.min(b.pixels[i],b.pixels[i+1],b.pixels[i+2])<214
  const difference=(Math.abs(a.pixels[i]-b.pixels[i])+Math.abs(a.pixels[i+1]-b.pixels[i+1])+Math.abs(a.pixels[i+2]-b.pixels[i+2]))/(3*255)
  pixel+=difference
  if(aa||bb)union++
  if(aa&&bb){both++;ink+=difference}
 }
 if(union<20||both<15)return null
 const ratio=Math.abs(a.aspect-b.aspect),shape=1-both/union,tone=delta(da.tone,db.tone),chroma=delta(da.chroma,db.chroma)
 return {pixel:pixel/(a.pixels.length/4)+.18*ratio,shape,tone,chroma,ratio,score:.34*shape+.26*ink/both+.16*chroma+.14*tone+.10*ratio}
}
const key=item=>JSON.stringify([item[0],String(item[1])])
export function prepareCleanReferences(templates){
 return templates.filter(t=>t.item?.[0]&&t.clean?.pixels?.length===CLEAN_SIZE*CLEAN_SIZE*4).map(t=>({reference:t,description:describe(t.clean.pixels)}))
}
export function cleanMatch(sample,templates,rawScores){
 if(sample.clean?.pixels?.length!==CLEAN_SIZE*CLEAN_SIZE*4)return
 const desc=describe(sample.clean.pixels),best=new Map()
 for(const {reference,description} of templates){
  const f=metrics(sample.clean,reference.clean,desc,description)
  if(!f)continue
  const k=key(reference.item),old=best.get(k)
  if(!old||f.score<old.score)best.set(k,{...f,k,item:reference.item})
 }
 const [a,b]=[...best.values()].sort((x,y)=>x.score-y.score)
 if(!a||!b||a.score>.17||b.score-a.score<.027||a.pixel>.10||a.shape>.30||a.chroma>.12||a.tone>.19||a.ratio>.26)return
 const raw=new Map()
 for(const {reference,score} of rawScores){
  if(!reference.item?.[0]||!Number.isFinite(score))continue
  const k=key(reference.item);raw.set(k,Math.min(raw.get(k)??Infinity,score))
 }
 const ordered=[...raw].sort((x,y)=>x[1]-y[1])
 if(ordered.length<2||!ordered.slice(0,3).some(([k])=>k===a.k)||raw.get(a.k)-ordered[0][1]>.035)return
 return a.item
}
