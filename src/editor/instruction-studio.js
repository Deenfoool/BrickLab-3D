import {createProjectPreviewRenderer} from './project-preview.js'
export function normalizeSteps(value,parts){
 const valid=new Set(parts.map(p=>p.id)),seen=new Set(),steps=[]
 for(const raw of Array.isArray(value)?value.slice(0,99):[]){const ids=(Array.isArray(raw?.ids)?raw.ids:[]).filter(id=>valid.has(id)&&!seen.has(id)&&(seen.add(id),true));if(ids.length)steps.push({ids,note:String(raw.note??'').slice(0,400),angle:['iso','front','rear','left','side','top'].includes(raw.angle)?raw.angle:'iso'})}
 const rest=parts.filter(p=>!seen.has(p.id)).map(p=>p.id);if(rest.length)steps.push({ids:rest,note:'',angle:'iso'})
 return steps
}
export function openInstructionStudio({document:build,selection,language,signal,save,partsCatalog}){
 const d=document,ru=language==='ru',tr=(a,b)=>ru?a:b,el=(tag,cls,txt)=>{const n=d.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
 if(!build.parts.length||build.parts.length>2000)throw Error('instruction_limit')
 let steps=normalizeSteps(build.customInstructions,build.parts),index=0,renderer,serial=0,urls=[],closed=false,busy=false
 const dialog=el('dialog','instruction-studio'),header=el('header','studio-header'),side=el('aside','instruction-studio-side'),main=el('main','instruction-studio-main'),stage=el('img','instruction-studio-image'),notice=el('p','studio-status'),stepList=el('div','instruction-steps'),partList=el('div','instruction-part-list'),note=el('textarea'),angle=el('select')
 stage.alt=tr('Предпросмотр шага','Step preview')
 const btn=(txt,fn)=>{const b=el('button','workspace-action',txt);b.type='button';b.onclick=fn;return b}
 const close=btn(tr('Назад','Back'),()=>dialog.close()),store=btn(tr('Сохранить этапы','Save steps'),()=>{notice.textContent=save(steps)?tr('Этапы сохранены в проекте.','Steps saved in project.'):tr('Не удалось сохранить этапы.','Could not save steps.')})
 const pdf=btn(tr('Печать / PDF','Print / PDF'),printSteps)
 header.append(el('strong',null,'Instruction Studio · '+build.name),store,pdf,close)
 const selected=new Set(selection),chosen=new Set(),byId=new Map(build.parts.map(p=>[p.id,p]))
 const add=btn(tr('Новый этап из выбранных деталей','New step from checked parts'),()=>{if(busy||!chosen.size||steps.length>=100)return;const ids=[...chosen];steps=steps.map(s=>({...s,ids:s.ids.filter(id=>!chosen.has(id))})).filter(s=>s.ids.length);index=Math.min(index,steps.length);steps.splice(index,0,{ids,note:'',angle:'iso'});chosen.clear();refresh()})
 const move=(delta)=>{const n=index+delta;if(busy||n<0||n>=steps.length)return;[steps[index],steps[n]]=[steps[n],steps[index]];index=n;refresh()}
 const split=btn(tr('Выбрать выделение редактора','Use editor selection'),()=>{chosen.clear();for(const id of selected)chosen.add(id);refreshParts()})
 side.append(el('h3',null,tr('Этапы сборки','Assembly steps')),stepList,btn('↑',()=>move(-1)),btn('↓',()=>move(1)),el('h3',null,tr('Детали нового этапа','Parts for new step')),split,partList,add)
 for(const [v,t] of [['iso','3/4'],['front',tr('Спереди','Front')],['side',tr('Справа','Right')],['left',tr('Слева','Left')],['rear',tr('Сзади','Rear')],['top',tr('Сверху','Top')]]){const o=el('option',null,t);o.value=v;angle.append(o)}
 note.maxLength=400;note.placeholder=tr('Комментарий к шагу','Step note');note.oninput=()=>steps[index].note=note.value;angle.onchange=()=>{steps[index].angle=angle.value;void preview()}
 main.append(stage,angle,note,notice);dialog.append(header,side,main)
 function subset(i){const ids=new Set(steps.slice(0,i+1).flatMap(s=>s.ids));return {...build,parts:build.parts.filter(p=>ids.has(p.id)),connections:build.connections.filter(l=>ids.has(l.shaft.part)&&ids.has(l.socket.part)),belts:(build.belts??[]).filter(b=>ids.has(b.a.part)&&ids.has(b.b.part)),sceneLayers:{groups:[],hiddenPartIds:[]}}}
 function refreshParts(){partList.replaceChildren();for(const p of build.parts){const l=el('label'),c=el('input');c.type='checkbox';c.checked=chosen.has(p.id);c.onchange=()=>{if(c.checked)chosen.add(p.id);else chosen.delete(p.id)};l.append(c,el('span',null,(partsCatalog[p.design]?.[language]??p.design)+' · '+p.design));partList.append(l)}}
 function refresh(){index=Math.min(index,steps.length-1);stepList.replaceChildren();steps.forEach((s,i)=>{const b=btn((i+1)+'. '+s.ids.length+' '+tr('дет.','parts'),()=>{index=i;refresh()});b.setAttribute('aria-pressed',String(i===index));stepList.append(b)});note.value=steps[index].note;angle.value=steps[index].angle;refreshParts();void preview()}
 let queue=Promise.resolve()
 function shot(doc,angle){const run=queue.then(()=>{if(closed)throw Error('closed');renderer??=createProjectPreviewRenderer({width:1000,height:700,format:'png',requireAll:true,shadow:false});return renderer.render(doc,signal,{angle})});queue=run.catch(()=>{});return run}
 async function preview(){const id=++serial,doc=subset(index),view=steps[index].angle;try{const blob=await shot(doc,view);if(closed||id!==serial||!blob)return;for(const url of urls)URL.revokeObjectURL(url);urls=[URL.createObjectURL(blob)];stage.src=urls[0];notice.textContent=tr('Шаг ','Step ')+(index+1)+' / '+steps.length}catch{if(!closed&&id===serial)notice.textContent=tr('Не удалось построить предпросмотр.','Preview unavailable.')}}
 async function printSteps(){if(busy)return;busy=true;pdf.disabled=true;store.disabled=true;const snapshot=structuredClone(steps),pages=el('div','bricklab-print-pages'),printUrls=[];try{
  for(let i=0;i<snapshot.length;i++){signal.throwIfAborted();if(closed)return;notice.textContent=tr('Подготовка страницы ','Preparing page ')+(i+1)+' / '+snapshot.length
   const s=snapshot[i],ids=new Set(snapshot.slice(0,i+1).flatMap(v=>v.ids)),doc={...build,parts:build.parts.filter(p=>ids.has(p.id)),connections:build.connections.filter(l=>ids.has(l.shaft.part)&&ids.has(l.socket.part)),belts:(build.belts??[]).filter(b=>ids.has(b.a.part)&&ids.has(b.b.part)),sceneLayers:{groups:[],hiddenPartIds:[]}}
   const blob=await shot(doc,s.angle);if(!blob||closed)throw Error('preview');const url=URL.createObjectURL(blob);printUrls.push(url);const page=el('section','bricklab-print-page'),img=el('img');img.src=url;await img.decode();page.append(el('h1',null,build.name+' · '+tr('Шаг ','Step ')+(i+1)),img,el('p',null,s.note))
   const counts=new Map();for(const id of s.ids){const p=byId.get(id),key=p.design+' · '+(p.color??partsCatalog[p.design]?.color??'');counts.set(key,(counts.get(key)??0)+1)}const inventory=el('p',null,[...counts].map(([key,n])=>n+' × '+key).join(' | '));page.append(inventory);pages.append(page)
  }
  d.body.append(pages);d.body.classList.add('bricklab-printing');window.print()
 }catch{if(!closed)notice.textContent=tr('Не удалось подготовить PDF.','Could not prepare PDF.')}finally{d.body.classList.remove('bricklab-printing');pages.remove();printUrls.forEach(URL.revokeObjectURL);busy=false;pdf.disabled=store.disabled=false}}
 const dispose=()=>{if(closed)return;closed=true;serial++;urls.forEach(URL.revokeObjectURL);void queue.finally(()=>renderer?.dispose());dialog.remove()}
 dialog.addEventListener('close',dispose,{once:true});signal.addEventListener('abort',dispose,{once:true});d.body.append(dialog);dialog.showModal();refresh()
}
