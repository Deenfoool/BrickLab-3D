import {achievementById} from './achievement-catalog.js'
import {renderAchievementMedal} from './achievement-hall.js?v=showcase-motion-2'
const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n}
const rarity={ru:{common:'Обычное',uncommon:'Необычное',rare:'Редкое',epic:'Эпическое',legendary:'Легендарное',unique:'Уникальное'},en:{common:'Common',uncommon:'Uncommon',rare:'Rare',epic:'Epic',legendary:'Legendary',unique:'Unique'}}
const gift={id:'firstBuilder',ru:'First Builder',en:'First Builder',descRu:'Первая подарочная сборка',descEn:'First gifted build',rarity:'unique',icon:'icon-trophy'}
export function selectedWorkshopAwards(progress){const earned=new Set(progress?.awards?.map(a=>a.award)??[]);return (progress?.showcase??(earned.has('firstCloudSave')?['firstCloudSave']:[])).filter(id=>earned.has(id)).slice(0,6)}
function label(a,lang,date){return [a[lang],a[lang==='ru'?'descRu':'descEn'],rarity[lang][a.rarity],Number.isInteger(a.xp)?'+'+a.xp+' XP':'',date].filter(Boolean).join(' · ')}
function dateText(date,lang){return typeof date==='string'&&Number.isFinite(Date.parse(date))?new Intl.DateTimeFormat(lang,{dateStyle:'medium',timeZone:'UTC'}).format(new Date(date)):''}
function btn(label,fn,cls='workspace-action'){const n=el('button',cls,label);n.type='button';n.onclick=fn;return n}
function showDetails(host,a,lang,date){
 const dialog=el('dialog','workshop-award-dialog'),card=el('section','workshop-award-detail rarity-'+a.rarity);card.append(renderAchievementMedal(a),el('h3',null,a[lang]),el('p',null,a[lang==='ru'?'descRu':'descEn']),el('strong',null,rarity[lang][a.rarity]+(Number.isInteger(a.xp)?' · +'+a.xp+' XP':'')))
 if(date)card.append(el('p','account-muted',(lang==='ru'?'Получено: ':'Earned: ')+date))
 const close=btn(lang==='ru'?'Закрыть':'Close',()=>{if(dialog.close)dialog.close();else dialog.remove()});card.append(close);dialog.append(card);host.append(dialog);dialog.onclose=()=>dialog.remove();if(dialog.showModal)dialog.showModal();else dialog.open=true
}
export function renderWorkshopAwards({lang='ru',ids=[],definitions=[],dates={},editing=false}){
 lang=lang==='ru'?'ru':'en';const root=el('div','workshop-award-showcase achievement-hall'),grid=el('div','workshop-award-grid')
 for(const id of [...new Set(ids)].slice(0,7)){
  const a=id==='firstBuilder'?gift:achievementById(id,definitions);if(!a)continue
  const date=dateText(dates[id],lang),tile=btn('',()=>{if(!editing)showDetails(root,a,lang,date)},'workshop-award-item rarity-'+a.rarity)
  tile.disabled=editing;tile.title=label(a,lang,date);tile.setAttribute('aria-label',tile.title);tile.append(renderAchievementMedal(a),el('span','workshop-award-name',a[lang]),el('small','workshop-award-xp',[rarity[lang][a.rarity],Number.isInteger(a.xp)?'+'+a.xp+' XP':''].filter(Boolean).join(' · ')));grid.append(tile)
 }
 grid.setAttribute('data-award-count',String(grid.children.length));root.append(grid);return root
}
export function openWorkshopAwardPicker({host,lang='ru',progress,selected,onApply}){
 lang=lang==='ru'?'ru':'en';const ru=lang==='ru',dialog=el('dialog','workshop-award-dialog workshop-award-picker'),grid=el('div','workshop-award-picker-grid achievement-hall'),status=el('p','account-muted'),actions=el('div','workshop-live-actions'),earned=(progress?.awards??[]).map(row=>({row,a:achievementById(row.award,progress?.definitions??[])})).filter(x=>x.a)
 let picks=selected.filter(id=>earned.some(x=>x.a.id===id)).slice(0,6)
 function render(){status.textContent=picks.length+' / 6';grid.replaceChildren();for(const {row,a} of earned){const index=picks.indexOf(a.id),b=btn('',()=>{picks=index>=0?picks.filter(id=>id!==a.id):[...picks,a.id];render()},'workshop-award-choice rarity-'+a.rarity);b.disabled=index<0&&picks.length>=6;b.setAttribute('aria-pressed',String(index>=0));b.title=label(a,lang,dateText(row.awardedAt,lang));b.append(renderAchievementMedal(a),el('span',null,a[lang]),el('small',null,index>=0?'#'+(index+1):'+'));grid.append(b)}}
 const close=()=>{if(dialog.close)dialog.close();else dialog.remove()};actions.append(btn(ru?'Отмена':'Cancel',close),btn(ru?'Применить':'Apply',()=>{onApply([...picks]);close()}))
 dialog.append(el('h3',null,ru?'Выбери до 6 полученных наград':'Choose up to six earned awards'),status,grid,actions);host.append(dialog);dialog.onclose=()=>dialog.remove();render();if(dialog.showModal)dialog.showModal();else dialog.open=true
}
