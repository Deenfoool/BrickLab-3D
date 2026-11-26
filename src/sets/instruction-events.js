// Product analytics are best effort and must never interrupt building.
// Only a set ID and event are sent; no browser fingerprint or third-party tracking.
const sent=new Set()
export function instructionEvent(setId,event){
 if(typeof setId!=='string'||!/^\d{3,7}-\d{1,2}$/.test(setId))return
 const key=new Date().toISOString().slice(0,10)+'/'+setId+'/'+event
 if(sent.has(key))return
 if(sent.size>=500)sent.clear()
 sent.add(key)
 void fetch('/api/commerce/instruction-event',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({setId,event})}).then(r=>{if(!r.ok)sent.delete(key)}).catch(()=>sent.delete(key))
}
