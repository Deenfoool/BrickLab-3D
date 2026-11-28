// Segmentation is performed on the rendered page, never on a catalog thumbnail.
// A bounded, conservative mask preserves holes and rejects ambiguous backgrounds.
export function silhouetteMask(rgba,w,h){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<6||h<6||w*h>65536||rgba.length!==w*h*4)return null
 const border=[]
 for(let x=0;x<w;x++){border.push(x);border.push((h-1)*w+x)}
 for(let y=1;y<h-1;y++){border.push(y*w);border.push(y*w+w-1)}
 const bins=new Map()
 for(const i of border){const p=i*4,k=[rgba[p]>>4,rgba[p+1]>>4,rgba[p+2]>>4].join(',');const a=bins.get(k)??[];a.push(i);bins.set(k,a)}
 const best=[...bins.values()].sort((a,b)=>b.length-a.length)[0]
 if(!best||best.length<border.length*.43)return null
 const bg=[0,1,2].map(c=>best.reduce((s,i)=>s+rgba[i*4+c],0)/best.length)
 const mask=new Uint8Array(w*h)
 let count=0
 for(let i=0;i<mask.length;i++){
  const p=i*4,d=Math.hypot(rgba[p]-bg[0],rgba[p+1]-bg[1],rgba[p+2]-bg[2])
  if(rgba[p+3]>100&&d>36){mask[i]=1;count++}
 }
 if(count<12||count>mask.length*.88)return null
 const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length)
 let largest=[]
 for(let i=0;i<mask.length;i++){
  if(!mask[i]||seen[i])continue
  let head=0,tail=1;seen[i]=1;queue[0]=i
  while(head<tail){
   const p=queue[head++],x=p%w,y=Math.floor(p/w)
   for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
    const n=yy*w+xx;if(mask[n]&&!seen[n]){seen[n]=1;queue[tail++]=n}
   }
  }
  if(tail>largest.length)largest=queue.slice(0,tail)
 }
 if(largest.length<count*.75)return null
 const result=new Uint8Array(mask.length)
 for(const i of largest)result[i]=1
 if(border.filter(i=>result[i]).length>border.length*.08)return null
 return result
}
// Row runs are emitted as closed vector paths. Adjacent runs share exact edges;
// the SVG fill rule preserves transparent holes without needing external assets.
export function maskPath(mask,w,h){
 let d=''
 for(let y=0;y<h;y++)for(let x=0;x<w;){
  if(!mask[y*w+x]){x++;continue}
  const a=x;while(x<w&&mask[y*w+x])x++
  d+='M'+a+' '+y+'h'+(x-a)+'v1h-'+(x-a)+'z'
 }
 return d
}
export function regionSilhouette(surface,region){
 const [x,y,w,h]=region
 const sw=surface.naturalWidth??surface.width,sh=surface.naturalHeight??surface.height
 if(!sw||!sh||w<=0||h<=0)return null
 const a=x*sw/10000,b=y*sh/10000,c=w*sw/10000,d=h*sh/10000
 if(c<6||d<6)return null
 const scale=Math.min(1,160/Math.max(c,d)),width=Math.max(6,Math.round(c*scale)),height=Math.max(6,Math.round(d*scale))
 try{
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const ctx=canvas.getContext('2d',{willReadFrequently:true})
  ctx.drawImage(surface,a,b,c,d,0,0,width,height)
  const mask=silhouetteMask(ctx.getImageData(0,0,width,height).data,width,height)
  return mask?{width,height,path:maskPath(mask,width,height)}:null
 }catch{return null} // Cross-origin preview images may forbid pixel reads.
}
