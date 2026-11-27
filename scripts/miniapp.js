'use strict';
const tg=window.Telegram?.WebApp;
function syncTheme(){const theme=tg?.colorScheme;if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme;}
syncTheme();tg?.onEvent?.('themeChanged',syncTheme);
const iconPaths={"home":"<path d=\"m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><path d=\"M9 21v-8h6v8\"/>","users":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>","wallet":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"15\" rx=\"3\"/><path d=\"M3 9h18M16 14h2\"/>","code":"<path d=\"m8 6-6 6 6 6m8-12 6 6-6 6m-2-15-4 18\"/>","server":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"8\" rx=\"2\"/><rect x=\"3\" y=\"13\" width=\"18\" height=\"8\" rx=\"2\"/><path d=\"M7 7h.01M7 17h.01M11 7h6M11 17h6\"/>","award":"<circle cx=\"12\" cy=\"8\" r=\"6\"/><path d=\"m8 13-2 9 6-3 6 3-2-9m-4-8 1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L9 7.3l2-.3z\"/>","rank":"<path d=\"M3 21h18M5 21v-8h4v8m2 0V3h4v18m2 0V9h4v12\"/>","gift":"<rect x=\"3\" y=\"8\" width=\"18\" height=\"4\" rx=\"1\"/><path d=\"M5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3zm0 0h4a3 3 0 1 0-3-3z\"/>","bell":"<path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0\"/>","refresh":"<path d=\"M20 7v5h-5M4 17v-5h5\"/><path d=\"M5 8a8 8 0 0 1 13-3l2 7M4 12l2 7a8 8 0 0 0 13-3\"/>","cube":"<path d=\"m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10m-5-17 10 5\"/>","link":"<path d=\"m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0\" transform=\"translate(1 0) scale(.9)\"/>","heart":"<path d=\"M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z\"/>","star":"<path d=\"m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z\"/>","cpu":"<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"/><rect x=\"9\" y=\"9\" width=\"6\" height=\"6\" rx=\"1\"/><path d=\"M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3\"/>","activity":"<path d=\"M2 12h5l3-7 4 14 3-7h5\"/>"};
function uiIcon(name){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('class','ico');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const doc=new DOMParser().parseFromString('<svg xmlns="'+ns+'">'+(iconPaths[name]??iconPaths.cube)+'</svg>','image/svg+xml');for(const child of doc.documentElement.children)svg.append(document.importNode(child,true));return svg;}

const status=document.getElementById('status');
const dashboard=document.getElementById('dashboard');
const refresh=document.getElementById('refresh');
function tiles(id, rows){
  const root=document.getElementById(id);root.replaceChildren();
  const maps={'Аккаунты':'users','Новые 24 ч':'users','Сборки':'cube','Профили':'users','Реакции':'heart','Скачивания':'activity','API':'activity','HTTPS':'activity','CPU':'cpu','RAM':'cpu','Диск':'server','PostgreSQL':'server'};
  for(const [name,value] of rows){
    const box=document.createElement('div');box.className='tile';
    if(maps[name]){const icon=document.createElement('div');icon.className='metric-icon';icon.append(uiIcon(maps[name]));box.append(icon)}
    const label=document.createElement('span');label.textContent=name;
    const val=document.createElement('strong');val.textContent=value??'Нет данных';
    if(String(value??'Нет данных').length>15)box.classList.add('long-value');
    if(value==='OK')box.dataset.tone='good';else if(value==='ошибка')box.dataset.tone='bad';
    box.append(label,val);
    if(['CPU','RAM','Диск (макс.)'].includes(name)&&/^\d+(?:\.\d+)?%$/.test(String(value))){const n=Number.parseFloat(value);if(n>=0&&n<=100){const p=document.createElement('progress');p.max=100;p.value=n;p.setAttribute('aria-label',name);box.dataset.tone=n>=90?'bad':n>=75?'warn':'good';box.append(p)}}
    root.append(box);
  }
}
function chart(days){
  const root=document.getElementById('chart');root.replaceChildren();
  if(!days.length){const p=document.createElement('p');p.className='empty';p.textContent='История активности пока недоступна.';root.append(p);return}
  days=days.slice(-7);
  const legend=document.createElement('div');legend.className='chart-legend';
  for(const [label,cls] of [['Аккаунты','series-a'],['Сборки','series-b']]){const t=document.createElement('span');t.className=cls;t.append(document.createElement('i'),document.createTextNode(label));legend.append(t)}root.append(legend);
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 340 164');svg.setAttribute('class','chart-svg');svg.setAttribute('role','img');
  svg.setAttribute('aria-label',days.map(d=>String(d.day)+': аккаунты '+(d.users??'нет данных')+', сборки '+(d.builds??'нет данных')).join('; '));
  function el(tag,attrs,txt){const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(txt!==undefined)n.textContent=txt;svg.append(n);return n}
  const max=Math.max(1,...days.flatMap(d=>[Number(d.users)||0,Number(d.builds)||0]));
  for(const y of [20,58,96,134])el('line',{x1:5,x2:335,y1:y,y2:y,class:'chart-line'});
  const step=330/days.length,w=Math.min(13,step/3);
  days.forEach((d,i)=>{const x=5+(i+.5)*step;
   for(const [v,offset,cls] of [[d.users,-w-2,'series-a'],[d.builds,2,'series-b']]){if(v==null||!Number.isFinite(Number(v)))continue;const n=Math.max(0,Number(v)),height=n/max*110;el('rect',{x:x+offset,y:134-height,width:w,height,rx:3,class:cls});el('text',{x:x+offset+w/2,y:Math.max(12,130-height),'text-anchor':'middle',class:'chart-number'},String(n))}
   el('text',{x,y:153,'text-anchor':'middle'},String(d.day).slice(5,10));
  });root.append(svg);
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
    const healthy=v.api==='OK'&&v.https==='OK';
    const known=v.api!=null&&v.https!=null;
    document.getElementById('system-state').textContent=healthy?'Всё работает':known?'Нужна проверка':'Нет данных';
    document.getElementById('system-dot').dataset.tone=healthy?'good':known?'bad':'';
    document.getElementById('system-detail').textContent='Локальный API: '+(v.api??'—')+' · HTTPS: '+(v.https??'—')+(v.uptime?' · VPS '+v.uptime:'');
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
for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>{openTab(button.dataset.tab);window.scrollTo(0,0)});
for(const button of document.querySelectorAll('[data-go]'))button.addEventListener('click',()=>{openTab(button.dataset.go);window.scrollTo(0,0)});
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
const audienceNames={all:'Все',plus:'Plus',free:'Free',new:'Новые'};let audienceCounts={};
function audienceCount(){const n=audienceCounts[document.getElementById('campaign-audience').value];document.getElementById('campaign-audience-count').textContent=Number.isInteger(n)?'Сейчас подходит: '+n:'Загрузи рассылки для оценки аудитории.'}
document.getElementById('campaign-audience').onchange=audienceCount;
async function loadCampaigns(){
 try{const d=await promoRequest('campaigns');campaignList.replaceChildren();campaignStatus.textContent='Подписаны на рассылки: '+d.eligible;audienceCounts=d.audiences??{};audienceCount();
 for(const c of d.items??[]){const row=document.createElement('article');row.className='admin-row';addText(row,new Date(c.sendAt).toLocaleString(),'strong');addText(row,c.body);addText(row,(audienceNames[c.audience]??'Все')+' · '+c.status+' · доставлено '+c.sent+'/'+c.total+' · ожидают '+c.pending+' · не доставлено '+c.unsuccessful);
 for(const [action,label] of (c.status==='draft'?[['campaign-test','Тест мне'],['campaign-queue','Подтвердить рассылку'],['campaign-cancel','Отменить']]:c.status==='queued'?[['campaign-cancel','Остановить остаток']]:[])){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{if(!confirm(action==='campaign-test'?'Отправить тест только себе?':action==='campaign-queue'?'Подтвердить отправку согласившимся пользователям?':'Отменить оставшиеся сообщения?'))return;try{await promoRequest(action,{id:c.id});await loadCampaigns();if(action==='campaign-test')campaignStatus.textContent='Тест отправлен владельцу.'}catch(e){campaignStatus.textContent=e.message}};row.append(b)}campaignList.append(row)}
 }catch(e){campaignStatus.textContent=e.message}
}
document.getElementById('campaign-load').onclick=loadCampaigns;
document.getElementById('campaign-create').onsubmit=async e=>{e.preventDefault();try{const body=document.getElementById('campaign-body').value.trim(),raw=document.getElementById('campaign-time').value,sendAt=raw?new Date(raw).toISOString():new Date().toISOString();await promoRequest('campaign-create',{body,sendAt,audience:document.getElementById('campaign-audience').value});document.getElementById('campaign-body').value='';await loadCampaigns()}catch(err){campaignStatus.textContent=err.message}};
