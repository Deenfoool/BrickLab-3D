import {driveOutputs,estimateDrive,sourceFromMotion} from '../mechanics/drive-estimate.js'
export function mountDriveEstimate(root,{language,signal,onFocus,onReport}){
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
 const details=el('details'),summary=el('summary',tr('Скорость, момент и нагрузка','Speed, torque and load')),form=el('div',undefined,'editor-drive-estimate-form'),result=el('div',undefined,'editor-drive-estimate-result'),note=el('p',tr('Приближённая стационарная модель одного привода. КПД и сопротивление задаются вручную; не учитываются инерция, прочность, сцепление и динамика. Момент остановки не является допустимой длительной нагрузкой.','Approximate steady-state single-drive model. Efficiency and resistance are user assumptions; inertia, strength, traction and dynamics are excluded. Stall torque is not a continuous rating.'),'editor-transmission-note')
 let motion=null,outputs=[],names=new Map(),rows=[],last=null
 const field=(label,value,min,max,step)=>{const wrap=el('label',label),input=el('input');input.type='number';input.value=value;input.min=min;input.max=max;input.step=step;wrap.append(input);return {wrap,input}}
 const rpm=field(tr('Обороты входа, об/мин','Input no-load rpm'),100,-100000,100000,1),torque=field(tr('Момент остановки, Н·м','Input stall torque, N·m'),.18,0,10000,.01),eff=field(tr('Общий КПД, %','Overall efficiency, %'),85,1,100,1)
 const source=el('p',undefined,'editor-transmission-note'),loadList=el('div',undefined,'editor-drive-loads')
 const button=(txt,fn)=>{const b=el('button',txt);b.type='button';b.addEventListener('click',fn,{signal});return b}
 const invalidate=()=>{if(last){last=null;onReport(null);result.replaceChildren(el('p',tr('Параметры изменены. Нажми «Рассчитать».','Parameters changed. Calculate again.')))}}
 form.addEventListener('input',invalidate,{signal});form.addEventListener('change',invalidate,{signal})
 const add=button(tr('Добавить нагрузку','Add load'),()=>{if(rows.length<8){addRow();calculate()}})
 const calc=button(tr('Рассчитать','Calculate'),calculate)
 function addRow(){
  const wrap=el('div',undefined,'editor-drive-load-row'),select=el('select'),value=field(tr('Сопротивление, Н·м','Resistance, N·m'),.02,0,10000,.01)
  select.setAttribute('aria-label',tr('Выходная деталь','Output part'))
  select.append(new Option(tr('Выбери выход','Choose output'),''))
  for(const p of outputs)select.append(new Option(names.get(p.id)??p.id,p.id))
  const row={wrap,select,value:value.input}
  const remove=button('×',()=>{rows=rows.filter(r=>r!==row);wrap.remove();calculate()})
  remove.setAttribute('aria-label',tr('Удалить нагрузку','Remove load'));wrap.append(select,value.wrap,remove);loadList.append(wrap);rows.push(row)
 }
 function calculate(){
  result.replaceChildren();last=null;onReport(null)
  try{
   if(!motion||!outputs.length)return
   if(!eff.input.checkValidity()||(!rpm.input.disabled&&(!rpm.input.checkValidity()||!torque.input.checkValidity())))throw Error('invalid_input')
   const motor=sourceFromMotion(motion),input=motor??{rpm:rpm.input.valueAsNumber,stallTorque:torque.input.valueAsNumber,kind:'manual'}
   const loads=rows.filter(r=>r.select.value).map(r=>{if(!r.value.checkValidity())throw Error('invalid_load');return {id:r.select.value,torque:r.value.valueAsNumber}})
   last=estimateDrive({source:input,outputs,loads,efficiency:eff.input.valueAsNumber/100})
   onReport({...last,source:input})
   const fmt=(n,d=2)=>Number.isFinite(n)?n.toFixed(d):'—'
   const state=el('strong',!last.sourceAvailable?tr('Привод не выдаёт движение','Source cannot drive'):last.stalled?tr('Расчётная остановка под нагрузкой','Estimated stall'):tr('Расчётное движение','Estimated motion'))
   state.className=last.stalled||!last.sourceAvailable?'editor-drive-warning':''
   result.append(state,el('p',tr('Вход: ','Input: ')+fmt(last.loadedRpm,1)+' '+tr('об/мин','rpm')+' · '+tr('Нагрузка: ','Load: ')+fmt(last.reflectedTorque,3)+' / '+fmt(last.stallTorque,3)+' N·m'),el('p',tr('Использование момента остановки: ','Stall torque utilization: ')+fmt(last.utilization===null?null:last.utilization*100,0)+'%'))
   const list=el('div',undefined,'editor-drive-output-list')
   for(const p of last.outputs.slice(0,300)){
    const b=button((names.get(p.id)??p.id)+' · '+fmt(p.loadedRpm,1)+' '+tr('об/мин','rpm')+' · '+fmt(p.singleOutputStallTorque,3)+' N·m',()=>onFocus([p.id]))
    b.title=tr('Оценка момента остановки при нагрузке только на этот выход','Estimated stall torque when only this output is loaded')
    list.append(b)
   }
   result.append(el('p',tr('Выходы: скорость под заданной нагрузкой / момент остановки одного выхода','Outputs: loaded speed / single-output stall torque'),'editor-transmission-note'),list)
   if(last.outputs.length>300)result.append(el('p',tr('Показано 300 выходов; полный расчёт в отчёте.','300 outputs shown; full calculation in report.')))
  }catch{result.append(el('p',tr('Проверь значения и не назначай две нагрузки на одну деталь.','Check values and do not assign duplicate loads to the same part.')))}
 }
 form.append(source,rpm.wrap,torque.wrap,eff.wrap,loadList,add,calc)
 details.append(summary,form,result,note);root.append(details)
 return {render(next,parts){
  if(next===motion){root.hidden=!outputs.length;return}
  const available=driveOutputs(next)
  root.hidden=!available.length
  motion=next;outputs=available;names=new Map(parts.map(p=>[p.id,p.design+' · '+p.id]));rows=[];loadList.replaceChildren();result.replaceChildren();last=null;onReport(null)
  const motor=sourceFromMotion(motion)
  rpm.input.disabled=torque.input.disabled=Boolean(motor)
  rpm.wrap.hidden=torque.wrap.hidden=Boolean(motor)
  source.textContent=motor?tr('Источник: настройки выбранного электромотора.','Source: selected electric motor settings.'):tr('Источник: введи характеристики ручного привода.','Source: enter manual drive assumptions.')
  if(outputs.length){addRow();calculate()}
 }}
}
