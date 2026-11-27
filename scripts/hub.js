'use strict';
const tg=window.Telegram?.WebApp;
function syncTheme(){const theme=tg?.colorScheme;if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme;}
syncTheme();tg?.onEvent?.('themeChanged',syncTheme);
const iconPaths={"home":"<path d=\"m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><path d=\"M9 21v-8h6v8\"/>","users":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/>","wallet":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"15\" rx=\"3\"/><path d=\"M3 9h18M16 14h2\"/>","code":"<path d=\"m8 6-6 6 6 6m8-12 6 6-6 6m-2-15-4 18\"/>","server":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"8\" rx=\"2\"/><rect x=\"3\" y=\"13\" width=\"18\" height=\"8\" rx=\"2\"/><path d=\"M7 7h.01M7 17h.01M11 7h6M11 17h6\"/>","award":"<circle cx=\"12\" cy=\"8\" r=\"6\"/><path d=\"m8 13-2 9 6-3 6 3-2-9m-4-8 1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L9 7.3l2-.3z\"/>","rank":"<path d=\"M3 21h18M5 21v-8h4v8m2 0V3h4v18m2 0V9h4v12\"/>","gift":"<rect x=\"3\" y=\"8\" width=\"18\" height=\"4\" rx=\"1\"/><path d=\"M5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3zm0 0h4a3 3 0 1 0-3-3z\"/>","bell":"<path d=\"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0\"/>","refresh":"<path d=\"M20 7v5h-5M4 17v-5h5\"/><path d=\"M5 8a8 8 0 0 1 13-3l2 7M4 12l2 7a8 8 0 0 0 13-3\"/>","cube":"<path d=\"m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10m-5-17 10 5\"/>","link":"<path d=\"m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0\" transform=\"translate(1 0) scale(.9)\"/>","heart":"<path d=\"M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z\"/>","star":"<path d=\"m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z\"/>","cpu":"<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"/><rect x=\"9\" y=\"9\" width=\"6\" height=\"6\" rx=\"1\"/><path d=\"M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3\"/>","activity":"<path d=\"M2 12h5l3-7 4 14 3-7h5\"/>"};
function uiIcon(name){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('class','ico');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const doc=new DOMParser().parseFromString('<svg xmlns="'+ns+'">'+(Object.hasOwn(iconPaths,name)?iconPaths[name]:iconPaths.cube)+'</svg>','image/svg+xml');for(const child of doc.documentElement.children)svg.append(document.importNode(child,true));return svg;}

const $=id=>document.getElementById(id);
let current=null;
async function request(path,data){
 if(!tg?.initData)throw Error('Открой Mini App из личного чата с ботом.');
 const r=await fetch(path,{method:data?'POST':'GET',headers:{'X-Telegram-Init-Data':tg.initData,...(data?{'Content-Type':'application/json'}:{})},credentials:'omit',cache:'no-store',...(data?{body:JSON.stringify(data)}:{})});
 if(r.status===403)throw Error('Открой Mini App заново.');
 if(r.status===409)throw Error(path==='redeem'?'Промокод недействителен, истёк, исчерпан или уже использован.':'Код недействителен, уже использован или аккаунт привязан.');
 if(!r.ok)throw Error('BrickLab Hub пока недоступен.');
 return r.json();
}
function tile(parent,label,value,ico='award',rarity){
 const box=document.createElement('div'),l=document.createElement('span'),v=document.createElement('strong');
 box.className='tile';l.textContent=label;v.textContent=value??'—';if(rarity)box.dataset.rarity=rarity;if(String(value??'—').length>15)box.classList.add('long-value');const icon=document.createElement('div');icon.className='metric-icon';icon.append(uiIcon(ico));box.append(icon,l,v);parent.append(box)
}
function render(d){
 current=d;
 $('pair').hidden=d.linked===true;$('dash').hidden=d.linked!==true;
 if(!d.linked)return;
 $('name').textContent=d.displayName??d.username??'Конструктор';
 $('avatar').textContent=Array.from($('name').textContent.trim()).slice(0,2).join('').toLocaleUpperCase('ru')||'BL';
 $('handle').textContent=d.username?'@'+d.username:'';
 $('plan-name').textContent=d.plus?'BrickLab Plus':'BrickLab Free';$('plus').closest('.membership').dataset.plan=d.plus?'plus':'free';
 const hours=Math.max(0,Math.ceil((Number(d.plusUntil)-Date.now())/3600000));
 $('plus').textContent=d.plus?(Number.isFinite(hours)?'Осталось '+Math.floor(hours/24)+' дн. '+hours%24+' ч.':'Срок недоступен'):'Базовый доступ';
 $('metrics').replaceChildren();for(const [l,v,i] of [['Место в рейтинге',d.rank==null?'Вне рейтинга':'#'+d.rank,'rank'],['Лайки',d.likes,'heart'],['Подписчики',d.followers,'users'],['Подписки',d.following,'users'],['Сборки',d.builds,'cube'],['XP',d.xp,'star']])tile($('metrics'),l,v,i);
 const a=Array.isArray(d.awards)?d.awards:[];$('xp').textContent=a.length+' достижений · '+d.xp+' XP';$('awards').replaceChildren();for(const award of a)tile($('awards'),({common:'Обычное',uncommon:'Необычное',rare:'Редкое',epic:'Эпическое',legendary:'Легендарное'}[award.rarity]??'Награда')+' · '+(award.xp??0)+' XP',award.title??award.id,'award',award.rarity);if(!a.length){const p=document.createElement('p');p.className='empty';p.textContent='Первые достижения ещё впереди.';$('awards').append(p)}
 $('popular').replaceChildren();if(d.popular){const h=document.createElement('h3');h.textContent=d.popular.title;const p=document.createElement('p');p.textContent=d.popular.partCount+' деталей · '+d.popular.likes+' лайков · '+d.popular.views+' просмотров';const art=document.createElement('div');art.className='build-emblem';art.append(uiIcon('cube'));$('popular').append(art,h,p);if(/^[a-f0-9-]{36}$/i.test(d.popular.id)){const a=document.createElement('a');a.className='secondary-button';a.href='https://bricklab-3d.ru/#community/build/'+d.popular.id;a.textContent='Открыть сборку ↗';$('popular').append(a)}}else $('popular').textContent='Пока нет опубликованных сборок.';
 $('rank').textContent=d.rank==null?'Место не отображается для скрытой мастерской.':'Твоё место: #'+d.rank;
 $('ranking').replaceChildren();for(const r of d.top??[]){const row=document.createElement('article');row.className='rank-row feed';row.dataset.podium=String(Number(r.position)<=3);const pos=document.createElement('div');pos.className='rank-position';pos.textContent='#'+r.position;const h=document.createElement('strong');h.textContent=r.displayName;const p=document.createElement('p');p.textContent=r.xp+' XP';row.append(pos,h,p);$('ranking').append(row)}
 $('inbox').replaceChildren();for(const m of d.inbox??[]){const row=document.createElement('article');row.className='feed event-row';const body=document.createElement('div');body.className='event-body';const date=document.createElement('p');date.textContent=new Date(m.sentAt).toLocaleString();const text=document.createElement('div');text.textContent=m.body;body.append(date,text);row.append(uiIcon(({award:'award',follow:'users',likes:'heart',rank:'rank',plus:'star',comment:'bell'})[m.kind]??'gift'),body);$('inbox').append(row)}
 if(!$('inbox').children.length)$('inbox').textContent='Новых событий пока нет.';
 $('marketing').checked=d.marketing===true;$('personal-push').checked=d.personalPush===true;
}
async function load(){
 $('refresh').disabled=true;
 try{render(await request('api'));$('status').textContent='Данные BrickLab обновлены.'}catch(e){current=null;$('dash').hidden=true;$('pair').hidden=true;$('status').textContent=e.message}
 finally{$('refresh').disabled=false}
}
$('refresh').onclick=load;
$('pair-form').onsubmit=async e=>{e.preventDefault();const code=$('pair-code').value.trim();$('pair-code').value='';try{await request('claim',{code});await load()}catch(e){$('status').textContent=e.message}};
$('save-prefs').onclick=async()=>{if(!current?.linked)return;try{const d=await request('preferences',{marketing:$('marketing').checked});if(!d.ok)throw Error('Привязка недоступна.');await load()}catch(e){$('status').textContent=e.message}};
function openTab(tab){for(const t of document.querySelectorAll('[data-tab]'))t.setAttribute('aria-selected',String(t.dataset.tab===tab));for(const p of document.querySelectorAll('[data-page]'))p.hidden=p.dataset.page!==tab;window.scrollTo(0,0)}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>openTab(b.dataset.tab);
for(const b of document.querySelectorAll('[data-go]'))b.onclick=()=>openTab(b.dataset.go);
tg?.ready();tg?.expand();load();request('../role').then(r=>{$('owner').hidden=r.admin!==true}).catch(()=>{});

$('promo-form').onsubmit=async e=>{e.preventDefault();const code=$('promo-code').value.trim().toUpperCase();try{await request('redeem',{code});$('promo-code').value='';await load();$('status').textContent='Промокод активирован.'}catch(err){$('status').textContent=err.message}};

$('save-personal').onclick=async()=>{if(!current?.linked)return;try{const d=await request('personal-preferences',{push:$('personal-push').checked});if(!d.ok)throw Error('Настройки недоступны.');await load()}catch(e){$('status').textContent=e.message}};
