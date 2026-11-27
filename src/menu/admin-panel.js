import {renderAchievementAdmin} from './admin-achievements.js'
import {achievements} from './achievement-catalog.js'

import {AuthError,authOriginAllowed} from './auth-client.js?v=security-1'
const labels={
 ru:{title:'Администрирование BrickLab',intro:'Управление аккаунтами и публичными материалами. Личные сборки и пароли здесь недоступны.',overview:'Обзор',users:'Пользователи',reports:'Жалобы на комментарии','build-reports':'Жалобы на сборки',dismiss_build_reports:'Отклонить жалобы на сборку',copyright:'Авторские права',audit:'Журнал действий',content:'Публикации',verified:'Подтверждённые адреса',blocked:'Заблокированные',builds:'Публичные сборки',profiles:'Публичные профили',search:'Имя или почта',find:'Найти',more:'Ещё',empty:'Нет записей',loading:'Загрузка…',refresh:'Обновить',email:'Почта',admin:'Администратор',unverified:'Почта не подтверждена',active:'Активен',block:'Заблокировать',unblock:'Разблокировать',revoke_sessions:'Завершить сессии',hide_comment:'Скрыть комментарий',dismiss_reports:'Отклонить жалобы',unpublish_build:'Снять публикацию сборки',unpublish_profile:'Снять публичный профиль',reason:'Укажи причину (до 500 символов)',confirm:'Выполнить действие?',target:'Публичный UUID или ссылка на профиль/сборку',warning:'Снятие профиля удаляет его публичные сборки и связанные обсуждения. Личные проекты остаются.',success:'Действие выполнено и записано в журнал.',admin_required:'Недостаточно прав администратора.',admin_protected:'Администраторы защищены от этих действий.',unauthenticated:'Сессия завершилась. Войди заново.',not_found:'Объект не найден.',invalid_admin_action:'Проверь действие, идентификатор и причину.',auth_unavailable:'Сервер недоступен.',failed:'Не удалось выполнить запрос.',comment:'Комментарий',removed:'Текст удалён',spam:'Спам',abuse:'Оскорбления',other:'Другое'},
 en:{title:'BrickLab administration',intro:'Manage accounts and public content. Private builds and passwords are not available here.',overview:'Overview',users:'Users',reports:'Comment reports','build-reports':'Build reports',dismiss_build_reports:'Dismiss build reports',copyright:'Copyright',audit:'Audit log',content:'Publications',verified:'Verified emails',blocked:'Blocked',builds:'Public builds',profiles:'Public profiles',search:'Name or email',find:'Search',more:'More',empty:'No records',loading:'Loading…',refresh:'Refresh',email:'Email',admin:'Administrator',unverified:'Unverified email',active:'Active',block:'Block',unblock:'Unblock',revoke_sessions:'Revoke sessions',hide_comment:'Hide comment',dismiss_reports:'Dismiss reports',unpublish_build:'Unpublish build',unpublish_profile:'Unpublish profile',reason:'Reason (up to 500 characters)',confirm:'Perform this action?',target:'Public UUID or profile/build link',warning:'Unpublishing a profile removes its public builds and related discussions, not private projects.',success:'Action completed and audited.',admin_required:'Administrator access required.',admin_protected:'Administrators are protected from these actions.',unauthenticated:'Session ended. Sign in again.',not_found:'Object not found.',invalid_admin_action:'Check action, identifier and reason.',auth_unavailable:'Server unavailable.',failed:'Request failed.',comment:'Comment',removed:'Text removed',spam:'Spam',abuse:'Abuse',other:'Other'}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function adminTarget(value){
 const s=String(value).trim(),m=/(?:^|[#/])community\/(?:build|profile)\/([0-9a-f-]{36})\/?$/i.exec(s);const id=m?.[1]??s;return uuid.test(id)?id:null
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
export function renderAdminPanel({lang='ru',signal,initialMode='overview',initialQuery='',fetcher=globalThis.fetch,location=globalThis.location}){
 const t={...(labels[lang]??labels.ru),bugs:lang==='ru'?'Баг-репорты':'Bug reports',bugSearch:lang==='ru'?'ID отчёта':'Report ID',grant_achievement:lang==='ru'?'Выдать достижение':'Grant achievement',confirm_bug:lang==='ru'?'Подтвердить баг':'Confirm bug',confirmed:lang==='ru'?'Подтверждён':'Confirmed'},root=el('section','admin-panel'),notice=el('p','account-muted'),tabs=el('div','community-actions'),content=el('div','admin-content'),more=el('button','workspace-action',t.more)
 notice.setAttribute('role','status');more.type='button';more.hidden=true
 const modes=['overview','users','achievements','reports','build-reports','bugs','content','audit'];let mode=modes.includes(initialMode)?initialMode:'overview',offset=0,q=uuid.test(initialQuery)?initialQuery:'',busy=false,serial=0
 const controls=new Map();let definitions=[];t.achievements=lang==='ru'?'Достижения':'Achievements';t.create_achievement=lang==='ru'?'Создание достижения':'Achievement created'
 async function call(path='',method='GET',body){
  if(!authOriginAllowed(location))throw new AuthError('https_required')
  const r=await fetcher('/api/admin'+path,{method,signal,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const d=await r.json();if(!r.ok)throw new AuthError(d.error??'auth_unavailable',r.status);return d
 }
 function button(label,fn){const b=el('button','workspace-action',label);b.type='button';b.onclick=fn;return b}
 const error=e=>{if(!signal.aborted)notice.textContent=t[e.code]??t.failed}
 async function action(key,id,reasonValue,award){
  if(busy||signal.aborted)return
  const reason=reasonValue??prompt(t.reason)
  if(!reason?.trim())return
  if(reason.trim().length>500){notice.textContent=t.invalid_admin_action;return}
  if(!confirm(t.confirm+' '+t[key]))return
  busy=true
  try{await call('/action','POST',{action:key,id,reason:reason.trim(),...(award?{award}:{})});await load(true);if(!signal.aborted)notice.textContent=t.success}
  catch(e){error(e)}finally{busy=false}
 }
 function item(r){
  const row=el('article','account-card')
  if(mode==='users'){
   row.append(el('strong',null,r.displayName),el('p','account-muted',r.email),el('p','account-muted',r.id),el('p',null,(r.admin?t.admin+' · ':'')+(r.verifiedAt?t.verified:t.unverified)+' · '+(r.blockedAt?t.blocked:t.active)))
   if(r.publicId&&uuid.test(r.publicId)){const a=el('a','workspace-action',lang==='ru'?'Публичный профиль':'Public profile');a.href='#community/profile/'+r.publicId;row.append(a)}
   if(!r.blockedAt){const select=el('select');select.setAttribute('aria-label',t.grant_achievement);for(const a of [...achievements,...definitions].filter(a=>a.metric===null)){const option=el('option',null,a[lang==='ru'?'ru':'en']);option.value=a.id;select.append(option)}row.append(select,button(t.grant_achievement,()=>action('grant_achievement',r.id,undefined,select.value)))}
   if(!r.admin)row.append(button(t[r.blockedAt?'unblock':'block'],()=>action(r.blockedAt?'unblock':'block',r.id)),button(t.revoke_sessions,()=>action('revoke_sessions',r.id)))
  }else if(mode==='bugs'){
   row.append(el('strong',null,r.area),el('p','account-muted',r.id+' · '+new Date(r.createdAt).toLocaleString(lang)),el('p','community-comment-text',r.summary),r.confirmedAt?el('span','account-muted',t.confirmed):button(t.confirm_bug,()=>action('confirm_bug',r.id)))
  }else if(mode==='reports'){
   const link=el('a','community-author',t.comment+' · '+r.author);link.href='#community/build/'+r.buildId
   row.append(link,el('p','community-comment-text',r.body??t.removed),el('p','account-muted',r.reports+' · '+r.reasons.map(x=>t[x]??x).join(', ')),button(t.hide_comment,()=>action('hide_comment',r.id)),button(t.dismiss_reports,()=>action('dismiss_reports',r.id)))
  }else if(mode==='build-reports'){
   const link=el('a','community-author',r.title+' · '+r.author);link.href='#community/build/'+r.id
   row.append(link,el('p','community-comment-text',r.description),el('p','account-muted',r.reports+' · '+r.reasons.map(x=>t[x]??x).join(', ')),button(t.unpublish_build,()=>action('unpublish_build',r.id)),button(t.dismiss_build_reports,()=>action('dismiss_build_reports',r.id)))
  }else row.append(el('strong',null,t[r.action]??r.action),el('p',null,r.reason),el('p','account-muted',r.targetId+' · '+new Date(r.createdAt).toLocaleString(lang)),el('p','account-muted',r.actorId??'—'))
  return row
 }
 async function load(reset=true){
  const version=++serial;if(reset){offset=0;content.replaceChildren()}more.hidden=true;notice.textContent=t.loading
  if(mode==='content'){
   const form=el('form','workshop-form'),id=el('input'),reason=el('textarea'),select=el('select'),send=el('button','workspace-action primary',t.confirm)
   id.required=true;id.maxLength=300;id.placeholder=t.target;id.setAttribute('aria-label',t.target);reason.required=true;reason.maxLength=500;reason.placeholder=t.reason;reason.setAttribute('aria-label',t.reason)
   for(const key of ['unpublish_build','unpublish_profile']){const option=el('option',null,t[key]);option.value=key;select.append(option)}
   send.type='submit';form.append(el('p','account-muted',t.warning),select,id,reason,send)
   form.onsubmit=e=>{e.preventDefault();const target=adminTarget(id.value);if(!target){notice.textContent=t.invalid_admin_action;return}void action(select.value,target,reason.value)}
   content.append(form);notice.textContent='';return
  }
  try{
   if(mode==='achievements'){const {items}=await call('/achievements');if(signal.aborted||version!==serial)return;definitions=items;content.append(renderAchievementAdmin({lang,definitions,signal,create:async data=>{await call('/achievements','POST',data);if(!signal.aborted)await load(true)}}));notice.textContent='';return}
   if(mode==='users'){const {items}=await call('/achievements');if(signal.aborted||version!==serial)return;definitions=items}
   if(mode==='overview'){
    const {overview}=await call();if(signal.aborted||version!==serial)return
    const grid=el('div','admin-metrics')
    for(const k of ['users','verified','blocked','profiles','builds','reports']){const x=el('div','account-card');x.append(el('strong',null,String(overview[k]??0)),el('span','account-muted',t[k]));grid.append(x)}
    content.append(grid)
   }else{
    if(['users','bugs'].includes(mode)&&reset){const form=el('form','community-actions'),search=el('input'),submit=el('button','workspace-action primary',t.find);search.placeholder=mode==='bugs'?t.bugSearch:t.search;search.setAttribute('aria-label',search.placeholder);search.maxLength=100;search.value=q;submit.type='submit';form.append(search,submit);form.onsubmit=e=>{e.preventDefault();q=search.value.trim();void load(true)};content.append(form)}
    const result=await call('/'+mode+'?'+new URLSearchParams({offset:String(offset),q}));if(signal.aborted||version!==serial)return
    for(const r of result.items)content.append(item(r))
    if(!result.items.length)content.append(el('p','account-muted',t.empty))
    offset=result.nextOffset??0;more.hidden=result.nextOffset===null
   }
   notice.textContent=''
  }catch(e){if(version===serial)error(e)}
 }
 for(const key of modes){const b=button(t[key],()=>{if(busy)return;mode=key;q='';for(const [k,c] of controls)c.setAttribute('aria-pressed',String(k===key));void load(true)});b.setAttribute('aria-pressed',String(key===mode));controls.set(key,b);tabs.append(b)}
 more.onclick=()=>load(false);tabs.append(button(t.refresh,()=>{if(!busy)void load(true)}))
 root.append(el('p','account-muted',t.intro),tabs,notice,content,more);void load();return root
}
