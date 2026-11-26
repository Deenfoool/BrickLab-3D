import {instructionPdf,renderInstructionPage} from './instruction-export.js'
import {createProjectPreviewRenderer} from './project-preview.js?v=installation-1'
import {generateInstructionSteps,initialInstructionSteps} from './instruction-steps.js?v=context-pages-1'
import {planInstallation} from './instruction-trajectories.js'
import {createInstructionPlayback} from './instruction-playback.js'
export {normalizeSteps} from './instruction-steps.js'

export function openInstructionStudio({document:build,selection,language,signal,save,partsCatalog,models}){
 const d=document,ru=language==='ru',tr=(a,b)=>ru?a:b,el=(tag,cls,txt)=>{const n=d.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n}
 if(!build.parts.length||build.parts.length>2000)throw Error('instruction_limit')
 if(build.parts.some(p=>!Array.isArray(p.position)||p.position.length!==3||!p.position.every(Number.isFinite)||!Array.isArray(p.rotation)||p.rotation.length!==4||!p.rotation.every(Number.isFinite)||!p.rotation.some(Boolean)||!models?.has(p.design)))throw Error('incomplete_model_geometry')
 let steps=initialInstructionSteps(build),index=0,renderer,playback,closed=false,busy=false,plans=[],planKey='',progress=0,playing=false,playAll=false,animationFrame=0,lastTime=0
 const dialog=el('dialog','instruction-studio'),header=el('header','studio-header'),side=el('aside','instruction-studio-side'),main=el('main','instruction-studio-main'),stage=el('div','instruction-live-stage'),notice=el('p','studio-status'),stepList=el('div','instruction-steps'),partList=el('div','instruction-part-list'),note=el('textarea'),angle=el('select'),timeline=el('div','instruction-timeline'),motionStatus=el('p','instruction-motion-status'),scrub=el('input'),speed=el('select'),arrow=el('input')
 const btn=(txt,fn)=>{const b=el('button','workspace-action',txt);b.type='button';b.onclick=fn;return b}
 const close=btn(tr('Назад','Back'),()=>dialog.close()),store=btn(tr('Сохранить этапы','Save steps'),()=>{notice.textContent=save(steps)?tr('Этапы сохранены в проекте.','Steps saved in project.'):tr('Не удалось сохранить этапы.','Could not save steps.')})
 const pdf=btn(tr('Скачать PDF','Download PDF'),printSteps)
 header.append(el('strong',null,'Instruction Studio · '+build.name),store,pdf,close)
 const selected=new Set(selection),chosen=new Set(),byId=new Map(build.parts.map(p=>[p.id,p]))
 const add=btn(tr('Новый этап из выбранных деталей','New step from checked parts'),()=>{if(busy||!chosen.size||steps.length>=100)return;stop();const ids=[...chosen];steps=steps.map(s=>({...s,ids:s.ids.filter(id=>!chosen.has(id))})).filter(s=>s.ids.length);index=Math.min(index,steps.length);steps.splice(index,0,{ids,note:'',angle:'iso'});chosen.clear();refresh()})
 const move=(delta)=>{const n=index+delta;if(busy||n<0||n>=steps.length)return;stop();[steps[index],steps[n]]=[steps[n],steps[index]];index=n;refresh()}
 const split=btn(tr('Выбрать выделение редактора','Use editor selection'),()=>{chosen.clear();for(const id of selected)if(byId.has(id))chosen.add(id);refreshParts()})
 const play=btn(tr('▶ Вся инструкция','▶ Play all'),()=>{if(busy)return;if(playing&&playAll){stop();return}stop();index=0;refresh(false);start(true)})
 const batch=el('select');batch.setAttribute('aria-label',tr('Деталей на этап','Parts per step'));for(const n of [1,2,4,6,8,12,20]){const opt=el('option',null,String(n));opt.value=n;batch.append(opt)}batch.value='4'
 const auto=btn(tr('Автоматически создать этапы','Auto-generate steps'),()=>{if(busy)return;if(steps.some(s=>s.note)&&!window.confirm(tr('Заменить текущие этапы и комментарии?','Replace current steps and notes?')))return;if(!steps.some(s=>s.note)&&build.customInstructions?.length>1&&!window.confirm(tr('Заменить сохранённые этапы?','Replace saved steps?')))return;stop();steps=generateInstructionSteps(build,Number(batch.value));index=0;chosen.clear();refresh();notice.textContent=tr('Создано этапов: ','Steps generated: ')+steps.length})
 const autoControls=el('div','instruction-auto-controls');const batchLabel=el('label');batchLabel.append(el('span',null,tr('Деталей на этап (ориентир)','Parts per step (target)')),batch);autoControls.append(batchLabel,auto)
 const regenerate=btn(tr('Пересчитать траектории','Recalculate paths'),()=>{if(busy)return;stop();planKey='';refresh();notice.textContent=tr('Траектории пересчитаны по текущему порядку этапов.','Paths recalculated for the current step order.')})
 side.append(el('h3',null,tr('Этапы сборки','Assembly steps')),autoControls,stepList,btn('↑',()=>move(-1)),btn('↓',()=>move(1)),play,regenerate,el('h3',null,tr('Детали нового этапа','Parts for new step')),split,partList,add)
 for(const [v,t] of [['iso','3/4'],['front',tr('Спереди','Front')],['side',tr('Справа','Right')],['left',tr('Слева','Left')],['rear',tr('Сзади','Rear')],['top',tr('Сверху','Top')]]){const o=el('option',null,t);o.value=v;angle.append(o)}
 angle.setAttribute('aria-label',tr('Ракурс','Camera angle'))
 note.maxLength=400;note.placeholder=tr('Комментарий к шагу','Step note');note.oninput=()=>steps[index].note=note.value;angle.onchange=()=>{stop();steps[index].angle=angle.value;configure(progress)}
 const playStep=btn(tr('▶ Этап','▶ Step'),()=>{if(busy)return;if(playing){stop();return}if(progress>=current().length)seek(0);start(false)})
 const replay=btn(tr('Сначала','Restart'),()=>{stop();seek(0);start(false)})
 scrub.type='range';scrub.min='0';scrub.step='.01';scrub.setAttribute('aria-label',tr('Положение анимации','Animation position'));scrub.oninput=()=>{stop();seek(Number(scrub.value))}
 for(const value of [.5,1,1.5,2,4]){const o=el('option',null,value+'×');o.value=value;speed.append(o)}speed.value='1';speed.setAttribute('aria-label',tr('Скорость установки','Installation speed'))
 arrow.type='checkbox';arrow.checked=true;arrow.onchange=()=>{playback?.setArrows(arrow.checked);seek(progress)}
 const arrowLabel=el('label','instruction-arrow-toggle');arrowLabel.append(arrow,el('span',null,tr('Стрелки','Arrows')))
 timeline.append(playStep,replay,scrub,speed,arrowLabel)
 const info=el('p','instruction-motion-hint',tr('Направления рассчитаны по соединениям и габаритам. Неподтверждённые пути отмечаются и показываются без движения.','Directions use connectors and bounding boxes. Unresolved paths are marked and shown without motion.'))
 main.append(stage,timeline,motionStatus,angle,note,info,notice);dialog.append(header,side,main)
 const reasonText={missing_geometry:tr('нет геометрии','geometry unavailable'),budget:tr('лимит расчёта','planning budget'),unsupported_joint:tr('особое соединение','special joint'),conflicting_axes:tr('несовместимые направления','conflicting directions'),blocked:tr('путь перекрыт габаритами','path obstructed by bounds')}
 const current=()=>plans[index]??[]
 function replan(){const key=JSON.stringify(steps.map(s=>s.ids));if(key===planKey)return;plans=planInstallation(build,steps,models);planKey=key}
 function refreshParts(){partList.replaceChildren();for(const p of build.parts){const l=el('label'),c=el('input');c.type='checkbox';c.checked=chosen.has(p.id);c.onchange=()=>{if(c.checked)chosen.add(p.id);else chosen.delete(p.id)};l.append(c,el('span',null,(partsCatalog[p.design]?.[language]??p.design)+' · '+p.design));partList.append(l)}}
 function drawSteps(){pdf.textContent=tr('Скачать PDF','Download PDF')+' ('+steps.length+' '+tr('стр.','pages')+')';stepList.replaceChildren();steps.forEach((s,i)=>{const manual=plans[i]?.filter(t=>t.kind==='manual').length??0,b=btn((i+1)+'. '+s.ids.length+' '+tr('дет.','parts')+(manual?' · !'+manual:''),()=>{if(busy)return;stop();index=i;refresh()});b.setAttribute('aria-pressed',String(i===index));if(manual)b.title=tr('Не найдено путей: ','Unresolved paths: ')+manual;stepList.append(b)})}
 function seek(value){const tracks=current();progress=Math.max(0,Math.min(tracks.length,value));scrub.max=String(tracks.length);scrub.value=String(progress);playback.seek(progress)
  const manual=tracks.filter(t=>t.kind==='manual').length,active=tracks[Math.min(tracks.length-1,Math.floor(progress))],done=Math.floor(progress)
  motionStatus.textContent=tr('Шаг ','Step ')+(index+1)+' / '+steps.length+' · '+done+' / '+tracks.length+' '+tr('деталей','parts')+(manual?' · '+tr('Без траектории: ','Unresolved: ')+manual:'')+(active?.kind==='manual'&&progress<tracks.length?' · '+(reasonText[active.reason]??''):'')
  motionStatus.toggleAttribute('data-warning',manual>0)
 }
 function configure(value){playback.configure(steps.slice(0,index).flatMap(s=>s.ids),current(),steps[index].angle);playback.setArrows(arrow.checked);seek(value)}
 function refresh(final=true){index=Math.min(index,steps.length-1);replan();drawSteps();note.value=steps[index].note;angle.value=steps[index].angle;refreshParts();configure(final?current().length:0)}
 function stop(){playing=false;playAll=false;cancelAnimationFrame(animationFrame);animationFrame=0;lastTime=0;playStep.textContent=tr('▶ Этап','▶ Step');play.textContent=tr('▶ Вся инструкция','▶ Play all')}
 function start(all){if(closed||busy)return;playing=true;playAll=all;lastTime=0;playStep.textContent=tr('Ⅱ Пауза','Ⅱ Pause');if(all)play.textContent=tr('■ Стоп','■ Stop');animationFrame=requestAnimationFrame(tick)}
 function tick(now){if(closed||!playing)return;const dt=lastTime?Math.min(100,now-lastTime):0;lastTime=now;seek(progress+dt/650*Number(speed.value));if(progress>=current().length){if(!playAll||index>=steps.length-1){stop();return}index++;refresh(false);lastTime=now}animationFrame=requestAnimationFrame(tick)}
 let queue=Promise.resolve()
 function shot(doc,angle,highlightIds,installationTracks){const run=queue.then(()=>{if(closed)throw Error('closed');renderer??=createProjectPreviewRenderer({width:1000,height:700,format:'png',requireAll:true,shadow:false,models});return renderer.render(doc,signal,{angle,highlightIds,installationTracks})});queue=run.catch(()=>{});return run}
 async function printSteps(){if(busy)return;stop();busy=true;pdf.disabled=true;store.disabled=true;replan();const snapshot=structuredClone(steps),snapshotPlans=plans,includeArrows=arrow.checked,pages=[];try{
  for(let i=0;i<snapshot.length;i++){signal.throwIfAborted();if(closed)return;notice.textContent=tr('Подготовка страницы ','Preparing page ')+(i+1)+' / '+snapshot.length
   const s=snapshot[i],ids=new Set(snapshot.slice(0,i+1).flatMap(v=>v.ids)),doc={...build,parts:build.parts.filter(p=>ids.has(p.id)),connections:build.connections.filter(l=>ids.has(l.shaft.part)&&ids.has(l.socket.part)),belts:(build.belts??[]).filter(b=>ids.has(b.a.part)&&ids.has(b.b.part)),sceneLayers:{groups:[],hiddenPartIds:[]}}
   const tracks=snapshotPlans[i],blob=await shot(doc,s.angle,s.ids,includeArrows?tracks:[]);if(!blob||closed)throw Error('preview')
   const counts=new Map();for(const id of s.ids){const p=byId.get(id),key=p.design+' · '+(p.color??partsCatalog[p.design]?.color??'');counts.set(key,(counts.get(key)??0)+1)}
   const unresolved=tracks.filter(t=>t.kind==='manual').length
   pages.push(await renderInstructionPage({name:build.name,index:i,total:snapshot.length,note:s.note,inventory:[...counts].map(([key,n])=>n+' × '+key).join(' | '),blob,language,unresolved}))
  }
  if(closed)return
  const url=URL.createObjectURL(instructionPdf(pages)),a=el('a');a.href=url;a.download=build.name.replace(/[\\/:*?"<>|]/g,'-')+'-instructions.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);notice.textContent=tr('PDF готов. Страниц: ','PDF ready. Pages: ')+pages.length
 }catch{if(!closed)notice.textContent=tr('Не удалось подготовить PDF.','Could not prepare PDF.')}finally{busy=false;pdf.disabled=store.disabled=false}}
 const dispose=()=>{if(closed)return;closed=true;stop();playback?.dispose();void queue.finally(()=>renderer?.dispose());dialog.remove()}
 dialog.addEventListener('close',dispose,{once:true});signal.addEventListener('abort',dispose,{once:true});d.body.append(dialog);dialog.showModal()
 try{playback=createInstructionPlayback(stage,{build,models,catalog:partsCatalog});refresh()}catch(e){dialog.close();dispose();throw e}
}
