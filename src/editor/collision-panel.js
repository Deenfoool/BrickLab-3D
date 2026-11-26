// User-triggered checks only. Results describe sampled poses, not a continuous sweep.
export function mountCollisionPanel(root,{language,signal,onScan,onLocate,onClear}){
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
 const current=el('button',tr('Проверить положение','Check current pose')),range=el('button',tr('Проверить диапазон (до 9)','Sample range (up to 9)')),clear=el('button',tr('Сбросить','Clear'))
 const buttons=el('div',undefined,'editor-collision-actions'),status=el('p',undefined,'editor-transmission-note'),list=el('div',undefined,'editor-collision-results')
 const note=el('p',tr('Поиск пересечений поверхностей видимых деталей. Штатные соединения исключены; касания и полное вложение могут не обнаруживаться.','Surface crossings of visible parts. Mating pairs are excluded; touching and complete containment may be missed.'),'editor-transmission-note')
 let controller=null,enabled=false,canRange=false
 for(const b of [current,range,clear])b.type='button'
 status.setAttribute('role','status')
 buttons.append(current,range,clear);root.append(el('strong',tr('Проверка коллизий','Collision inspection')),buttons,note,status,list)
 function controls(){current.disabled=!enabled||!!controller;range.disabled=!enabled||!canRange||!!controller;clear.disabled=!controller&&!list.childElementCount&&!status.textContent}
 function reset(){if(!controller&&!list.childElementCount&&!status.textContent)return;controller?.abort();controller=null;list.replaceChildren();status.textContent='';onClear();controls()}
 async function run(sweep){
  reset()
  const request=new AbortController();controller=request;controls()
  const linked=AbortSignal.any([signal,request.signal])
  try{
   const result=await onScan(sweep,linked,(i,n)=>{if(!linked.aborted)status.textContent=tr('Проверяем положение ','Checking pose ')+i+'/'+n})
   if(linked.aborted)return
   const limited=result.samples.length===0||result.samples.some(s=>s.limited||s.unavailable||s.unsolved)
   const hits=result.samples.flatMap(s=>s.pairs.map(p=>({...p,value:s.value})))
   const unique=new Set(hits.map(p=>JSON.stringify([p.a,p.b].sort())))
   const checked=result.samples.reduce((n,s)=>n+s.checked,0),excluded=result.samples.reduce((n,s)=>n+s.excluded,0)
   status.textContent=(hits.length?tr('Подозрительные пары: ','Suspect pairs: ')+unique.size:tr('В проверенных парах пересечений не найдено.','No crossings found in checked pairs.'))+' '+tr('Проверок пар: ','Pair checks: ')+checked+'. '+tr('Исключено штатных пар: ','Mating pairs skipped: ')+excluded+'.'
   if(limited)status.textContent+=' '+tr('Проверка неполная: лимит, отсутствующая геометрия или нерассчитанное положение.','Incomplete inspection: budget, missing geometry or unsolved pose.')
   for(const p of hits.slice(0,100)){
    const a=el('button',(p.value.toFixed(1)+(result.linear?' LDU':'°'))+' · '+p.a+' ↔ '+p.b);a.type='button'
    a.onclick=()=>{if(!signal.aborted)onLocate(p)}
    list.append(a)
   }
   if(hits.length>100)list.append(el('p',tr('Показаны первые 100 результатов.','Showing first 100 results.')))
   if(hits.length)onLocate(hits[0])
  }catch(e){if(!linked.aborted)status.textContent=tr('Не удалось проверить геометрию.','Geometry inspection failed.')}
  finally{if(controller===request){controller=null;controls()}}
 }
 current.onclick=()=>void run(false);range.onclick=()=>void run(true);clear.onclick=reset
 signal.addEventListener('abort',()=>controller?.abort(),{once:true})
 return {reset,render(available,sweep){enabled=available;canRange=sweep;root.hidden=!available;controls()}}
}
