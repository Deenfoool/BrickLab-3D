// Do not accept an unrelated number from a PDF. A recovered exact Element ID
// must map to a part/color pair that actually exists in the selected set.
const key=(part,color)=>JSON.stringify([String(part),String(color)])
export function inventoryIdentity(inventory){
 const set=new Set(inventory.filter(item=>!item.spare).map(item=>key(item.partNum,item.colorId)))
 return record=>!!record&&set.has(key(record.partNum,record.colorId))
}
export function createElementRecovery(inventory,lookup,{budget=128,perPage=12}={}){
 const contains=inventoryIdentity(inventory),requests=new Map()
 return async function recover(words,labels,blocked,signal){
  const ids=[...new Set(words.map(w=>w.text).filter(id=>/^\d{6,8}$/.test(id)&&!Object.hasOwn(labels,id)&&!blocked.has(id)))].slice(0,perPage)
  for(let offset=0;offset<ids.length;offset+=4){
   signal.throwIfAborted()
   await Promise.all(ids.slice(offset,offset+4).map(async id=>{
    if(!requests.has(id)){
     if(requests.size>=budget)return
     requests.set(id,Promise.resolve().then(()=>lookup(id)).catch(()=>null))
    }
    const record=await requests.get(id)
    signal.throwIfAborted()
    if(record?.elementId===id&&contains(record))labels[id]=[String(record.partNum),String(record.colorId)]
   }))
  }
 }
}
