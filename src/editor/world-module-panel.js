
import {readModules,writeModules,validateModule,exportModule,modulePresets,moduleCategories} from './world-modules.js'
export function mountModulePanel({dialog,button,signal,api,status,busy}){
 const doc=dialog.ownerDocument,$=id=>doc.getElementById(id);
 const on=(t,e,f)=>t.addEventListener(e,f,{signal});
 let modules=[],error='',working=false;
 const notice=s=>{$('module-notice').textContent=s};
 const el=(tag,txt,cls)=>{const n=doc.createElement(tag);if(txt)n.textContent=txt;if(cls)n.className=cls;return n};
 function action(text,fn){const b=el('button',text);b.type='button';b.disabled=working;on(b,'click',fn);return b}
 function render(){
  const target=$('module-cards');target.replaceChildren();
  const query=$('module-search').value.trim().toLowerCase(),category=$('module-filter').value;
  const list=[...modulePresets.map(p=>({...p,preset:true})),...modules];
  for(const item of list.filter(m=>(!category||m.category===category)&&(!query||(m.name+' '+m.category).toLowerCase().includes(query)))){
   const card=el('article',null,'world-module-card');
   const image=el('div',null,'world-module-image');
   if(item.thumbnail){const img=el('img');img.src=item.thumbnail;img.alt='';image.append(img)}
   else{image.append(el('span',item.preset?'Шаблон':'LEGO','world-module-symbol'))}
   card.append(image,el('strong',item.name),el('small',item.category+' · '+(item.preset?item.description:item.parts.length+' дет.')));
   const actions=el('div',null,'world-module-actions');
   actions.append(action('Разместить',()=>run(async()=>{await api.start(item);dialog.close();status('Модуль: ЛКМ разместить · Q/E поворот · Esc отмена')})));
   if(!item.preset){
    actions.append(action('Экспорт',()=>exportModule(item)),action('Изменить',()=>{
     const name=prompt('Название модуля',item.name);if(!name?.trim())return;
     const next=modules.map(m=>m.id===item.id?{...m,name:name.trim().slice(0,80)}:m);
     try{writeModules(next);modules=next;render()}catch(e){notice(e.message)}
    }),action('Удалить',()=>{if(!confirm('Удалить модуль «'+item.name+'» из библиотеки?'))return;const next=modules.filter(m=>m.id!==item.id);try{writeModules(next);modules=next;render()}catch(e){notice(e.message)}}));
   }
   card.append(actions);target.append(card)
  }
  if(!target.children.length)target.append(el('p','Модули не найдены.'));
  $('module-save').disabled=working||!!error;$('module-import').disabled=working||!!error;
 }
 async function run(fn){
  if(working||signal.aborted)return;working=true;busy(true);render();notice('Подготовка…');
  try{await fn();if(!signal.aborted)notice('Готово')}catch(e){if(!signal.aborted)notice(e.message||'Не удалось выполнить операцию.')}
  finally{working=false;if(!signal.aborted){busy(false);render()}}
 }
 function open(){
  try{modules=readModules();error=''}catch(e){modules=[];error=e.message}
  notice(error||'Выдели детали в сцене, чтобы сохранить свой модуль.');
  render();if(!dialog.open)dialog.showModal();
 }
 on(button,'click',open);on($('module-close'),'click',()=>dialog.close());
 on($('module-search'),'input',render);on($('module-filter'),'change',render);
 on($('module-save'),'click',()=>run(async()=>{
  const name=$('module-name').value.trim();if(!name)throw Error('Введи название.');
  if(modules.length>=32)throw Error('Лимит 32 модуля.');
  const item=await api.capture(name,$('module-category').value);
  if(signal.aborted)return;
  const next=[...modules,validateModule(item)];writeModules(next);modules=next;$('module-name').value='';
 }));
 on($('module-import'),'click',()=>$('module-file').click());
 on($('module-file'),'change',()=>run(async()=>{
  const f=$('module-file').files[0];$('module-file').value='';if(!f)return;
  if(f.size>2*1024*1024)throw Error('Файл модуля до 2 МБ.');
  const item=validateModule(JSON.parse(await f.text()));item.id=crypto.randomUUID();
  await api.validate(item);if(signal.aborted)return;
  const next=[...modules,item];writeModules(next);modules=next;
 }));
 signal.addEventListener('abort',()=>{if(dialog.open)dialog.close();$('module-file').value='';$('module-cards').replaceChildren()},{once:true});
 return {open}
}
