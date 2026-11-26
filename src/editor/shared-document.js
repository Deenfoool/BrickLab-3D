// Shared fields only. Per-record compare-and-swap; disjoint edits commute.
const keys={parts:p=>p.id,connections:p=>JSON.stringify([p.shaft?.part,p.shaft?.port,p.socket?.part,p.socket?.port]),belts:p=>p.id,gears:p=>p.part}
const fields=['name','sceneLayers','testDrive']
const canonical=v=>v===undefined?'undefined':v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}'
export const equal=(a,b)=>canonical(a)===canonical(b)
function mapOf(field,items){if(!Array.isArray(items))throw Error('invalid_shared_records');const m=new Map();for(const item of items){if(!item||typeof item!=='object')throw Error('invalid_shared_records');const key=keys[field](item);if(typeof key!=='string'||!key||key.length>500||m.has(key))throw Error('invalid_shared_records');m.set(key,item)}return m}
export function sharedDelta(before,after){
 const operations=[]
 for(const field of Object.keys(keys)){
  const a=mapOf(field,before[field]??[]),b=mapOf(field,after[field]??[])
  for(const key of new Set([...a.keys(),...b.keys()])){const old=a.get(key)??null,value=b.get(key)??null;if(!equal(old,value))operations.push({field,key,old,value})}
 }
 for(const field of fields){const old=before[field]??null,value=after[field]??null;if(!equal(old,value))operations.push({field,old,value})}
 return operations
}
export function mergeShared(document,operations){
 if(!Array.isArray(operations)||operations.length>10000)throw Error('too_many_changes')
 const next={...document},maps=new Map(),seen=new Set()
 for(const op of operations){
  if(!op||typeof op.field!=='string'||!Object.hasOwn(op,'old')||!Object.hasOwn(op,'value'))throw Error('invalid_change')
  const {field,key,old,value}=op,id=JSON.stringify([field,key??null]);if(seen.has(id))throw Error('invalid_change');seen.add(id)
  if(Object.hasOwn(keys,field)){
   if(typeof key!=='string'||!key||key.length>500)throw Error('invalid_change')
   if(!maps.has(field))maps.set(field,mapOf(field,document[field]??[]))
   const m=maps.get(field),current=m.get(key)??null
   if(!equal(current,old)&&!equal(current,value))throw Error('edit_conflict')
   if(value===null)m.delete(key)
   else{if(!value||typeof value!=='object'||keys[field](value)!==key)throw Error('invalid_change');m.set(key,value)}
  }else if(fields.includes(field)&&key===undefined){
   if(!equal(document[field]??null,old)&&!equal(document[field]??null,value))throw Error('edit_conflict')
   if(value===null)delete next[field];else next[field]=value
  }else throw Error('invalid_change')
 }
 for(const [field,m] of maps)next[field]=[...m.values()]
 validateShared(next);return next
}
export function validateShared(doc){
 if(doc.parts.length>2000||doc.connections.length>6000||(doc.belts??[]).length>100)throw Error('room_model_limit')
 const parts=mapOf('parts',doc.parts),links=mapOf('connections',doc.connections),belts=mapOf('belts',doc.belts??[]),gears=mapOf('gears',doc.gears??[])
 const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<1e7)
 for(const p of parts.values())if(typeof p.design!=='string'||p.design.length>80||!vector(p.position,3)||!vector(p.rotation,4)||p.rotation.every(x=>x===0))throw Error('invalid_part')
 for(const l of links.values())if(!parts.has(l.shaft?.part)||!parts.has(l.socket?.part)||typeof l.shaft?.port!=='string'||typeof l.socket?.port!=='string')throw Error('edit_conflict')
 for(const b of belts.values())if(!parts.has(b.a?.part)||!parts.has(b.b?.part))throw Error('edit_conflict')
 for(const g of gears.values())if(!parts.has(g.part))throw Error('edit_conflict')
 return doc
}
