export function normalizeSteps(value,parts){
 const valid=new Set(parts.map(p=>p.id)),seen=new Set(),steps=[]
 for(const raw of Array.isArray(value)?value.slice(0,100):[]){const ids=(Array.isArray(raw?.ids)?raw.ids:[]).filter(id=>valid.has(id)&&!seen.has(id)&&(seen.add(id),true));if(ids.length)steps.push({ids,note:String(raw.note??'').slice(0,400),angle:['iso','front','rear','left','side','top'].includes(raw.angle)?raw.angle:'iso'})}
 const rest=parts.filter(p=>!seen.has(p.id)).map(p=>p.id);if(rest.length){if(steps.length>=100)steps.at(-1).ids.push(...rest);else steps.push({ids:rest,note:'',angle:'iso'})}
 return steps
}
