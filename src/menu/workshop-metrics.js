import {metricCatalog,defaultMetricIds,metricItems,moveMetric,readMetricLayout} from './workshop-metrics-model.js'
import {levelForXp} from './achievement-catalog.js'
import {achievementRank} from './achievement-hall.js'
const words={ru:{edit:'Настроить показатели',heading:'Показатели мастерской',help:'Перетаскивай карточки или используй стрелки. Убирай ненужные и добавляй из списка. Порядок сохранится в аккаунте. Посетители видят только публичные данные.',add:'Добавить блок',remove:'Убрать',up:'Переместить выше',down:'Переместить ниже',save:'Сохранить',cancel:'Отмена',reset:'По умолчанию',empty:'Нет выбранных показателей',unranked:'Вне рейтинга'},en:{edit:'Customize metrics',heading:'Workshop metrics',help:'Drag cards or use arrows. Remove unwanted cards and add others. Order is saved to your account. Visitors see public data only.',add:'Add metric',remove:'Remove',up:'Move up',down:'Move down',save:'Save',cancel:'Cancel',reset:'Reset to default',empty:'No metrics selected',unranked:'Unranked'}}
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n}
function icon(id){const n=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(n.namespaceURI,'use');n.setAttribute('class','icon');n.setAttribute('aria-hidden','true');u.setAttribute('href','#'+id);n.append(u);return n}
function button(label,fn,disabled=false,cls='workspace-action'){const n=el('button',cls,label);n.type='button';n.onclick=fn;n.disabled=disabled;return n}
export function workshopMetricValues({lang='ru',owner=false,remoteCount,progress,card,loaded=false}){
 const t=words[lang==='ru'?'ru':'en'],rep=card?.reputation,known=loaded||!!card,xp=owner?progress?.xp:card?.achievementXp,level=Number.isSafeInteger(xp)?levelForXp(xp):null
 return {likes:rep?.likes??(known&&!card?0:null),builds:owner?remoteCount:rep?.builds,followers:card?.followers??(known&&!card?0:null),xp:Number.isSafeInteger(xp)?xp:null,title:level===null?null:achievementRank(level,lang),rank:Number.isSafeInteger(card?.globalRank)?'#'+card.globalRank:known?t.unranked:null,published:rep?.builds??(known&&!card?0:null),downloads:rep?.downloads??(known&&!card?0:null),level,achievements:owner?progress?.awards?.length:card?.achievementCount}
}
export function renderMetricGrid(items){
 const grid=el('div','workshop-metric-grid workshop-custom-metrics')
 for(const item of items){const m=el('div','workshop-metric'),label=el('span','workshop-metric-label');label.append(icon(item.icon),el('span',null,item.label));m.dataset.metric=item.id;m.append(label,el('strong',null,item.value));grid.append(m)}
 return grid
}
export function renderMetricEditor({lang,layout,values,busy,save,enabled=true}){
 const l=lang==='ru'?'ru':'en',t=words[l],root=el('section','workshop-metric-editor'),toggle=button(t.edit,()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){draft=readMetricLayout(layout);render()}},busy||!enabled),panel=el('div','workshop-metric-editor-panel'),list=el('div','workshop-metric-edit-list'),addRow=el('div','workshop-metric-add'),actions=el('div','workshop-metric-actions')
 let draft=readMetricLayout(layout)
 panel.hidden=true;toggle.setAttribute('aria-expanded','false')
 function update(next){draft=next;render()}
 function render(){
  list.replaceChildren();addRow.replaceChildren()
  const items=metricItems({layout:draft,lang:l,owner:true,values})
  if(!items.length)list.append(el('p','account-muted',t.empty))
  items.forEach((item,i)=>{
   const row=el('div','workshop-metric-edit-row'),name=el('div','workshop-metric-edit-name'),grip=el('span','workshop-metric-grip','⋮⋮');grip.setAttribute('aria-hidden','true');name.append(icon(item.icon),el('span',null,item.label),el('strong',null,item.value))
   const up=button('↑',()=>update(moveMetric(draft,i,i-1)),busy||i===0),down=button('↓',()=>update(moveMetric(draft,i,i+1)),busy||i===items.length-1),remove=button('×',()=>update(draft.filter(id=>id!==item.id)),busy)
   up.setAttribute('aria-label',t.up+' '+item.label);down.setAttribute('aria-label',t.down+' '+item.label);remove.setAttribute('aria-label',t.remove+' '+item.label);row.append(grip,name,up,down,remove)
   row.draggable=!busy;row.ondragstart=e=>{e.dataTransfer.setData('text/plain',String(i));e.dataTransfer.effectAllowed='move'};row.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='move'};row.ondrop=e=>{e.preventDefault();const raw=e.dataTransfer.getData('text/plain');if(/^\d+$/.test(raw))update(moveMetric(draft,Number(raw),i))}
   list.append(row)
  })
  const select=el('select','achievement-select'),available=Object.keys(metricCatalog).filter(id=>!draft.includes(id))
  for(const id of available){const option=el('option',null,metricCatalog[id][l]);option.value=id;select.append(option)}
  select.setAttribute('aria-label',t.add);select.disabled=busy||!available.length
  addRow.append(select,button('+ '+t.add,()=>{if(available.includes(select.value))update([...draft,select.value])},busy||!available.length))
 }
 actions.append(button(t.reset,()=>update([...defaultMetricIds]),busy),button(t.cancel,()=>{draft=readMetricLayout(layout);panel.hidden=true;toggle.setAttribute('aria-expanded','false')},busy),button(t.save,()=>save([...draft]),busy,'workspace-action primary'))
 panel.append(el('h3',null,t.heading),el('p','account-muted',t.help),list,addRow,actions);root.append(toggle,panel);return root
}
