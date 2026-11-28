import {regionKey,identityKey,correctedRegions,pageRequirements,loadCorrections,saveCorrections} from './instruction-study.js?v=recognition-v9'
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el}
const btn=(text,action)=>{const el=node('button',text);el.type='button';el.onclick=action;return el}
function storage(){try{return globalThis.localStorage}catch{return null}}
export function createPageStudy({preview,inventory,language,find,describe,readUsage,onRegions}){
 const ru=language==='ru',tr=(a,b)=>ru?a:b
 const root=node('details',null,'instruction-study'),summary=node('summary'),content=node('div',null,'instruction-study-content')
 root.hidden=true;root.append(summary,content)
 let raw=new Map(),callouts=[],scope=null,changes=Object.create(null),editable=false,signature='',request,dialog,pin
 const known=new Map(inventory.filter(i=>!i.spare).map(i=>[identityKey(i.partNum,i.colorId),i]))
 function clearPin(){pin?.remove();pin=null}
 function focusRegion(region){
  const key=regionKey(region)
  const target=[...preview.querySelectorAll('.instruction-part-region')].find(el=>el.dataset.regionKey===key)
  if(target)target.focus({preventScroll:true})
  else mark(region,tr('Область детали','Part area'))
 }
 function mark(box,label){
  clearPin();pin=node('span',null,'instruction-study-pin')
  pin.title=label;pin.setAttribute('aria-label',label)
  Object.assign(pin.style,{left:(box[0]+box[2]/2)/100+'%',top:(box[1]+box[3]/2)/100+'%'})
  preview.append(pin)
 }
 function updateOverlays(){
  const effective=correctedRegions([...raw.values()],callouts,changes,inventory)
  const next=JSON.stringify(effective)
  if(next!==signature){signature=next;onRegions(effective)}
  return effective
 }
 function persist(){saveCorrections(storage(),scope,changes);render()}
 function edit(region){
  if(!editable||!scope||request?.aborted)return
  dialog?.close()
  const key=regionKey(region),d=node('dialog',null,'set-dialog instruction-correction'),search=node('input'),list=node('div',null,'instruction-correction-list')
  dialog=d;search.type='search';search.placeholder=tr('Название или артикул','Name or part number');search.setAttribute('aria-label',search.placeholder)
  function pick(value){if(request?.aborted)return;changes[key]=value;persist();d.close()}
  function results(){
   const q=search.value.toLowerCase().trim()
   list.replaceChildren()
   for(const i of [...known.values()].filter(i=>[i.partNum,i.name,i.colorName,i.elementId].join(' ').toLowerCase().includes(q)).slice(0,60)){
    const row=btn(i.partNum+' · '+(describe?.(i.partNum,i.colorId)??i.name)+' · '+i.colorName,()=>pick({partNum:i.partNum,colorId:i.colorId}))
    const swatch=node('i');swatch.style.backgroundColor=i.color;row.prepend(swatch);list.append(row)
   }
  }
  search.oninput=results
  const actions=node('div',null,'instruction-study-actions')
  actions.append(btn(tr('Не деталь','Not a part'),()=>pick({ignore:true})),btn(tr('Сбросить','Reset'),()=>{delete changes[key];persist();d.close()}),btn(tr('Закрыть','Close'),()=>d.close()))
  d.append(node('h2',tr('Исправить распознавание','Correct recognition')),node('p',tr('Исправление хранится только в этом браузере для данной страницы PDF.','Correction stays in this browser for this PDF page.')),search,list,actions)
  const abort=()=>{if(d.open)d.close();d.remove()}
  request?.addEventListener('abort',abort,{once:true})
  d.addEventListener('close',()=>{request?.removeEventListener('abort',abort);d.remove();if(dialog===d)dialog=null},{once:true})
  document.body.append(d);results();d.showModal();search.focus()
 }
 function render(){
  const regions=updateOverlays(),visible=callouts.filter(c=>!changes[regionKey(c.region)]?.ignore)
  const rows=pageRequirements(regions,visible,readUsage?.()??[])
  root.hidden=!rows.length&&!Object.keys(changes).length
  if(root.hidden)return
  const identified=rows.filter(r=>r.partNum).reduce((s,r)=>s+r.regions.length,0),all=rows.reduce((s,r)=>s+r.regions.length,0)
  summary.textContent=tr('Детали страницы','Page parts')+' · '+identified+'/'+all
  if(!root.open)return
  content.replaceChildren()
  content.append(node('small',tr('Количество — из подписей PDF. На сцене — по всему набору, не по текущему шагу.','Quantities are from PDF captions. Scene counts cover the full set, not just this step.')))
  const groups=new Map()
  for(const row of rows){const key=row.kind==='inventory'?tr('Опись','Inventory'):row.step?tr('Вероятный шаг ','Possible step ')+row.step:tr('Без номера шага','Unassigned step');const list=groups.get(key)??[];list.push(row);groups.set(key,list)}
  for(const [name,items] of groups){
   content.append(node('h4',name))
   for(const row of items){
    const line=node('div',null,'instruction-study-row'),main=node('div',null,'instruction-study-main')
    const item=known.get(identityKey(row.partNum,row.colorId))
    const label=row.partNum?(describe?.(row.partNum,row.colorId)??item?.name??row.partNum):tr('Не распознано','Unrecognized')
    main.append(node('strong',label),node('small',[row.partNum,item?.colorName,row.unknownQuantity?(row.quantity?'×'+row.quantity+' + ?':'× ?'):'×'+row.quantity].filter(Boolean).join(' · ')))
    if(row.inventory)main.append(node('small',tr('На сцене ','In scene ')+row.inventory.used+'/'+row.inventory.quantity+' · '+tr('Осталось ','Remaining ')+Math.max(0,row.inventory.quantity-row.inventory.used)))
    line.append(main)
    const actions=node('div',null,'instruction-study-actions')
    if(row.partNum)actions.append(btn(tr('Найти','Find'),()=>find(row.partNum,row.colorId,row.elementId)))
    for(const [index,entry] of row.regions.entries()){
     const suffix=row.regions.length>1?' '+(index+1):''
     actions.append(btn(tr('Показать','Show')+suffix,()=>focusRegion(entry.region)))
     if(entry.repeat&&!changes[regionKey(entry.region)])actions.append(btn(tr('Повтор рисунка','Repeated image')+suffix,()=>mark(entry.repeat,tr('Повтор изображения; не точка установки','Repeated artwork; not an installation point'))))
     if(editable&&scope)actions.append(btn(tr('Исправить','Correct')+suffix,()=>edit(entry.region)))
    }
    line.append(actions);content.append(line)
   }
  }
  if(editable&&Object.keys(changes).length)content.append(btn(tr('Сбросить исправления страницы','Reset page corrections'),()=>{changes=Object.create(null);persist()}))
 }
 root.addEventListener('toggle',()=>{if(root.open)render()})
 return {root,reset(nextRequest){
  dialog?.close();clearPin();request=nextRequest;raw=new Map();callouts=[];scope=null;changes=Object.create(null);editable=false;signature='';root.hidden=true;summary.textContent='';content.replaceChildren()
 },update(regions,meta){
  if(request?.aborted)return
  if(meta){callouts=meta.callouts??callouts;if(meta.scope&&meta.scope!==scope){scope=meta.scope;changes=loadCorrections(storage(),scope)}editable=!!scope}
  for(const region of regions){const key=regionKey(region);if(!raw.has(key))raw.set(key,region)}
  render()
 },refresh(){if(!request?.aborted&&root.open)render()}}
}
