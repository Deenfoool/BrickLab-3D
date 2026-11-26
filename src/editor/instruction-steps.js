export const MAX_INSTRUCTION_STEPS=100
export function normalizeSteps(value,parts){
 const valid=new Set(parts.map(p=>p.id)),seen=new Set(),steps=[]
 for(const raw of Array.isArray(value)?value.slice(0,MAX_INSTRUCTION_STEPS):[]){const ids=(Array.isArray(raw?.ids)?raw.ids:[]).filter(id=>valid.has(id)&&!seen.has(id)&&(seen.add(id),true));if(ids.length)steps.push({ids,note:String(raw.note??'').slice(0,400),angle:['iso','front','rear','left','side','top'].includes(raw.angle)?raw.angle:'iso'})}
 const rest=parts.filter(p=>!seen.has(p.id)).map(p=>p.id);if(rest.length){if(steps.length>=MAX_INSTRUCTION_STEPS)steps.at(-1).ids.push(...rest);else steps.push({ids:rest,note:'',angle:'iso'})}
 return steps
}
// Propose ordered, editable steps. Prefer supported low parts and neighbors of
// the installed model; never add a part twice or invent a connection.
export function generateInstructionSteps(build,requested=4){
 const parts=[...new Map(build.parts.map(p=>[p.id,p])).values()]
 if(!parts.length)return []
 const size=Math.max(Math.ceil(parts.length/MAX_INSTRUCTION_STEPS),Math.min(20,Math.max(1,Math.floor(Number(requested)||4))))
 const byId=new Map(parts.map(p=>[p.id,p])),neighbors=new Map(parts.map(p=>[p.id,new Set()])),installed=new Set(),out=[]
 for(const link of build.connections??[]){const a=link.shaft?.part,b=link.socket?.part;if(a!==b&&neighbors.has(a)&&neighbors.has(b)){neighbors.get(a).add(b);neighbors.get(b).add(a)}}
 const coord=(p,i)=>Number.isFinite(p.position?.[i])?p.position[i]:0
 const stable=(a,b)=>coord(a,1)-coord(b,1)||coord(a,2)-coord(b,2)||coord(a,0)-coord(b,0)||(a.id<b.id?-1:a.id>b.id?1:0)
 const ordered=parts.slice().sort(stable),rank=new Map(ordered.map((p,i)=>[p.id,i])),frontier=new Set()
 let seed=0,previous=null
 while(installed.size<parts.length){
  const ids=[]
  while(ids.length<size&&installed.size<parts.length){
   let id,best=Infinity
   for(const candidate of frontier){if(installed.has(candidate))continue;const p=byId.get(candidate),distance=previous?Math.hypot(...[0,1,2].map(i=>coord(p,i)-coord(previous,i))):0
    // Prefer nearer connected pieces; spatial rank makes ties deterministic.
    const score=distance;if(id===undefined||score<best||score===best&&rank.get(candidate)<rank.get(id)){id=candidate;best=score}}
   if(id===undefined){while(installed.has(ordered[seed]?.id))seed++;id=ordered[seed++].id}
   installed.add(id);frontier.delete(id);ids.push(id);previous=byId.get(id)
   for(const n of neighbors.get(id))if(!installed.has(n))frontier.add(n)
  }
  out.push({ids,note:'',angle:'iso'})
 }
 // Avoid the former single-page default for any multi-part build, including tiny models.
 if(out.length===1&&parts.length>1){const first=out[0].ids.shift();out.unshift({ids:[first],note:'',angle:'iso'})}
 return out
}
export function initialInstructionSteps(build){
 const stored=Array.isArray(build.customInstructions)?build.customInstructions:[]
 // Previous releases persisted a single unedited, all-parts placeholder.
 const normalized=normalizeSteps(stored,build.parts)
 const legacy=stored.length===1&&normalized.length===1&&normalized[0].ids.length===build.parts.length&&!normalized[0].note&&normalized[0].angle==='iso'
 return !stored.length||legacy?generateInstructionSteps(build):normalized
}
