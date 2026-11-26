import {Vector3} from 'three'
import {sharedDelta,mergeShared} from './shared-document.js'
export function mountCollaboration(root,{language,scene,signal,initial,onJoin,read,apply,idle}){
 const ru=language==='ru',tr=(a,b)=>ru?a:b,doc=root.ownerDocument
 const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
 const client=initial?.client??crypto.randomUUID().replaceAll('-','')
 let room=initial?.room??null,baseline=room?.document,revision=room?.revision??0,pending=null,timer,closed=false,paused=false,busy=false,cursor=null,participants=[]
 const badge=el('button','workspace-collaboration');badge.type='button';badge.hidden=!room
 const overlay=el('div','collaboration-cursors');overlay.setAttribute('aria-hidden','true');doc.body.append(overlay)
 root.querySelector('.editor-bar').append(badge)
 const updateBadge=()=>{badge.hidden=!room;badge.textContent=paused?tr('Сессия приостановлена','Session paused'):tr('Вместе','Live')+' · '+participants.length;badge.title=participants.map(p=>p.name).join(', ');badge.dataset.paused=String(paused)}
 const colors=['#7dcaff','#ffd476','#a8efb2','#e2a9ff','#ff9b9b','#86eee4','#f8d2a6','#b6b8ff']
 function renderCursors(){overlay.replaceChildren();if(!room||paused)return;const rect=scene.canvas.getBoundingClientRect();for(const p of participants){if(p.self||!p.cursor)continue;const point=scene.project(new Vector3(...p.cursor));if(!point.visible||point.clientX<rect.left||point.clientX>rect.right||point.clientY<rect.top||point.clientY>rect.bottom)continue;const marker=el('div','collaboration-cursor');marker.style.left=point.clientX+'px';marker.style.top=point.clientY+'px';marker.style.setProperty('--cursor-color',colors[parseInt(p.client.slice(0,2),16)%colors.length]);marker.append(el('span',null,p.name));overlay.append(marker)}}
 let raf
 let lastDraw=0
 function draw(now){if(closed||!room)return;if(now-lastDraw>80){lastDraw=now;renderCursors()}raf=requestAnimationFrame(draw)}
 function startDrawing(){cancelAnimationFrame(raf);raf=requestAnimationFrame(draw)}
 let lastPointer=0
 scene.canvas.addEventListener('pointermove',e=>{if(!room||performance.now()-lastPointer<80)return;lastPointer=performance.now();try{const p=scene.pointer(e,true);cursor=(p.point??p.ground)?.toArray()??null}catch{cursor=null}},{signal})
 scene.canvas.addEventListener('pointerleave',()=>cursor=null,{signal})
 async function api(action,data={}){const response=await fetch('/api/collaboration/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(7000)]),body:JSON.stringify({client,...data})});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error??'unavailable'),{status:response.status});return result}
 function attach(value){room=value;baseline=value.document;revision=value.revision;participants=value.participants??[];paused=false;pending=null;updateBadge();startDrawing();schedule()}
 function pause(reason){paused=true;clearTimeout(timer);badge.title=reason;updateBadge();badge.title=reason;overlay.replaceChildren()}
 function schedule(delay=500){clearTimeout(timer);if(!closed&&room&&!paused)timer=setTimeout(tick,delay)}
 async function tick(){
  if(closed||!room||paused||busy)return
  busy=true
  try{
   if(pending){
    if(!idle())return
    const current=read(),merged=mergeShared(pending.document,sharedDelta(pending.sent,current))
    if(sharedDelta(current,merged).length&&!await apply(merged,current))return
    baseline=pending.document;revision=pending.revision;pending=null
   }
   const canEdit=idle(),sent=read(),operations=canEdit?sharedDelta(baseline,sent):[]
   const value=await api('sync',{roomId:room.roomId,revision,operations,cursor})
   if(closed||!room||paused)return
   participants=value.participants??[];updateBadge()
   if(value.document){pending={document:value.document,revision:value.revision,sent:canEdit?sent:baseline};if(idle()){
     const current=read(),merged=mergeShared(pending.document,sharedDelta(pending.sent,current))
     if(!sharedDelta(current,merged).length||await apply(merged,current)){baseline=pending.document;revision=pending.revision;pending=null}
   }}
  }catch(e){if(!closed&&(e.status===409||e.status===404||e.status===401||e.status===400||e.status===413||['edit_conflict','invalid_part','invalid_shared_geometry','invalid_shared_records'].includes(e.message)))pause(tr('Конфликт или сессия недоступна. Локальная сборка сохранена. Выйди из сессии и присоединись заново.','Conflict or unavailable room. Local build retained. Leave and rejoin.'));else if(!closed){badge.textContent=tr('Связь потеряна…','Reconnecting…')}}
  finally{busy=false;schedule()}
 }
 async function leave(closeRoom=false){
  if(!room)return
  const id=room.roomId;paused=true;clearTimeout(timer)
  try{await api(closeRoom?'close':'leave',{roomId:id})}catch(e){if(closeRoom){pause(tr('Не удалось закрыть сессию.','Could not close session.'));throw e}}
  room=null;baseline=null;pending=null;participants=[];paused=false;overlay.replaceChildren();updateBadge()
 }
 function open(){
  if(closed||doc.querySelector('.collaboration-dialog[open]'))return
  const dialog=el('dialog','collaboration-dialog'),body=el('div','collaboration-content'),status=el('p','collaboration-status')
  const b=(text,fn)=>{const n=el('button','workspace-action',text);n.type='button';n.onclick=fn;return n}
  function build(){
   body.replaceChildren()
   if(room){
    body.append(el('h3',null,tr('Совместная сессия','Live session')),el('p',null,paused?tr('Синхронизация приостановлена. Локальные изменения сохранены.','Sync paused. Local changes retained.'):tr('Участники онлайн: ','Online: ')+participants.length))
    const code=el('input');code.value=room.code;code.readOnly=true;code.setAttribute('aria-label',tr('Код приглашения','Invite code'))
    body.append(code,b(tr('Скопировать код','Copy code'),async()=>{try{await navigator.clipboard.writeText(code.value);status.textContent=tr('Код скопирован','Code copied')}catch{code.select()}}))
    for(const p of participants)body.append(el('p',null,(p.owner?'★ ':'')+p.name+(p.self?tr(' (ты)',' (you)'):'')))
    body.append(b(tr('Выйти из сессии','Leave session'),async()=>{await leave();dialog.close()}))
    if(room.owner)body.append(b(tr('Завершить для всех','End for everyone'),async()=>{if(!confirm(tr('Завершить сессию для всех участников?','End this session for everyone?')))return;try{await leave(true);dialog.close()}catch{status.textContent=tr('Не удалось завершить.','Could not end room.')}}))
   }else{
    body.append(el('h3',null,tr('Совместная сборка','Collaborative build')),el('p',null,tr('Вход в аккаунт обязателен. До 8 участников и 2000 деталей. Сессия временная; у каждого локальная копия.','Sign-in required. Up to 8 participants and 2000 parts. Temporary room; each participant keeps a local copy.')))
    const start=b(tr('Создать сессию из этой сборки','Start room from this build'),async()=>{start.disabled=true;try{if(!idle())throw Error('busy');attach(await api('create',{document:read()}));build()}catch(e){status.textContent=e.status===401?tr('Сначала войди в аккаунт.','Sign in first.'):tr('Не удалось создать сессию: ','Could not create room: ')+e.message}finally{start.disabled=false}})
    const input=el('input');input.placeholder=tr('Код приглашения','Invite code');input.maxLength=32
    const join=b(tr('Присоединиться в новой копии','Join in a new copy'),async()=>{join.disabled=true;try{const value=await api('join',{code:input.value.trim().toLowerCase()});if(!closed){dialog.close();onJoin(value.document,{room:value,client})}}catch(e){status.textContent=e.status===401?tr('Сначала войди в аккаунт.','Sign in first.'):tr('Не удалось войти в сессию. Проверь код.','Could not join. Check the code.');join.disabled=false}})
    body.append(start,input,join)
   }
  }
  dialog.append(body,status,b(tr('Закрыть','Close'),()=>dialog.close()));dialog.addEventListener('close',()=>dialog.remove(),{once:true});doc.body.append(dialog);dialog.showModal();build()
  signal.addEventListener('abort',()=>dialog.remove(),{once:true})
 }
 badge.onclick=open
 if(room){participants=room.participants??[];updateBadge();startDrawing();schedule(850)}
 signal.addEventListener('abort',()=>{closed=true;clearTimeout(timer);cancelAnimationFrame(raf);overlay.remove();badge.remove()},{once:true})
 return {open}
}
