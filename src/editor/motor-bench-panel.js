import {controlPlusBodies} from '../mechanics/motors.js'
export function mountMotorBench(root,{language,signal,onRun,onReport}){
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n}
 const details=el('details'),head=el('summary',tr('Стенд двигателя (эксперимент)','Motor bench (experimental)')),note=el('p',tr('Изолированный расчёт Rapier: корпус выбранного мотора закреплён, гравитация выключена. Нативные шарниры и муфты; шестерни, ремни и гусеницы не передают момент на этом стенде. Масса и масштаб условные.','Detached Rapier experiment: motor housing pinned, gravity off. Native joints and clutches only; gear, belt and track torque transfer is not simulated here. Mass and scale are approximate.'),'editor-transmission-note')
 const duration=el('select');duration.setAttribute('aria-label',tr('Длительность симуляции','Simulation duration'))
 for(const n of [1,3,5])duration.append(new Option(n+' '+tr('с','s'),String(n)));duration.value='3'
 const run=el('button',tr('Запустить стенд','Run bench')),stop=el('button',tr('Отменить','Cancel')),status=el('p',undefined,'editor-transmission-note'),output=el('div',undefined,'editor-bench-results')
 const actions=el('div',undefined,'editor-collision-actions');run.type=stop.type='button';status.setAttribute('role','status')
 actions.append(duration,run,stop);details.append(head,note,actions,status,output);root.append(details)
 let active=null,motor=null
 function controls(){run.disabled=!motor||!!active;stop.disabled=!active;duration.disabled=!!active}
 function clear(){active?.abort();active=null;output.replaceChildren();status.textContent='';onReport(null);controls()}
 run.addEventListener('click',async()=>{
  if(!motor||active)return
  clear()
  const request=new AbortController(),linked=AbortSignal.any([request.signal,signal]);active=request;controls()
  try{
   const r=await onRun(motor,Number(duration.value),linked,(i,n)=>{if(!linked.aborted)status.textContent=tr('Расчёт: ','Simulation: ')+Math.round(i/n*100)+'%'})
   if(linked.aborted)return
   onReport(r)
   status.textContent=r.complete?tr('Эксперимент завершён.','Experiment completed.'):tr('Достигнут лимит времени. Частичные результаты.','Time budget reached. Partial results.')
   const d=r.diagnostics
   output.append(el('p',tr('Тел: ','Bodies: ')+d.bodies+' · '+tr('Ограничений: ','Constraints: ')+d.constraints+' · '+tr('Неподдерживаемых: ','Unsupported: ')+d.unsupported))
   const table=el('table'),head=el('thead'),row=el('tr')
   for(const title of [tr('Время, с','Time, s'),tr('об/мин','rpm'),'N·m',tr('Статус','State')])row.append(el('th',title))
   head.append(row);table.append(head);const body=el('tbody')
   for(const s of r.samples){const trr=el('tr');for(const value of [s.time.toFixed(1),s.rpm.toFixed(1),s.torque.toFixed(3),!s.powered?tr('Нет питания','Unpowered'):s.stalled?tr('Почти неподвижен','Near zero speed'):tr('Движение','Motion')])trr.append(el('td',value));body.append(trr)}
   table.append(body);output.append(table)
  }catch{if(!linked.aborted)status.textContent=tr('Стенд недоступен: проверь выход мотора, число деталей (до 400) и загрузку Rapier.','Bench unavailable: check motor output, model size (up to 400 parts), and Rapier loading.')}
  finally{if(active===request){active=null;controls()}}
 },{signal})
 stop.addEventListener('click',clear,{signal});signal.addEventListener('abort',()=>active?.abort(),{once:true})
 return {clear,render(part,available){const next=available&&controlPlusBodies.has(part?.design)?part.id:null;root.hidden=!next;if(next!==motor){motor=next;clear()}controls()}}
}
