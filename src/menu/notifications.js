import {achievementName,achievementById} from './achievement-catalog.js'
const labels={
 ru:{title:'Уведомления',mark:'Отметить все прочитанными',all:'Перейти в уведомления',guest:'Войди в аккаунт, чтобы увидеть уведомления.',empty:'Уведомлений пока нет',unavailable:'Не удалось загрузить уведомления.',loading:'Загрузка…',award:'Получено достижение',firstCloudSave:'Первая облачная сборка',unread:'Непрочитано',read:'Прочитано',retry:'Обновить'},
 en:{title:'Notifications',mark:'Mark all as read',all:'Go to notifications',guest:'Sign in to see notifications.',empty:'No notifications yet',unavailable:'Could not load notifications.',loading:'Loading…',award:'Achievement earned',firstCloudSave:'First cloud build',unread:'Unread',read:'Read',retry:'Refresh'}
}
export function notificationSummary(items){
 const list=Array.isArray(items)?items:[]
 return {unread:list.filter(n=>n?.read===false).length,recent:[...list].filter(n=>n&&typeof n.at==='string').sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0)).slice(0,8)}
}
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function icon(id){const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(s.namespaceURI,'use');s.setAttribute('class','icon');s.setAttribute('aria-hidden','true');u.setAttribute('href','#'+id);s.append(u);return s}
function button(text,fn,cls='notification-action'){const b=el('button',cls,text);b.type='button';b.onclick=fn;return b}
export function createNotificationPopover({root,trigger,count,panel,onRefresh,onRead,onOpen}){
 let state={lang:'ru',signedIn:false,checked:false,busy:false,items:null,error:false}
 let opened=false
 let seenOwner=null,initialized=false,seen=new Set(),toast=null,timer=null
 function clearToast(){if(timer!==null)clearTimeout(timer);timer=null;toast?.remove();toast=null}
 function chime(){
  try{
   if(localStorage.getItem('bricklab.editor.sound')==='off')return
   const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return
   const ctx=new Audio();if(ctx.state!=='running'){ctx.close().catch(()=>{});return}
   const gain=ctx.createGain();gain.connect(ctx.destination);const now=ctx.currentTime
   gain.gain.setValueAtTime(0.06,now);gain.gain.exponentialRampToValueAtTime(0.001,now+0.65)
   for(const [i,f] of [523.25,659.25,783.99].entries()){const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;o.connect(gain);o.start(now+i*0.12);o.stop(now+0.65)}
   setTimeout(()=>ctx.close().catch(()=>{}),800)
  }catch{}
 }
 function checkAwards(next){
  const owner=next.signedIn?next.userId:null
  if(owner!==seenOwner){seenOwner=owner;initialized=false;seen=new Set();clearToast()}
  if(!owner||!Array.isArray(next.items)||next.error)return
  const valid=next.items.filter(n=>achievementById(n?.award,n?.definition?[n.definition]:[]))
  const fresh=initialized?valid.filter(n=>!seen.has(n.award)&&!n.read):[]
  valid.forEach(n=>seen.add(n.award));initialized=true
  if(!fresh.length)return
  clearToast()
  const a=achievementById(fresh[0].award,fresh[0].definition?[fresh[0].definition]:[]),ru=next.lang==='ru'
  toast=el('aside','achievement-unlock');toast.dataset.rarity=a.rarity;toast.setAttribute('role','status')
  const medal=el('span','achievement-unlock-medal');medal.append(icon(a.icon))
  const copy=el('div','achievement-unlock-copy');copy.append(el('small',null,ru?'ДОСТИЖЕНИЕ ПОЛУЧЕНО':'ACHIEVEMENT UNLOCKED'),el('strong',null,achievementName(a.id,next.lang,[a])),el('span',null,'+'+fresh.reduce((sum,n)=>sum+achievementById(n.award,n.definition?[n.definition]:[]).xp,0)+' XP'+(fresh.length>1?' · +'+(fresh.length-1)+(ru?' наград':' more'):'')))
  const dismiss=button('×',clearToast,'achievement-unlock-close');dismiss.setAttribute('aria-label',ru?'Закрыть':'Dismiss')
  toast.append(medal,copy,dismiss);document.body.append(toast);chime();timer=setTimeout(clearToast,6500)
 }
 function close(focus=false){if(!opened)return;opened=false;panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus()}
 function render(){
  const t=labels[state.lang==='en'?'en':'ru'],{unread,recent}=notificationSummary(state.signedIn?state.items:null)
  count.hidden=unread===0;count.textContent=unread>99?'99+':String(unread)
  trigger.title=t.title;trigger.setAttribute('aria-label',t.title+(unread?' ('+unread+')':''))
  if(!opened)return
  const focused=document.activeElement?.dataset?.noticeAction
  panel.replaceChildren()
  const heading=el('div','notification-heading'),title=el('h2',null,t.title);title.id='notification-heading'
  const mark=button(t.mark,onRead);mark.dataset.noticeAction='read';mark.disabled=!unread||state.busy||!state.signedIn
  heading.append(title,mark);panel.append(heading)
  const list=el('div','notification-list');list.setAttribute('aria-live','polite')
  if(!state.checked&&state.busy)list.append(el('p','notification-empty',t.loading))
  else if(!state.signedIn)list.append(el('p','notification-empty',state.error?t.unavailable:t.guest))
  else if(state.error||!Array.isArray(state.items)){
   list.append(el('p','notification-empty',state.busy?t.loading:t.unavailable))
  }else if(!recent.length)list.append(el('p','notification-empty',t.empty))
  else for(const n of recent){
   const row=el('article','notification-item'+(!n.read?' unread':'')),body=el('div','notification-body')
   const badge=el('span','notification-symbol');badge.append(icon('icon-trophy'))
   body.append(el('strong',null,t.award+': '+achievementName(n.award,state.lang,n.definition?[n.definition]:[])))
   const date=new Date(n.at),time=el('time',null,Number.isFinite(date.getTime())?new Intl.DateTimeFormat(state.lang,{dateStyle:'medium',timeStyle:'short'}).format(date):'')
   if(Number.isFinite(date.getTime()))time.dateTime=date.toISOString()
   body.append(time,el('small',null,n.read?t.read:t.unread));row.append(badge,body)
   if(!n.read){const dot=el('span','notification-dot');dot.setAttribute('aria-hidden','true');row.append(dot)}
   list.append(row)
  }
  panel.append(list)
  if(state.error){const retry=button(t.retry,onRefresh);retry.disabled=state.busy;retry.dataset.noticeAction='retry';panel.append(retry)}
  const footer=button(t.all,()=>{close();onOpen()},'notification-footer');footer.dataset.noticeAction='open';footer.append(icon('down'));panel.append(footer)
  if(focused){const next=panel.querySelector('[data-notice-action="'+focused+'"]');if(next&&!next.disabled)next.focus();else if(focused==='read')footer.focus()}
 }
 trigger.addEventListener('click',()=>{if(opened){close();return}opened=true;panel.hidden=false;trigger.setAttribute('aria-expanded','true');render();onRefresh()})
 document.addEventListener('pointerdown',e=>{if(opened&&!root.contains(e.target))close()})
 document.addEventListener('keydown',e=>{if(opened&&e.key==='Escape'){e.preventDefault();close(true)}})
 return {update(next){checkAwards(next);state=next;render()},close}
}
