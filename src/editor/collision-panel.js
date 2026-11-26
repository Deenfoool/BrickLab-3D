// User-triggered checks only. Results describe sampled poses, not a continuous sweep.
export function mountCollisionPanel(root,{language,signal,onScan,onLocate,onClear,onReport}){
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
 const current=el('button',tr('Проверить положение','Check current pose')),range=el('button',tr('Проверить диапазон','Sample range')),clear=el('button',tr('Сбросить','Clear'))
 const strictLabel=el('label'),strict=el('input');strict.type='checkbox';strictLabel.append(strict,el('span',tr('Включить штатные соединения (возможны ложные срабатывания)','Include mating pairs (false positives possible)')))
 const density=el('select');density.setAttribute('aria-label',tr('Число контрольных положений','Sample count'));for(const n of [9,17,25])density.append(new Option(String(n),String(n)))
 const buttons=el('div',undefined,'editor-collision-actions'),status=el('p',undefined,'editor-transmission-note'),list=el('div',undefined,'editor-collision-results')
 const note=el('p',tr('Поиск пересечений поверхностей видимых деталей. По умолчанию штатные пары исключены; касания и полное вложение могут не обнаруживаться.','Surface crossings of visible parts. Mating pairs are excluded by default; touching and complete containment may be missed.'),'editor-transmission-note')
 let controller=null,enabled=false,canRange=false
 for(const b of [current,range,clear])b.type='button'
 status.setAttribute('role','status')
 buttons.append(current,density,range,clear);root.append(el('strong',tr('Проверка коллизий','Collision inspection')),buttons,strictLabel,note,status,list)
 function controls(){current.disabled=!enabled||!!controller;strict.disabled=!!controller;range.disabled=density.disabled=!enabled||!canRange||!!controller;clear.disabled=!controller&&!list.childElementCount&&!status.textContent}
 function reset(){if(!controller&&!list.childElementCount&&!status.textContent)return;controller?.abort();controller=null;list.replaceChildren();status.textContent='';onClear();onReport(null);controls()}
 async function run(sweep){
  reset()
  const request=new AbortController();controller=request;controls()
  const linked=AbortSignal.any([signal,request.signal])
  try{
   const result=await onScan(sweep?Number(density.value):1,strict.checked,linked,(i,n)=>{if(!linked.aborted)status.textContent=tr('Проверяем положение ','Checking pose ')+i+'/'+n})
   if(linked.aborted)return
   onReport(result)
   const limited=result.truncated||result.samples.length===0||result.samples.some(s=>s.limited||s.unavailable||s.unsolved)
   const hits=result.samples.flatMap(s=>s.pairs.map(p=>({...p,value:s.value})))
   const unique=new Set(hits.map(p=>JSON.stringify([p.a,p.b].sort())))
   const checked=result.samples.reduce((n,s)=>n+s.checked,0),excluded=result.samples.reduce((n,s)=>n+s.excluded,0)
   status.textContent=(hits.length?tr('Подозрительные пары: ','Suspect pairs: ')+unique.size:tr('В проверенных парах пересечений не найдено.','No crossings found in checked pairs.'))+' '+tr('Проверок пар: ','Pair checks: ')+checked+'. '+tr('Исключено штатных пар: ','Mating pairs skipped: ')+excluded+'.'
   status.textContent+=' '+tr('Положения: ','Poses: ')+result.samples.length+'/'+result.requested+'.'
   if(limited)status.textContent+=' '+tr('Проверка неполная: лимит, отсутствующая геометрия или нерассчитанное положение.','Incomplete inspection: budget, missing geometry or unsolved pose.')
   for(const p of hits.slice(0,100)){
    const a=el('button',(p.value.toFixed(1)+(result.linear?' LDU':'°'))+' · '+(p.kind==='coincident'?tr('Совпадающие детали','Coincident parts'):p.mated?tr('Штатная пара','Mating pair'):tr('Пересечение','Crossing'))+' · '+p.a+' ↔ '+p.b);a.type='button'
    a.onclick=()=>{if(!signal.aborted)onLocate(p)}
    list.append(a)
   }
   if(hits.length>100)list.append(el('p',tr('Показаны первые 100 результатов.','Showing first 100 results.')))
   if(hits.length)onLocate(hits[0])
  }catch(e){if(!linked.aborted)status.textContent=tr('Не удалось проверить геометрию.','Geometry inspection failed.')}
  finally{if(controller===request){controller=null;controls()}}
 }
 strict.onchange=reset;density.onchange=reset;current.onclick=()=>void run(false);range.onclick=()=>void run(true);clear.onclick=reset
 signal.addEventListener('abort',()=>controller?.abort(),{once:true})
 return {reset,render(available,sweep){enabled=available;canRange=sweep;root.hidden=!available;controls()}}
}
