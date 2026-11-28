// Page analysis is advisory: no page number is treated as an assembly step.
export const regionKey=r=>Array.isArray(r)?r.slice(0,4).join('/'):''
const validBox=b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>0&&b[3]>0&&b[0]>=0&&b[1]>=0&&b[0]+b[2]<=10000&&b[1]+b[3]<=10000
export const identityKey=(part,color)=>JSON.stringify([String(part),String(color)])
export const validRegion=r=>Array.isArray(r)&&validBox(r.slice(0,4))&&typeof r[4]==='string'&&r[4].length>0&&r[5]!=null
// Preserve server-provided identities when client callout bounds overlap them.
export function reconcileCallouts(callouts,authoritative){
 const result=new Map()
 for(const c of callouts){
  if(!validBox(c.region))continue
  const matches=authoritative.filter(validRegion).filter(r=>intersection(c.region,r.slice(0,4))>.5*Math.min(area(c.region),area(r.slice(0,4))))
  if(matches.length>1)continue
  const value=matches.length?{...c,region:matches[0].slice(0,4),repeat:null,readonly:true}:c
  const key=regionKey(value.region)
  if(!result.has(key))result.set(key,value)
  else{const old=result.get(key);result.set(key,{...old,quantity:null,step:null,repeat:null,readonly:old.readonly||value.readonly})}
 }
 return [...result.values()]
}
export function stepForCallout(box,steps){
 if(!validBox(box))return null
 const [x,y,w,h]=box
 const ranked=steps.filter(s=>validBox(s.box)&&Number.isInteger(s.number)&&s.number>0).flatMap(s=>{
  const [a,b,c,d]=s.box,dx=x-a,dy=y-(b+d)
  if(dy<-200||dy>2200||dx<-400||dx>4200)return []
  return [{number:s.number,score:Math.max(0,dy)*.65+Math.abs(dx)*.35}]
 }).sort((a,b)=>a.score-b.score)
 if(!ranked.length||ranked[1]&&ranked[1].number!==ranked[0].number&&ranked[1].score-ranked[0].score<220)return null
 return ranked[0].number
}
const intersection=(a,b)=>Math.max(0,Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]))
const area=b=>b[2]*b[3]
export function repeatedArtwork(box,objects,callouts){
 if(!validBox(box))return null
 const usable=objects.filter(o=>typeof o.id==='string'&&validBox(o.box))
 const sources=usable.filter(o=>intersection(box,o.box)/area(o.box)>.94&&intersection(box,o.box)/area(box)>.62)
 if(sources.length!==1)return null
 const source=sources[0]
 const targets=usable.filter(o=>o.id===source.id&&o!==source&&!callouts.some(c=>intersection(c,o.box)>0)&&
  Math.abs(Math.log((o.box[2]/o.box[3])/(source.box[2]/source.box[3])))<.12&&
  objects.some(container=>validBox(container.box)&&container!==o&&area(container.box)>area(o.box)*8&&intersection(container.box,o.box)/area(o.box)>.98))
 return targets.length===1?targets[0].box:null
}
export function pageCallouts(samples){
 return samples.filter(s=>validBox(s.region)).map(s=>({region:s.region.slice(0,4),quantity:Number.isInteger(s.quantity)&&s.quantity>0&&s.quantity<=999?s.quantity:null,kind:s.kind==='inventory'?'inventory':'callout',step:Number.isInteger(s.step)?s.step:null,repeat:validBox(s.repeat)?s.repeat:null}))
}
export function correctedRegions(regions,callouts,corrections,inventory){
 const allowed=new Set(inventory.filter(i=>!i.spare).map(i=>identityKey(i.partNum,i.colorId)))
 const result=new Map(regions.filter(validRegion).map(r=>[regionKey(r),r]))
 for(const c of callouts){
  if(c.readonly||!validBox(c.region))continue
  const key=regionKey(c.region),change=corrections[key]
  if(change?.ignore){result.delete(key);continue}
  if(change&&allowed.has(identityKey(change.partNum,change.colorId)))result.set(key,[...c.region,String(change.partNum),String(change.colorId)])
 }
 return [...result.values()]
}
export function pageRequirements(regions,callouts,inventoryUsage=[]){
 const byRegion=new Map(regions.filter(validRegion).map(r=>[regionKey(r),r]))
 const seen=new Set(),rows=new Map()
 const available=new Map()
 for(const i of inventoryUsage){
  if(i.spare)continue
  const key=identityKey(i.partNum,i.colorId),old=available.get(key)??{quantity:0,used:0}
  old.quantity+=i.quantity;old.used+=i.used??0;available.set(key,old)
 }
 function add(region,meta){
  const key=regionKey(region)
  if(seen.has(key))return
  seen.add(key)
  const recognized=byRegion.get(key),partNum=recognized?.[4],colorId=recognized?.[5]
  const group=partNum?identityKey(partNum,colorId):'unknown:'+key
  const id=JSON.stringify([meta?.kind??'unknown',meta?.step??null,group])
  let row=rows.get(id)
  if(!row){row={id,partNum,colorId,elementId:recognized?.[6],step:meta?.step??null,kind:meta?.kind??'unknown',quantity:0,unknownQuantity:false,regions:[],inventory:available.get(group)??null};rows.set(id,row)}
  if(row.elementId!==recognized?.[6])row.elementId=undefined
  if(Number.isInteger(meta?.quantity)&&meta.quantity>0)row.quantity+=meta.quantity
  else row.unknownQuantity=true
  row.regions.push({region:region.slice(0,4),repeat:meta?.repeat??null,editable:!!meta&&!meta.readonly})
 }
 for(const meta of callouts)if(validBox(meta.region))add(meta.region,meta)
 for(const region of regions)if(validRegion(region))add(region,null)
 return [...rows.values()]
}
export function loadCorrections(storage,scope){
 if(!scope)return Object.create(null)
 try{const data=JSON.parse(storage.getItem('bricklab.instruction.corrections.v1')??'{}');return Object.assign(Object.create(null),data[scope]??{})}catch{return Object.create(null)}
}
export function saveCorrections(storage,scope,values){
 if(!scope)return
 try{
  const data=JSON.parse(storage.getItem('bricklab.instruction.corrections.v1')??'{}')
  delete data[scope];data[scope]=Object.fromEntries(Object.entries(values).slice(-100))
  storage.setItem('bricklab.instruction.corrections.v1',JSON.stringify(Object.fromEntries(Object.entries(data).slice(-80))))
 }catch{/* Local settings may be unavailable. */}
}
