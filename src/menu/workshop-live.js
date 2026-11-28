import {toLiveBlocks,defaultLiveBlocks,validateLiveBlocks,resolveLivePlacement,resizeLiveRect,moveLiveRect,compactLiveBlocks,livePreset,createLiveHistory,cloneLiveState} from './workshop-live-model.js'
import {setLiveWidgetRect} from './unified-profile.js?v=showcase-motion-2'
import {openWorkshopAwardPicker,selectedWorkshopAwards} from './workshop-award-widgets.js?v=showcase-motion-2'
const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n}
const paths={settings:['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8','M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2','M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z'],check:['m5 12 4 4L19 6'],close:['m6 6 12 12M18 6 6 18'],eye:['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z','M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],eyeOff:['M3 3 21 21','M10 5h2c6 0 10 7 10 7a18 18 0 0 1-4 4M6 6a20 20 0 0 0-4 6s4 7 10 7c1 0 3-.5 4-1'],lock:['M5 11h14v10H5Z','M8 11V7a4 4 0 1 1 8 0v4'],unlock:['M5 11h14v10H5Z','M8 11V7a4 4 0 0 1 7-3'],undo:['M9 5 3 11l6 6','M3 11h12a6 6 0 0 1 6 6'],redo:['m15 5 6 6-6 6','M21 11H9a6 6 0 0 0-6 6'],compact:['M5 3v18M3 8l2-2 2 2M3 16l2 2 2-2','M10 5h10M10 12h10M10 19h10'],reset:['M3 12a9 9 0 1 0 3-7','M3 3v6h6'],preview:['M2 5h20v14H2Z','M9 22h6'],award:['M8 3h8v6a4 4 0 0 1-8 0Z','M8 5H3v2a4 4 0 0 0 5 4m8-6h5v2a4 4 0 0 1-5 4M12 13v6m-5 2h10'],move:['M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3']};
function icon(name){const n=document.createElementNS('http://www.w3.org/2000/svg','svg');n.setAttribute('viewBox','0 0 24 24');n.setAttribute('fill','none');n.setAttribute('stroke','currentColor');n.setAttribute('stroke-width','1.65');n.setAttribute('stroke-linecap','round');n.setAttribute('stroke-linejoin','round');n.setAttribute('aria-hidden','true');for(const d of paths[name]??[]){const p=document.createElementNS(n.namespaceURI,'path');p.setAttribute('d',d);n.append(p)}return n}
function button(symbol,label,fn,disabled=false){const b=el('button','workshop-live-icon');b.type='button';b.disabled=disabled;b.title=label;b.setAttribute('aria-label',label);b.append(icon(symbol));b.onclick=fn;return b}
const isFormTarget=e=>e.target?.closest?.('button,a,input,select,textarea,dialog,[contenteditable]')
export function createWorkshopLiveSession({portfolio,progress}){const original={portfolio:cloneLiveState(portfolio),showcase:selectedWorkshopAwards(progress)},initial={portfolio:{...cloneLiveState(portfolio),blocks:toLiveBlocks(portfolio.blocks)},showcase:[...original.showcase]};return {original,history:createLiveHistory(initial),preview:false}}
export function liveSessionDirty(session){return !!session&&JSON.stringify(session.history.value)!==JSON.stringify(session.original)}
export function renderWorkshopLive({lang='ru',session,portfolio,progress,busy=false,signal,onSession,onSave,renderGrid,renderPreview}){
 const ru=lang==='ru',tr=(a,b)=>ru?a:b,controls=el('div','workshop-live-cover-controls'),surface=el('div','workshop-live-surface'),toolbar=el('div','workshop-live-toolbar'),status=el('p','account-muted workshop-live-status'),host=el('div','workshop-live-grid-host')
 surface.append(toolbar,status,host);status.setAttribute('role','status')
 let current=session??null,grid=null,drag=null,ghost=null,target=null,frame=0,coords=null
 const state=()=>current?current.history.value:{portfolio,showcase:selectedWorkshopAwards(progress)}
 function sync(){onSession(current)}
 function change(next){if(!current||busy)return;current.history.commit(next);sync();render()}
 function changeBlocks(blocks){change({...state(),portfolio:{...state().portfolio,blocks:validateLiveBlocks(blocks)}})}
 function changeWidget(key,patch){changeBlocks(state().portfolio.blocks.map(b=>b.key===key?{...b,...patch}:b))}
 function enter(){if(busy)return;if(!current){current=createWorkshopLiveSession({portfolio,progress});sync()}render()}
 function discard(){if(!current||busy)return;if(liveSessionDirty(current)&&!globalThis.confirm(tr('Отменить несохранённые изменения мастерской?','Discard unsaved workshop changes?')))return;current=null;sync();render()}
 function save(){if(!current||busy||drag)return;onSave(state().portfolio,state().showcase,true)}
 function undo(){if(current?.history.undo()){sync();render()}}
 function redo(){if(current?.history.redo()){sync();render()}}
 function preview(){
  const dialog=el('dialog','workshop-live-preview-dialog'),close=button('close',tr('Закрыть предпросмотр','Close preview'),()=>dialog.close()),body=el('div','workshop-live-preview-body'),head=el('header','workshop-live-preview-head'),desktop=el('button','workspace-action',tr('Компьютер','Desktop')),phone=el('button','workspace-action',tr('Телефон','Phone'))
  desktop.type=phone.type='button';desktop.onclick=()=>body.classList.remove('is-mobile');phone.onclick=()=>body.classList.add('is-mobile');head.append(el('strong',null,tr('Глазами посетителя','View as visitor')),desktop,phone,close)
  const page=renderPreview(state());page.inert=true;body.append(page);dialog.append(head,body);surface.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal()
 }
 function toolbarRender(){
  toolbar.replaceChildren();controls.replaceChildren()
  const gear=button('settings',tr('Редактировать мастерскую','Edit workshop'),enter,busy);gear.setAttribute('aria-pressed',String(!!current));controls.append(gear)
  toolbar.hidden=!current;status.hidden=!current
  if(!current)return
  controls.append(button('check',tr('Сохранить компоновку','Save layout'),save,busy),button('close',tr('Отменить изменения','Discard changes'),discard,busy))
  const preset=el('select','studio-select'),option=el('option',null,tr('Шаблоны','Templates'));option.value='';preset.append(option)
  for(const [id,title] of [['classic',tr('Классический','Classic')],['minimal',tr('Минимализм','Minimal')],['portfolio',tr('Портфолио','Portfolio')],['engineering',tr('Инженерный','Engineering')]]){const o=el('option',null,title);o.value=id;preset.append(o)}
  preset.setAttribute('aria-label',tr('Шаблоны','Templates'));preset.disabled=busy;preset.onchange=()=>{const id=preset.value;preset.value='';if(id&&globalThis.confirm(tr('Применить шаблон? Видимость блоков может измениться, а блокировки будут сняты.','Apply template? Widget visibility may change and locks will be cleared.')))changeBlocks(livePreset(state().portfolio.blocks,id))}
  toolbar.append(button('undo',tr('Отменить действие · Ctrl+Z','Undo · Ctrl+Z'),undo,busy||!current.history.canUndo),button('redo',tr('Повторить · Ctrl+Shift+Z','Redo · Ctrl+Shift+Z'),redo,busy||!current.history.canRedo),button('compact',tr('Уплотнить сетку','Compact grid'),()=>changeBlocks(compactLiveBlocks(state().portfolio.blocks)),busy),button('reset',tr('Равные размеры по умолчанию','Reset equal widget sizes'),()=>{if(globalThis.confirm(tr('Восстановить стандартные размеры и снять блокировки?','Reset sizes and unlock widgets?')))changeBlocks(defaultLiveBlocks(state().portfolio.blocks))},busy),preset,button('preview',tr('Глазами посетителя','View as visitor'),preview,busy))
  const hidden=state().portfolio.blocks.filter(b=>!b.visible);if(hidden.length){const add=el('select','studio-select'),placeholder=el('option',null,tr('+ Добавить скрытый блок','+ Restore hidden widget'));placeholder.value='';add.append(placeholder);const names={featured:tr('Закреплённая работа','Featured build'),publications:tr('Опубликованные сборки','Published builds'),collections:tr('Коллекции','Collections'),awards:tr('Достижения','Achievements'),activity:tr('Календарь активности','Activity calendar'),statistics:tr('Статистика','Statistics'),about:tr('О себе','About'),followers:tr('Подписчики','Followers'),metrics:tr('Показатели','Metrics')};for(const item of hidden){const o=el('option',null,names[item.key]);o.value=item.key;add.append(o)}add.disabled=busy;add.setAttribute('aria-label',placeholder.textContent);add.onchange=()=>{if(hidden.some(b=>b.key===add.value))changeWidget(add.value,{visible:true})};toolbar.append(add)}
  status.textContent=busy?tr('Сохранение…','Saving…'):tr('Перетащи свободную область блока. Восемь маркеров меняют размеры. Глаз скрывает блок, замок закрепляет его. Галочка сохраняет изменения.','Drag a free area. Eight handles resize. Eye toggles visibility; lock fixes a widget. Check saves changes.')
 }
 function applyRects(blocks,animate=false){
  if(!grid)return;const by=new Map(blocks.map(b=>[b.key,b.rect]))
  for(const node of grid.children){const rect=by.get(node.getAttribute('data-widget'));if(!rect)continue
   const before=animate?node.getBoundingClientRect():null;setLiveWidgetRect(node,rect)
   if(before&&node.animate&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){const after=node.getBoundingClientRect(),dx=before.left-after.left,dy=before.top-after.top;if(dx||dy)node.animate([{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'translate(0,0)'}],{duration:160,easing:'ease-out'})}
  }
 }
 function cleanupDrag(){if(frame)cancelAnimationFrame(frame);frame=0;if(ghost)ghost.remove();if(target)target.remove();ghost=target=null;const old=drag;drag=null;coords=null;if(old?.node){old.node.classList.remove('is-dragging');try{if(old.capture?.hasPointerCapture(old.pointer))old.capture.releasePointerCapture(old.pointer)}catch{}}}
 function stop(commit){if(!drag)return;const next=drag.next;cleanupDrag();if(commit&&next)changeBlocks(next);else render()}
 function tick(){frame=0;if(!drag||!coords||signal?.aborted)return
  const {clientX,clientY}=coords,margin=70,dy=clientY<margin?-Math.ceil((margin-clientY)/4):clientY>innerHeight-margin?Math.ceil((clientY-(innerHeight-margin))/4):0
  if(dy)window.scrollBy(0,dy)
  const bounds=grid.getBoundingClientRect(),scrollDelta=drag.gridTop-bounds.top,dx=Math.round((clientX-drag.startX)/drag.stepX),vertical=Math.round((clientY-drag.startY+scrollDelta)/drag.stepY)
  let rect=drag.edge?resizeLiveRect(drag.rect,drag.edge,dx,vertical):moveLiveRect(drag.rect,dx,vertical)
  if(drag.mobile){const steps=Math.round((clientY-drag.startY+scrollDelta)/drag.stepY)
   if(drag.edge){rect=resizeLiveRect(drag.rect,drag.edge.replace(/[ew]/g,''),0,steps)}
   else if(Math.hypot(clientX-drag.startX,clientY-drag.startY+scrollDelta)>6){const nearest=drag.mobileCenters.reduce((best,c)=>{const d=Math.abs(clientY-(bounds.top+c.center));return !best||d<best.d?{...c,d}:best},null);const other=drag.source.find(b=>b.key===nearest?.key);rect=other?{...drag.rect,x:Math.min(other.rect.x,12-drag.rect.w),y:other.rect.y}:drag.rect}
  }
  const signature=JSON.stringify(rect);if(signature!==drag.signature){drag.signature=signature;drag.next=resolveLivePlacement(drag.source,drag.key,rect);applyRects(drag.next??drag.source,!drag.mobile)}const next=drag.next
  if(ghost){ghost.style.left=(clientX-drag.offsetX)+'px';ghost.style.top=(clientY-drag.offsetY)+'px';ghost.classList.toggle('is-invalid',!next)}
  if(target){const selected=Array.from(grid.children).find(n=>n.getAttribute('data-widget')===drag.key),box=selected?.getBoundingClientRect();if(box){target.style.left=box.left+'px';target.style.top=box.top+'px';target.style.width=box.width+'px';target.style.height=box.height+'px';target.classList.toggle('is-invalid',!next);if(drag.edge&&next&&ghost){ghost.style.width=box.width+'px';ghost.style.height=box.height+'px';ghost.style.left=box.left+'px';ghost.style.top=box.top+'px'}}}
  if(dy)frame=requestAnimationFrame(tick)
 }
 function begin(e,node,item,edge='',capture=node,force=false){
  if(!current||busy||item.locked||drag||e.button!==0||(!edge&&!force&&isFormTarget(e)))return
  e.preventDefault();e.stopPropagation();const bounds=grid.getBoundingClientRect(),box=node.getBoundingClientRect(),css=getComputedStyle(grid),gap=Number.parseFloat(css.columnGap)||0,rowGap=Number.parseFloat(css.rowGap)||0,row=Number.parseFloat(css.gridAutoRows)||86,mobile=grid.clientWidth<=720
  drag={pointer:e.pointerId,node,key:item.key,rect:{...item.rect},edge,source:state().portfolio.blocks,next:null,gridTop:bounds.top,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-box.left,offsetY:e.clientY-box.top,stepX:(bounds.width+gap)/12,stepY:row+rowGap,capture,mobile,mobileCenters:Array.from(grid.children).filter(n=>n!==node).map(n=>{const b=n.getBoundingClientRect();return {key:n.getAttribute('data-widget'),center:b.top+b.height/2-bounds.top}})}
  node.classList.add('is-dragging');capture.setPointerCapture?.(e.pointerId)
  ghost=node.cloneNode(true);ghost.classList.add('workshop-live-ghost');ghost.inert=true;ghost.setAttribute('aria-hidden','true');ghost.style.width=box.width+'px';ghost.style.height=box.height+'px';ghost.style.left=box.left+'px';ghost.style.top=box.top+'px';ghost.querySelectorAll('.workshop-live-widget-actions,dialog,.workshop-live-resizer').forEach(n=>n.remove());ghost.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));document.body.append(ghost)
  target=el('div','workshop-live-drop-target');document.body.append(target);coords={clientX:e.clientX,clientY:e.clientY};frame=requestAnimationFrame(tick)
 }
 function keyboardMove(e,item,edge=''){
  if(busy||item.locked||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return
  e.preventDefault();const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0
  const rect=edge?resizeLiveRect(item.rect,edge,dx,dy):moveLiveRect(item.rect,dx,dy),next=resolveLivePlacement(state().portfolio.blocks,item.key,rect)
  if(next){changeBlocks(next);grid.querySelector('[data-widget="'+item.key+'"]')?.querySelector(edge?'[data-edge="'+edge+'"]':'.workshop-live-move')?.focus()}
 }
 function decorate(node,item){
  const actions=el('div','workshop-live-widget-actions'),title=node.children[0]?.textContent??item.key
  const move=button('move',tr('Переместить: ','Move: ')+title,()=>{},busy||item.locked);move.classList.add('workshop-live-move');move.onkeydown=e=>keyboardMove(e,item)
  // The explicit move handle and free widget surface use the same drag path.
  move.onpointerdown=e=>{if(item.locked||busy)return;e.stopPropagation();begin(e,node,item,'',move,true)}
  actions.append(move,button(item.visible?'eye':'eyeOff',item.visible?tr('Скрыть блок','Hide widget'):tr('Показать блок','Show widget'),()=>changeWidget(item.key,{visible:!item.visible}),busy),button(item.locked?'lock':'unlock',item.locked?tr('Разблокировать','Unlock'):tr('Закрепить','Lock'),()=>changeWidget(item.key,{locked:!item.locked}),busy))
  if(item.key==='awards'&&progress)actions.append(button('award',tr('Выбрать награды','Choose awards'),()=>openWorkshopAwardPicker({host:surface,lang,progress,selected:state().showcase,onApply:showcase=>change({...state(),showcase})}),busy))
  node.append(actions);node.onpointerdown=e=>begin(e,node,item)
  if(!item.locked)for(const edge of ['n','ne','e','se','s','sw','w','nw']){const grip=el('button','workshop-live-resizer edge-'+edge);grip.type='button';grip.disabled=busy;grip.setAttribute('data-edge',edge);grip.setAttribute('aria-label',tr('Изменить размер ','Resize ')+title+' · '+edge);grip.onpointerdown=e=>begin(e,node,item,edge,grip);grip.onkeydown=e=>keyboardMove(e,item,edge);node.append(grip)}
 }
 function render(){
  toolbarRender();const value=state();grid=renderGrid(value,!!current);if(current){grid.classList.add('is-editing');const by=new Map(value.portfolio.blocks.map(b=>[b.key,b]));for(const node of grid.children){const item=by.get(node.getAttribute('data-widget'));if(item)decorate(node,item)}}
  host.replaceChildren(grid)
 }
 surface.onpointermove=e=>{if(drag&&e.pointerId===drag.pointer){e.preventDefault();coords={clientX:e.clientX,clientY:e.clientY};if(!frame)frame=requestAnimationFrame(tick)}}
 surface.onpointerup=e=>{if(drag&&e.pointerId===drag.pointer){coords={clientX:e.clientX,clientY:e.clientY};if(frame){cancelAnimationFrame(frame);frame=0}tick();stop(true)}}
 surface.onpointercancel=e=>{if(drag&&e.pointerId===drag.pointer)stop(false)}
 surface.addEventListener('lostpointercapture',e=>{if(drag&&e.pointerId===drag.pointer)stop(false)})
 const onKey=e=>{if(!current||busy||signal?.aborted||e.target?.closest?.('input,textarea,select,dialog,[contenteditable]'))return;if(e.key==='Escape'){if(drag)stop(false);else discard();return}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo()}}
 if(globalThis.addEventListener){globalThis.addEventListener('keydown',onKey,{signal});signal?.addEventListener('abort',cleanupDrag,{once:true})}
 render();return {controls,surface}
}
