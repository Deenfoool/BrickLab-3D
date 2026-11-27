'use strict';
const tg=window.Telegram?.WebApp;
const $=id=>document.getElementById(id);
let current=null;
async function request(path,data){
 if(!tg?.initData)throw Error('Открой Mini App из личного чата с ботом.');
 const r=await fetch(path,{method:data?'POST':'GET',headers:{'X-Telegram-Init-Data':tg.initData,...(data?{'Content-Type':'application/json'}:{})},credentials:'omit',cache:'no-store',...(data?{body:JSON.stringify(data)}:{})});
 if(r.status===403)throw Error('Открой Mini App заново.');
 if(r.status===409)throw Error('Код недействителен, уже использован или аккаунт привязан.');
 if(!r.ok)throw Error('BrickLab Hub пока недоступен.');
 return r.json();
}
function tile(parent,label,value){
 const box=document.createElement('div'),l=document.createElement('span'),v=document.createElement('strong');
 box.className='tile';l.textContent=label;v.textContent=value??'—';box.append(l,v);parent.append(box)
}
function render(d){
 current=d;
 $('pair').hidden=d.linked===true;$('dash').hidden=d.linked!==true;
 if(!d.linked)return;
 $('name').textContent=d.displayName??d.username??'Конструктор';
 const hours=Math.max(0,Math.ceil((Number(d.plusUntil)-Date.now())/3600000));
 $('plus').textContent=d.plus?'BrickLab Plus · осталось '+Math.floor(hours/24)+' дн. '+hours%24+' ч.':'BrickLab Free';
 $('metrics').replaceChildren();for(const [l,v] of [['Место в рейтинге',d.rank==null?'Вне рейтинга':'#'+d.rank],['Лайки',d.likes],['Подписчики',d.followers],['Подписки',d.following],['Сборки',d.builds],['XP',d.xp]])tile($('metrics'),l,v);
 const a=Array.isArray(d.awards)?d.awards:[];$('xp').textContent=a.length+' достижений · '+d.xp+' XP';$('awards').replaceChildren();for(const award of a)tile($('awards'),award.rarity??'Награда',award.title??award.id);
 $('popular').replaceChildren();if(d.popular){const h=document.createElement('h3');h.textContent=d.popular.title;const p=document.createElement('p');p.textContent=d.popular.partCount+' деталей · '+d.popular.likes+' лайков · '+d.popular.views+' просмотров';$('popular').append(h,p)}else $('popular').textContent='Пока нет опубликованных сборок.';
 $('marketing').checked=d.marketing===true;
}
async function load(){
 $('refresh').disabled=true;
 try{render(await request('api'));$('status').textContent='Данные BrickLab обновлены.'}catch(e){current=null;$('dash').hidden=true;$('pair').hidden=true;$('status').textContent=e.message}
 finally{$('refresh').disabled=false}
}
$('refresh').onclick=load;
$('pair-form').onsubmit=async e=>{e.preventDefault();const code=$('pair-code').value.trim();$('pair-code').value='';try{await request('claim',{code});await load()}catch(e){$('status').textContent=e.message}};
$('save-prefs').onclick=async()=>{if(!current?.linked)return;try{const d=await request('preferences',{marketing:$('marketing').checked});if(!d.ok)throw Error('Привязка недоступна.');await load()}catch(e){$('status').textContent=e.message}};
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{for(const t of document.querySelectorAll('[data-tab]'))t.setAttribute('aria-selected',String(t===b));for(const p of document.querySelectorAll('[data-page]'))p.hidden=p.dataset.page!==b.dataset.tab};
tg?.ready();tg?.expand();load();request('../role').then(r=>{$('owner').hidden=r.admin!==true}).catch(()=>{});

$('promo-form').onsubmit=async e=>{e.preventDefault();const code=$('promo-code').value.trim().toUpperCase();try{await request('redeem',{code});$('promo-code').value='';await load();$('status').textContent='Промокод активирован.'}catch(err){$('status').textContent=err.message}};
