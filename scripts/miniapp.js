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
    status.textContent='Обновлено '+new Date(d.timestamp*1000).toLocaleTimeString();dashboard.hidden=false;
  }catch(err){status.textContent=err.message||'Ошибка соединения';}
  finally{refresh.disabled=false;}
}
refresh.addEventListener('click',load);tg?.ready();tg?.expand();load();
