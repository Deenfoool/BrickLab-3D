
import {createBureauClient,bureauLink,profileId} from './bureau-client.js'
const texts={
 ru:{intro:'Приватные команды и общие проекты. Личные сборки не становятся общими автоматически.',create:'Создать команду',name:'Название команды',refresh:'Обновить',empty:'У тебя пока нет команд или приглашений.',owner:'Владелец',editor:'Редактор',viewer:'Наблюдатель',pending:'Приглашение',accept:'Принять',reject:'Отклонить',leave:'Покинуть команду',confirmLeave:'Покинуть команду? Доступ к общим версиям будет закрыт, локальные копии останутся.',invite:'Пригласить',profile:'Ссылка на публичный профиль или его ID',members:'Участники и приглашения',remove:'Удалить участника',confirmRemove:'Закрыть доступ участнику?',active:'Принято',projects:'Общие сборки',choose:'Выбери локальную сборку',publish:'Создать общий проект из копии',open:'Открыть связанную копию',history:'История версий',download:'Скачать',save:'Сохранить в команду',saved:'Версия сохранена.',newVersion:'Есть более новая версия',current:'Текущая версия',local:'Локальная версия',old:'Открыть отдельную историческую копию',noProjects:'Общих сборок пока нет.',hint:'Изменения сохраняются явно. Проверка новых версий каждые 15 секунд, пока открыт раздел. При конфликте локальная сборка не удаляется. Нет одновременного редактирования деталей.',copyHint:'При открытии создаётся локальная копия. Не сохраняй приватные проекты на общем компьютере.',invalid_bureau:'Проверь название, роль или ссылку.',already_invited:'Этот конструктор уже приглашён.',bureau_limit:'Достигнут лимит команд, участников или проектов.',bureau_forbidden:'Недостаточно прав.',bureau_disabled:'Совместные проекты пока отключены на этом сервере.',bureau_unavailable:'Совместные проекты недоступны.',not_found:'Команда или проект недоступен.',storage_limit:'Достигнут лимит хранилища команды.',revision_limit:'Достигнут лимит версий.',revision_conflict:'Версия уже изменилась. Локальная копия сохранена; открой актуальную отдельно и сравни изменения.',unauthenticated:'Войди заново.',failed:'Не удалось выполнить действие.',linked:'Связь с локальной копией не записана; версия на сервере сохранена.',loading:'Загрузка…',status:'Проверка версий',syncError:'Не удалось проверить версии. Обнови раздел.',inviteHint:'Приглашать можно пользователей с опубликованным профилем. До принятия приглашения проекты недоступны.',viewerHint:'Наблюдатель может читать и скачивать версии, но не сохранять изменения.',back:'К списку команд'},
 en:{intro:'Private teams and shared projects. Personal builds stay private.',create:'Create team',name:'Team name',refresh:'Refresh',empty:'No teams or invitations yet.',owner:'Owner',editor:'Editor',viewer:'Viewer',pending:'Invitation',accept:'Accept',reject:'Decline',leave:'Leave team',confirmLeave:'Leave? Shared access will be revoked; local copies remain.',invite:'Invite',profile:'Public profile URL or ID',members:'Members and invitations',remove:'Remove member',confirmRemove:'Revoke member access?',active:'Accepted',projects:'Shared builds',choose:'Choose a local build',publish:'Create shared project from copy',open:'Open linked copy',history:'Revision history',download:'Download',save:'Save to team',saved:'Revision saved.',newVersion:'Newer revision available',current:'Current revision',local:'Local revision',old:'Open separate historical copy',noProjects:'No shared builds yet.',hint:'Save explicitly. New revisions checked every 15 seconds while this section is open. Conflicts preserve local work. No simultaneous part editing.',copyHint:'Opening creates a local copy. Avoid private builds on shared computers.',invalid_bureau:'Check name, role or link.',already_invited:'Already invited.',bureau_limit:'Team, member or project limit reached.',bureau_forbidden:'Insufficient rights.',bureau_disabled:'Shared projects disabled on this server.',bureau_unavailable:'Shared projects unavailable.',not_found:'Team or project unavailable.',storage_limit:'Team storage limit reached.',revision_limit:'Revision limit reached.',revision_conflict:'A newer revision exists. Local copy preserved; open the latest separately and compare.',unauthenticated:'Sign in again.',failed:'Request failed.',linked:'Saved on server, but local link was not stored.',loading:'Loading…',status:'Revision check',syncError:'Unable to check revisions. Refresh this section.',inviteHint:'Invite users with published profiles. Projects are unavailable until acceptance.',viewerHint:'Viewers can read and download revisions but cannot save.',back:'Back to teams'}
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
export function renderBureauPanel({lang,user,signal,getProjects,openCopy,linkLocal,download,selection,client=createBureauClient()}){
 const t=texts[lang]??texts.ru,root=el('section','bureau-panel'),notice=el('p','account-muted'),content=el('div','bureau-content')
 notice.setAttribute('role','status')
 let busy=false,polling=false,timer,detail=null,watchers=new Map()
 const call=(path='',method='GET',body)=>client.request(path,method,body,signal)
 const error=e=>{if(!signal.aborted)notice.textContent=t[e.code]??t.failed}
 function button(label,fn,primary=false){const b=el('button','workspace-action'+(primary?' primary':''),label);b.type='button';b.onclick=fn;return b}
 function form(label,fields,submit){const f=el('form','workshop-form'),b=el('button','workspace-action primary',label);b.type='submit';f.append(...fields,b);f.onsubmit=e=>{e.preventDefault();void run(async()=>{await submit();await load()})};return f}
 function input(placeholder,max){const n=el('input');n.placeholder=placeholder;n.setAttribute('aria-label',placeholder);n.maxLength=max;n.required=true;return n}
 function roleSelect(value='editor'){const n=el('select');n.setAttribute('aria-label',t.members);for(const k of ['editor','viewer']){const o=el('option',null,t[k]);o.value=k;n.append(o)}n.value=value;return n}
 async function run(fn){if(busy||signal.aborted)return;busy=true;notice.textContent='';root.setAttribute('aria-busy','true');try{await fn()}catch(e){error(e)}finally{busy=false;root.removeAttribute('aria-busy')}}
 function choose(id){selection.id=id;void run(load)}
 function localLink(r,b,p){return {kind:'bureau',ownerId:user.id,bureauId:b.id,id:p.id,revision:p.revision}}
 function path(b,p){return '/'+b.id+'/projects'+(p?'/'+p.id:'')}
 async function poll(){
  if(busy||polling||signal.aborted||!detail||detail.role==='pending')return
  polling=true;const id=detail.id
  try{
   const {bureau}=await call('/'+id)
   if(signal.aborted||busy||detail?.id!==id)return
   if(bureau.role!==detail.role||bureau.projects.length!==detail.projects.length||bureau.projects.some(p=>!watchers.has(p.id))){notice.textContent=t.refresh;return}
   for(const p of bureau.projects){const update=watchers.get(p.id);if(update)update(p.revision)}
  }catch(e){if(!signal.aborted)notice.textContent=t.syncError}
  finally{polling=false}
 }
 signal.addEventListener('abort',()=>clearInterval(timer),{once:true})
 root.append(el('p','account-muted',t.intro),el('p','account-muted',t.hint),notice,content)
 async function load(){
  const {bureaus}=await call()
  if(signal.aborted)return
  if(selection.id&&!bureaus.some(b=>b.id===selection.id))selection.id=null
  detail=selection.id?(await call('/'+selection.id)).bureau:null
  if(signal.aborted)return
  content.replaceChildren();watchers=new Map()
  const header=el('div','community-actions');header.append(button(t.refresh,()=>run(load)))
  if(detail)header.append(button(t.back,()=>choose(null)))
  content.append(header)
  if(!detail){
   const name=input(t.name,80)
   content.append(form(t.create,[name],async()=>{const r=await call('','POST',{name:name.value});selection.id=r.bureau.id}))
   if(!bureaus.length)content.append(el('p','account-muted',t.empty))
   for(const b of bureaus){const row=el('article','account-card');row.append(el('strong',null,b.name),el('p','account-muted',t[b.role]),button(b.name,()=>choose(b.id)));content.append(row)}
   return
  }
  const b=detail,canWrite=['owner','editor'].includes(b.role)
  content.append(el('h3',null,b.name),el('p','account-muted',t[b.role]))
  if(b.role==='pending'){
   content.append(button(t.accept,()=>run(async()=>{await call('/'+b.id+'/respond','POST',{accept:true});await load()}),true),button(t.reject,()=>run(async()=>{await call('/'+b.id+'/respond','POST',{accept:false});selection.id=null;await load()})))
   return
  }
  if(b.role!=='owner')content.append(button(t.leave,()=>{if(confirm(t.confirmLeave))void run(async()=>{await call('/'+b.id+'/leave','POST');selection.id=null;await load()})}))
  if(b.role==='owner'){
   const members=el('section','account-card'),invite=input(t.profile,300),role=roleSelect()
   members.append(el('h3',null,t.members),el('p','account-muted',t.inviteHint),form(t.invite,[invite,role],async()=>{const id=profileId(invite.value);if(!id)throw {code:'invalid_bureau'};await call('/'+b.id+'/invite','POST',{profileId:id,role:role.value})}))
   for(const m of b.members){const row=el('div','bureau-member'),select=roleSelect(m.role);select.onchange=()=>run(async()=>{await call('/'+b.id+'/members/'+m.id,'PUT',{role:select.value});await load()});row.append(el('strong',null,m.displayName),el('span','account-muted',t[m.status]),select,button(t.remove,()=>{if(confirm(t.confirmRemove))void run(async()=>{await call('/'+b.id+'/members/'+m.id,'DELETE');await load()})}));members.append(row)}
   content.append(members)
  }
  if(b.role==='viewer')content.append(el('p','account-muted',t.viewerHint))
  const projects=el('section','account-card');projects.append(el('h3',null,t.projects),el('p','account-muted',t.copyHint))
  if(canWrite){
   const select=el('select');select.required=true;select.setAttribute('aria-label',t.choose)
   const blank=el('option',null,t.choose);blank.value='';select.append(blank)
   for(const r of getProjects()){const o=el('option',null,r.document.name);o.value=r.id;select.append(o)}
   projects.append(form(t.publish,[select],async()=>{const r=getProjects().find(x=>x.id===select.value);if(!r)throw {code:'not_found'};await call(path(b),'POST',{document:r.document})}))
  }
  if(!b.projects.length)projects.append(el('p','account-muted',t.noProjects))
  for(const p of b.projects){
   const row=el('article','account-card'),revision=el('p','account-muted'),history=el('div','bureau-history')
   const copies=getProjects().filter(r=>{const c=bureauLink(r,user.id);return c?.bureauId===b.id&&c.id===p.id})
   const update=n=>{revision.textContent=t.current+': '+n+(copies.some(r=>bureauLink(r,user.id).revision<n)?' · '+t.newVersion:'')}
   watchers.set(p.id,update);update(p.revision)
   row.append(el('strong',null,p.name),revision,button(t.open,()=>run(async()=>{const {project}=await call(path(b,p));if(!signal.aborted)openCopy(project.document,localLink(null,b,project))}),true),
    button(t.download,()=>run(async()=>{const {project}=await call(path(b,p));if(!signal.aborted)download(project.document)})),
    button(t.history,()=>run(async()=>{const {revisions}=await call(path(b,p)+'/revisions');if(signal.aborted)return;history.replaceChildren();for(const rev of revisions){const entry=el('div','bureau-member');entry.append(el('span',null,'v'+rev.revision+' · '+rev.author+' · '+new Date(rev.createdAt).toLocaleString(lang)),button(t.old,()=>run(async()=>{const {project}=await call(path(b,p)+'/revisions/'+rev.revision);if(!signal.aborted)openCopy(project.document)})));history.append(entry)}})))
   if(canWrite)for(const r of copies){const c=bureauLink(r,user.id);const local=el('div','bureau-member');local.append(el('span',null,r.document.name+' · '+t.local+' '+c.revision),button(t.save,()=>run(async()=>{const current=getProjects().find(x=>x.id===r.id),link=bureauLink(current,user.id);if(!link||link.id!==p.id||link.bureauId!==b.id)throw {code:'not_found'};const {project}=await call(path(b,p),'PUT',{expectedRevision:link.revision,document:current.document});if(signal.aborted)return;notice.textContent=linkLocal(current.id,localLink(current,b,project),current.cloud)?t.saved:t.linked;await load()}),true));row.append(local)}
   row.append(history);projects.append(row)
  }
  content.append(projects)
 }
 void run(load)
 timer=setInterval(poll,15000)
 return root
}
