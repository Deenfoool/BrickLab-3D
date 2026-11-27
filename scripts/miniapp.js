'use strict';
const tg=window.Telegram?.WebApp;
const status=document.getElementById('status');
const dashboard=document.getElementById('dashboard');
const refresh=document.getElementById('refresh');
function tiles(id, rows){
  const root=document.getElementById(id);root.replaceChildren();
  for(const [name,value] of rows){
    const box=document.createElement('div');box.className='tile';
    const label=document.createElement('span');label.textContent=name;
    const val=document.createElement('strong');val.textContent=value??'Нет данных';
    box.append(label,val);root.append(box);
  }
}
function chart(days){
  const root=document.getElementById('chart');root.replaceChildren();
  const max=Math.max(1,...days.flatMap(d=>[Number(d.users)||0,Number(d.builds)||0]));
  for(const d of days){
    const row=document.createElement('div');row.className='day';
    const date=document.createElement('span');date.textContent=String(d.day).slice(5,10);
    const group=document.createElement('div');
    for(const [label,value] of [['Аккаунты',d.users],['Сборки',d.builds]]){
      const line=document.createElement('div');line.className='bar';
      const bar=document.createElement('progress');bar.max=max;bar.value=Number(value)||0;
      const caption=document.createElement('span');caption.textContent=label+' '+value;
      line.append(bar,caption);group.append(line);
    }
    row.append(date,group);root.append(row);
  }
}
async function load(){
  dashboard.hidden=true;
  if(!tg?.initData){status.textContent='Откройте панель из личного чата с ботом.';return;}
  refresh.disabled=true;
  try{
    const r=await fetch('api',{headers:{'X-Telegram-Init-Data':tg.initData},cache:'no-store',credentials:'omit'});
    if(r.status===403)throw Error('Откройте панель заново из Telegram.');
    if(!r.ok)throw Error('Снимок сервера недоступен.');
    const d=await r.json(),v=d.vps??{},s=d.stats??{},a=d.analytics??{},o=d.docker??{},e=d.events??{},b=d.backup??{};
    tiles('server',[['API',v.api],['HTTPS',v.https],['CPU',v.cpu],['RAM',v.ram],['Диск',v.disk],['PostgreSQL',o.sql]]);
    tiles('stats',[['Аккаунты',s.users],['Новые 24 ч',s.new_users],['Сборки',s.builds],['Профили',s.profiles],['Реакции',a.likes],['Скачивания',a.downloads]]);
    chart(Array.isArray(a.days)?a.days:[]);
    tiles('ops',[['Контейнер',o.bricklab],['События в очереди',e.pending],['Повторные отправки',e.retrying],['Бэкап БД',b.db],['Бэкап конфигурации',b.config],['Версия',d.release?.commit]]);
    const u=d.upkeep??{}, c=u.cleanup??{};
    tiles('upkeep-tiles',[['Политика очистки',u.cleanup_enabled===true?'Автоматически':u.cleanup_enabled===false?'Предварительный анализ':null],['Диск (макс.)',u.disks?Math.max(...Object.values(u.disks).map(x=>x.used_percent))+'%':null],['Rollback-образы',c.rollback_count],['К удалению',(c.candidates??[]).join(', ')||'—'],['Последняя очистка',c.status],['Измерений за 7 дней',u.samples],['Последний отчёт',u.weekly_sent_at?new Date(u.weekly_sent_at*1000).toLocaleString():null]]);
    document.getElementById('upkeep-note').textContent='Кэш: 7 дней · резерв: 3 версии · тестовые образы защищены · уведомления: 75/85/90%.';
    const f=d.finance??{}, rub=n=>Number.isSafeInteger(n)?(n/100).toLocaleString('ru-RU',{style:'currency',currency:'RUB'}):null;
    const net=(x,y)=>Number.isSafeInteger(x)&&Number.isSafeInteger(y)?rub(x-y):null;
    tiles('finance-tiles',[['Оплаты за 24 ч',f.paid_24h],['Выручка за 24 ч',rub(f.gross_24h)],['Возвраты за 24 ч',rub(f.refund_amount_24h)],['Итого за 24 ч',net(f.gross_24h,f.refund_amount_24h)],['Итого за 7 дней',net(f.gross_7d,f.refund_amount_7d)],['Ожидают оплаты',f.pending],['Чеки ожидают',f.receipts_pending]]);
    tiles('dev-tiles',[['Checkout',d.release?.commit],['Локальный origin',d.release?.tracking],['Отставание',d.release?.behind],['Рабочее дерево',d.release?.worktree],['Утверждённый SHA',d.release?.approved],['Релиз',d.release?.job]]);
    status.textContent='Обновлено '+new Date(d.timestamp*1000).toLocaleTimeString();dashboard.hidden=false;
  }catch(err){status.textContent=err.message||'Ошибка соединения';}
  finally{refresh.disabled=false;}
}
function openTab(tab){
  for(const section of document.querySelectorAll('[data-page]'))section.hidden=section.dataset.page!==tab;
  for(const button of document.querySelectorAll('[data-tab]'))button.setAttribute('aria-selected',String(button.dataset.tab===tab));
}
for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>openTab(button.dataset.tab));
openTab('home');
refresh.addEventListener('click',load);tg?.ready();tg?.expand();load();

const adminStatus=document.getElementById('admin-status');
const adminList=document.getElementById('admin-list');
const adminQuery=document.getElementById('admin-query');
const adminMore=document.getElementById('admin-more');
const adminConfirm=document.getElementById('admin-confirm');
const adminReason=document.getElementById('admin-reason');
let mode='users',nextOffset=null,pending=null,loadingAdmin=false;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const labels={block:'Заблокировать',unblock:'Разблокировать',revoke_sessions:'Завершить сессии',hide_comment:'Скрыть комментарий',dismiss_reports:'Отклонить жалобы',dismiss_build_reports:'Отклонить жалобы',unpublish_build:'Снять публикацию'};
async function adminRequest(path,body){
  if(dashboard.hidden)throw Error('Сначала обновите авторизацию Telegram.');
  // Both Telegram owner authorization and the existing BrickLab admin session are required by this UI.
  const auth=await fetch('api',{headers:{'X-Telegram-Init-Data':tg.initData},cache:'no-store',credentials:'omit'});
  if(!auth.ok)throw Error('Откройте панель заново из Telegram.');
  const r=await fetch('/api/admin'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
  if(r.status===401||r.status===403)throw Error('Войдите в аккаунт администратора BrickLab в этом браузере.');
  if(!r.ok)throw Error('Операция не выполнена: HTTP '+r.status);
  return r.json();
}
function addText(parent,text,tag='p'){
  const element=document.createElement(tag);element.textContent=String(text??'—');parent.append(element);return element;
}
function addAction(parent,action,id){
  if(!uuid.test(id)||!Object.hasOwn(labels,action))return;
  const button=document.createElement('button');button.type='button';button.textContent=labels[action];
  button.onclick=()=>{
    pending={action,id,expires:Date.now()+60000};
    document.getElementById('admin-action-label').textContent=labels[action]+' · '+id;
    adminReason.value='';adminConfirm.hidden=false;adminReason.focus();
  };
  parent.append(button);
}
function rowOf(row){
  const item=document.createElement('article');item.className='admin-row';
  const actions=document.createElement('div');actions.className='admin-controls';
  if(mode==='users'){
    addText(item,row.displayName,'strong');addText(item,row.id);
    addText(item,row.admin?'Администратор':row.blockedAt?'Заблокирован':'Активен');
    if(!row.admin){addAction(actions,row.blockedAt?'unblock':'block',row.id);addAction(actions,'revoke_sessions',row.id);}
  }else if(mode==='build-reports'){
    addText(item,row.title,'strong');addText(item,'Жалоб: '+row.reports);
    addAction(actions,'unpublish_build',row.id);addAction(actions,'dismiss_build_reports',row.id);
  }else if(mode==='reports'){
    addText(item,row.body??'Комментарий удалён','strong');addText(item,'Жалоб: '+row.reports);
    addAction(actions,'hide_comment',row.id);addAction(actions,'dismiss_reports',row.id);
  }else{
    addText(item,row.id,'strong');addText(item,row.area);addText(item,row.summary);
  }
  item.append(actions);return item;
}
async function loadAdmin(offset=0){
  if(loadingAdmin)return;
  loadingAdmin=true;adminMore.hidden=true;pending=null;adminConfirm.hidden=true;
  if(offset===0)adminList.replaceChildren();
  try{
    const query=new URLSearchParams({offset:String(offset),q:adminQuery.value.trim()});
    const result=await adminRequest('/'+mode+'?'+query);
    if(!Array.isArray(result.items))throw Error('Неверный ответ сервера.');
    for(const row of result.items)adminList.append(rowOf(row));
    nextOffset=Number.isInteger(result.nextOffset)?result.nextOffset:null;
    adminMore.hidden=nextOffset===null;
    adminStatus.textContent=result.items.length?'Доступ администратора подтверждён.':'Нет записей.';
  }catch(err){adminStatus.textContent=err.message;}
  finally{loadingAdmin=false;}
}
for(const button of document.querySelectorAll('[data-admin]')){
  button.addEventListener('click',()=>{mode=button.dataset.admin;loadAdmin();});
}
adminQuery.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();loadAdmin();}});
adminMore.addEventListener('click',()=>{if(nextOffset!==null)loadAdmin(nextOffset);});
document.getElementById('admin-cancel').addEventListener('click',()=>{pending=null;adminConfirm.hidden=true;});
adminConfirm.addEventListener('submit',async event=>{
  event.preventDefault();
  const action=pending;pending=null;adminConfirm.hidden=true;
  if(!action||Date.now()>action.expires){adminStatus.textContent='Подтверждение истекло.';return;}
  const reason=adminReason.value.trim();adminReason.value='';
  if(!reason||reason.length>500){adminStatus.textContent='Укажите причину.';return;}
  try{
    await adminRequest('/action',{action:action.action,id:action.id,reason});
    adminStatus.textContent='Действие записано в журнал BrickLab.';
    await loadAdmin();
  }catch(err){adminStatus.textContent=err.message;}
});

const devBranch=document.getElementById('dev-branch'),devStatus=document.getElementById('dev-status'),devTest=document.getElementById('dev-test'),devDeploy=document.getElementById('dev-deploy');
let branchRows=[],currentJob={},devBusy=false,devPoll=null;
const jobErrors={disabled:'Запуск заданий не активирован на VPS.',busy:'Другое задание уже выполняется.',test_required:'Сначала успешно протестируйте этот SHA.',approval_required:'Нужно независимое подтверждение SHA на VPS.',duplicate:'Этот запрос уже обработан.',unavailable:'Служба заданий недоступна.',start_failed:'Не удалось запустить службу.',invalid:'Некорректный запрос.'};
async function jobApi(path,body){
  const r=await fetch(path,{method:body?'POST':'GET',headers:{'X-Telegram-Init-Data':tg?.initData??'',...(body?{'Content-Type':'application/json'}:{})},credentials:'omit',cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});
  if(r.status===403)throw Error('Откройте Mini App заново.');
  const d=await r.json();if(!r.ok||d.error)throw Error(jobErrors[d.error]??'Ошибка службы заданий.');
  return d;
}
function selected(){return branchRows[Number(devBranch.value)]??null;}
function devButtons(){
  const s=selected(),active=['queued','running'].includes(currentJob.status);
  devTest.disabled=devBusy||!s||active;
  devDeploy.disabled=devBusy||!s||active||s.branch!=='feature/cloud-migration'||currentJob.status!=='ok'||currentJob.action!=='test'||currentJob.sha!==s.sha||currentJob.branch!==s.branch;
  document.getElementById('dev-sha').textContent=s?.sha??'';
}
function renderJob(job){
  currentJob=job??{};
  const states={queued:'В очереди',running:'Выполняется',ok:'Успешно',failed:'Ошибка',interrupted:'Прервано'};
  tiles('job-tiles',[['Статус',states[currentJob.status]??'Нет заданий'],['Этап',currentJob.stage],['Ветка',currentJob.branch],['SHA',currentJob.sha],['Ошибки тестов',currentJob.failed_tests],['Код завершения',currentJob.exit_code]]);
  devButtons();
}
async function refreshJob(){
  try{
    const d=await jobApi('jobs');renderJob(d.job);
    devStatus.textContent='Статус обновлён.';
    if(['queued','running'].includes(currentJob.status)){
      clearTimeout(devPoll);devPoll=setTimeout(refreshJob,4000);
    }
  }catch(e){devStatus.textContent=e.message;clearTimeout(devPoll);}
}
document.getElementById('dev-branches').onclick=async()=>{
  if(devBusy)return;devBusy=true;devButtons();
  try{
    const d=await jobApi('branches');branchRows=Array.isArray(d.branches)?d.branches:[];
    devBranch.replaceChildren();branchRows.forEach((b,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=b.branch+' · '+b.sha.slice(0,8);devBranch.append(o);});
    devBranch.disabled=!branchRows.length;await refreshJob();
  }catch(e){devStatus.textContent=e.message;}
  finally{devBusy=false;devButtons();}
};
devBranch.onchange=devButtons;
async function enqueue(action){
  const s=selected();if(!s||devBusy)return;
  if(!window.confirm((action==='test'?'Запустить тесты ':'Развернуть production ')+s.branch+' @ '+s.sha.slice(0,12)+'?'))return;
  devBusy=true;devButtons();
  try{
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    const id=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
    const d=await jobApi('jobs',{action,branch:s.branch,sha:s.sha,id});renderJob(d.job);await refreshJob();
  }catch(e){devStatus.textContent=e.message;}
  finally{devBusy=false;devButtons();}
}
devTest.onclick=()=>enqueue('test');
devDeploy.onclick=()=>enqueue('deploy');
document.getElementById('dev-refresh').onclick=refreshJob;

const promoStatus=document.getElementById('promo-status'),promoList=document.getElementById('promo-list');
async function promoRequest(path,data){
 const r=await fetch(path,{method:data?'POST':'GET',headers:{'X-Telegram-Init-Data':tg?.initData??'',...(data?{'Content-Type':'application/json'}:{})},credentials:'omit',cache:'no-store',...(data?{body:JSON.stringify(data)}:{})});
 if(r.status===403)throw Error('Нужен привязанный аккаунт администратора и свежая авторизация Telegram.');
 if(!r.ok)throw Error('Операция не выполнена: HTTP '+r.status);return r.json();
}
async function loadPromos(){
 try{const d=await promoRequest('promos');promoList.replaceChildren();for(const p of d.items??[]){const row=document.createElement('article');row.className='admin-row';addText(row,p.code,'strong');addText(row,p.days+' дн. · '+p.used+'/'+p.maxUses+' · '+new Date(p.expiresAt).toLocaleDateString());if(!p.disabled){const b=document.createElement('button');b.type='button';b.textContent='Отключить';b.onclick=async()=>{if(!confirm('Отключить '+p.code+'?'))return;try{await promoRequest('promo-disable',{code:p.code});await loadPromos()}catch(e){promoStatus.textContent=e.message}};row.append(b)}else addText(row,'Отключён');promoList.append(row)}promoStatus.textContent='Промокоды загружены.'}catch(e){promoStatus.textContent=e.message}
}
document.getElementById('promo-load').onclick=loadPromos;
document.getElementById('promo-create').onsubmit=async e=>{e.preventDefault();try{const code=document.getElementById('promo-admin-code').value.trim().toUpperCase(),days=Number(document.getElementById('promo-days').value),maxUses=Number(document.getElementById('promo-limit').value),expiresAt=new Date(document.getElementById('promo-expiry').value+'T23:59:59').toISOString();await promoRequest('promo-create',{code,days,maxUses,expiresAt});await loadPromos()}catch(err){promoStatus.textContent=err.message}};

const campaignStatus=document.getElementById('campaign-status'),campaignList=document.getElementById('campaign-list');
async function loadCampaigns(){
 try{const d=await promoRequest('campaigns');campaignList.replaceChildren();campaignStatus.textContent='Подписаны на рассылки: '+d.eligible;
 for(const c of d.items??[]){const row=document.createElement('article');row.className='admin-row';addText(row,new Date(c.sendAt).toLocaleString(),'strong');addText(row,c.body);addText(row,c.status+' · доставлено '+c.sent+'/'+c.total+' · ожидают '+c.pending+' · не доставлено '+c.unsuccessful);
 for(const [action,label] of (c.status==='draft'?[['campaign-test','Тест мне'],['campaign-queue','Подтвердить рассылку'],['campaign-cancel','Отменить']]:c.status==='queued'?[['campaign-cancel','Остановить остаток']]:[])){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{if(!confirm(action==='campaign-test'?'Отправить тест только себе?':action==='campaign-queue'?'Подтвердить отправку согласившимся пользователям?':'Отменить оставшиеся сообщения?'))return;try{await promoRequest(action,{id:c.id});await loadCampaigns();if(action==='campaign-test')campaignStatus.textContent='Тест отправлен владельцу.'}catch(e){campaignStatus.textContent=e.message}};row.append(b)}campaignList.append(row)}
 }catch(e){campaignStatus.textContent=e.message}
}
document.getElementById('campaign-load').onclick=loadCampaigns;
document.getElementById('campaign-create').onsubmit=async e=>{e.preventDefault();try{const body=document.getElementById('campaign-body').value.trim(),raw=document.getElementById('campaign-time').value,sendAt=raw?new Date(raw).toISOString():new Date().toISOString();await promoRequest('campaign-create',{body,sendAt});document.getElementById('campaign-body').value='';await loadCampaigns()}catch(err){campaignStatus.textContent=err.message}};
