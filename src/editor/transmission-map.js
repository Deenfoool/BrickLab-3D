// Classify actual solver outputs, not inferred links or physical torque.
export const transmissionColors=Object.freeze({positive:0x36d399,negative:0x60a5fa,nonlinear:0xc084fc,moving:0xf4b95e,issue:0xff6666})
export const transmissionCodes=Object.freeze({positive:.2,negative:.35,nonlinear:.65,moving:.8,issue:.5})
export function transmissionMap(motion,driver,poses=[],baseParts=[]){
 const categories=new Map()
 if(!motion?.ok)return categories
 const base=new Map(baseParts.map(p=>[p.id,p]))
 for(const [id,spin] of motion.spins??motion.rotation?.spins??[]){
  if(id===driver)continue
  if(typeof spin.angleAt==='function')categories.set(id,'nonlinear')
  else if(Number.isFinite(spin.ratio)&&Math.abs(spin.ratio)>1e-9)categories.set(id,spin.ratio>0?'positive':'negative')
 }
 for(const id of motion.cardans?.keys()??[])if(id!==driver&&!categories.has(id))categories.set(id,'nonlinear')
 // Other mechanism poses (e.g. pistons, steering links) count only when the
 // sampled pose actually differs from the stored rest pose.
 for(const p of poses){
  if(p.id===driver||categories.has(p.id))continue
  const b=base.get(p.id)
  if(!b)continue
  const changed=p.position?.some((v,i)=>Math.abs(v-b.position[i])>1e-5)||
    (p.rotation?.length===4&&b.rotation?.length===4&&Math.abs(p.rotation.reduce((s,v,i)=>s+v*b.rotation[i],0))<1-1e-7)
  if(changed)categories.set(p.id,'moving')
 }
 return categories
}
export function mountTransmissionMap(root,{language,signal,onChange,onFocus}){
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n}
 const toggle=el('button',tr('Карта передачи','Transmission map')),legend=el('div',undefined,'editor-transmission-legend'),summary=el('p',undefined,'editor-transmission-note')
 toggle.type='button';toggle.setAttribute('aria-pressed','false')
 const names={positive:tr('Положительное отношение','Positive ratio'),negative:tr('Отрицательное отношение','Negative ratio'),nonlinear:tr('Нелинейная передача','Nonlinear drive'),moving:tr('Подвижные звенья','Moving links')}
 let enabled=false,last=new Map()
 const rows=new Map()
 for(const [key,label] of Object.entries(names)){
  const b=el('button',undefined,'editor-transmission-row'),dot=el('span',undefined,'editor-transmission-dot'),text=el('span',label),count=el('strong','0')
  dot.style.backgroundColor='#'+transmissionColors[key].toString(16).padStart(6,'0');b.type='button';b.append(dot,text,count);b.disabled=true
  b.addEventListener('click',()=>onFocus([...last].filter(([,v])=>v===key).map(([id])=>id)),{signal})
  legend.append(b);rows.set(key,{b,count})
 }
 summary.textContent=tr('Знак отношения зависит от локальной оси детали. Карта не измеряет нагрузку и крутящий момент.','Ratio sign depends on the local part axis. This map does not measure loads or torque.')
 root.append(toggle,legend,summary)
 legend.hidden=summary.hidden=true
 toggle.addEventListener('click',()=>{enabled=!enabled;toggle.setAttribute('aria-pressed',String(enabled));legend.hidden=summary.hidden=!enabled;onChange(enabled)},{signal})
 return {get enabled(){return enabled},render(categories,available){
  root.hidden=!available
  last=categories
  for(const [key,{b,count}] of rows){const n=[...categories.values()].filter(v=>v===key).length;count.textContent=String(n);b.disabled=!n}
 },clear(){last=new Map();enabled=false;toggle.setAttribute('aria-pressed','false');legend.hidden=summary.hidden=true}}
}
