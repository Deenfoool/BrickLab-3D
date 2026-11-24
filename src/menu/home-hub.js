const words={
ru:{popular:'Популярное в сообществе',recent:'Новые публикации',following:'От авторов, на которых ты подписан',feature:'Конструкция недели',all:'Все публикации',empty:'Пока нет опубликованных конструкций.',noFollowing:'Новых работ от твоих подписок пока нет.',unavailable:'Сообщество временно недоступно.',loading:'Загрузка…',parts:'дет.',likes:'лайков',featureHint:'Подборка из популярных работ за последние семь дней.',newTitle:'Что нового',history:'История обновлений',support:'Поддержать BrickLab',supportText:'Независимый проект, который развивается благодаря своему сообществу.',donate:'Поддержать разработку',changelog:'История обновлений BrickLab',close:'Закрыть',search:'Найти в BrickLab',hint:'Детали, наборы, сборки и авторы',local:'Мои сборки',cloud:'Облачные сборки',library:'Детали',sets:'Наборы',models:'Сообщество',authors:'Авторы',none:'Ничего не найдено',more:'Все результаты',searching:'Поиск…',error:'Некоторые источники недоступны.',keys:'↑ ↓ — выбор · Enter — открыть · Esc — закрыть',communityUpdate:'Новый просмотрщик, публикации, обложки и управление разрешениями.',previousUpdate:'Единая галерея локальных и облачных сборок, обновлённый профиль и верхняя навигация.'},
en:{popular:'Popular in the community',recent:'New publications',following:'From builders you follow',feature:'Build of the week',all:'All publications',empty:'No published builds yet.',noFollowing:'No recent builds from your follows.',unavailable:'Community temporarily unavailable.',loading:'Loading…',parts:'parts',likes:'likes',featureHint:'A selection from popular builds published within the last seven days.',newTitle:'What’s new',history:'Release history',support:'Support BrickLab',supportText:'An independent project powered by its community.',donate:'Support development',changelog:'BrickLab release history',close:'Close',search:'Search BrickLab',hint:'Parts, sets, builds and builders',local:'My builds',cloud:'Cloud builds',library:'Parts',sets:'Sets',models:'Community',authors:'Builders',none:'No results',more:'All results',searching:'Searching…',error:'Some sources are unavailable.',keys:'↑ ↓ — select · Enter — open · Esc — close',communityUpdate:'New viewer, publishing, covers and access permissions.',previousUpdate:'Unified local and cloud gallery, improved profile and top navigation.'}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
const link=(label,href,cls='hub-link')=>{const n=node('a',cls,label);n.href=href;return n}
const button=(label,fn,cls='workspace-action')=>{const b=node('button',cls,label);b.type='button';b.onclick=fn;return b}
const matching=(text,q)=>String(text??'').toLowerCase().replaceAll('ё','е').includes(q.toLowerCase().replaceAll('ё','е'))
async function get(path,signal){const r=await fetch(path,{signal,credentials:'same-origin',cache:'no-store',redirect:'error'});if(!r.ok)throw Object.assign(Error('request failed'),{status:r.status});return r.json()}
export function chooseHubBuilds(popular,recent,now=Date.now()){
 const valid=items=>Array.isArray(items)?items.filter(b=>b&&uuid.test(b.id)&&typeof b.title==='string'):[]
 const top=valid(popular),fresh=valid(recent),week=top.filter(b=>{const date=Date.parse(b.publishedAt);return Number.isFinite(date)&&date<=now&&date>=now-7*86400000})
 const feature=week[0]??null
 const used=new Set(feature?[feature.id]:[])
 const take=(items,n)=>items.filter(b=>!used.has(b.id)).filter(b=>{if(used.has(b.id))return false;used.add(b.id);return true}).slice(0,n)
 // Only reserve displayed entries, so undisplayed popular models remain eligible for the recent shelf.
 const popularItems=top.filter(b=>!used.has(b.id)).slice(0,3);popularItems.forEach(b=>used.add(b.id))
 const recentItems=fresh.filter(b=>!used.has(b.id)).slice(0,3)
 return {feature,popular:popularItems,recent:recentItems}
}
function buildCard(b,t,feature=false){
 const a=link('', '#community/build/'+b.id,'hub-build'+(feature?' hub-feature-build':''))
 const art=node('div','hub-build-art')
 if(b.imageCount>0){const img=node('img');img.alt='';img.loading='lazy';img.src='/api/community/build/'+b.id+'/image/0';img.onerror=()=>{img.remove();art.classList.add('hub-build-placeholder')};art.append(img)}else art.classList.add('hub-build-placeholder')
 const body=node('div','hub-build-body');body.append(node('strong',null,b.title),node('span','hub-muted',String(b.author??'')),node('span','hub-build-meta',String(b.partCount??0)+' '+t.parts+' · ♥ '+String(b.likes??0)))
 if(feature&&b.description)body.append(node('p','hub-description',b.description))
 a.append(art,body);return a
}
function shelf(title,t){const section=node('section','hub-shelf'),head=node('div','home-section-head'),grid=node('div','hub-build-grid');head.append(node('h2',null,title),link(t.all,'#community'));section.append(head,grid);return {section,grid}}
export async function mountHomeHub(root,{language,signal}){
 const t=words[language]??words.ru
 const popular=shelf(t.popular,t),recent=shelf(t.recent,t),following=shelf(t.following,t),feature=shelf(t.feature,t)
 feature.section.hidden=true;following.section.hidden=true;popular.grid.append(node('p','hub-muted',t.loading))
 const end=node('div','hub-bottom'),news=node('section','hub-info-card'),support=node('section','hub-info-card')
 const dialog=node('dialog','hub-history'),title=node('h2',null,t.changelog);dialog.setAttribute('aria-label',t.changelog)
 dialog.append(title,node('h3',null,'Community 2.0'),node('p',null,t.communityUpdate),node('h3',null,'Cloud Workspace'),node('p',null,t.previousUpdate),button(t.close,()=>dialog.close()))
 const history=button(t.history+' ›',()=>dialog.showModal(),'hub-link')
 news.append(node('h2',null,t.newTitle),node('strong',null,'Community 2.0'),node('p','hub-muted',t.communityUpdate),history)
 const donate=link(t.donate+' ›','https://tips.tips/000482810');donate.target='_blank';donate.rel='noopener'
 support.append(node('h2',null,t.support),node('p','hub-muted',t.supportText),donate);end.append(news,support)
 root.replaceChildren(popular.section,feature.section,recent.section,following.section,end,dialog)
 signal.addEventListener('abort',()=>{if(dialog.open)dialog.close();root.replaceChildren()},{once:true})
 const fill=(grid,items,empty)=>{grid.replaceChildren(...items.map(b=>buildCard(b,t)));if(!items.length)grid.append(node('p','hub-muted',empty))}
 const result=await Promise.allSettled([get('/api/community/builds?sort=popular',signal),get('/api/community/builds?sort=recent',signal),get('/api/community/builds?feed=following&sort=recent',signal)])
 if(signal.aborted)return
 const top=result[0].status==='fulfilled'?result[0].value.builds:[],fresh=result[1].status==='fulfilled'?result[1].value.builds:[]
 const selection=chooseHubBuilds(top,fresh)
 fill(popular.grid,selection.popular,result[0].status==='fulfilled'?t.empty:t.unavailable)
 fill(recent.grid,selection.recent,result[1].status==='fulfilled'?t.empty:t.unavailable)
 if(selection.feature){feature.section.hidden=false;feature.grid.classList.add('hub-feature-grid');feature.grid.append(buildCard(selection.feature,t,true));feature.grid.append(node('p','hub-muted',t.featureHint))}
 if(result[2].status==='fulfilled'){following.section.hidden=false;fill(following.grid,(result[2].value.builds??[]).filter(b=>uuid.test(b.id)).slice(0,3),t.noFollowing)}
}
export function mountHubSearch({language,getProjects,getCloud,openLocal,openCloud,goLibrary,goSets}){
 const t=words[language]??words.ru,dialog=node('dialog','hub-search-dialog'),input=node('input'),results=node('div','hub-search-results'),notice=node('p','hub-muted',t.hint)
 dialog.setAttribute('aria-label',t.search);input.type='search';input.maxLength=100;input.placeholder=t.search;input.setAttribute('aria-label',t.search);notice.setAttribute('role','status')
 const header=node('div','hub-search-head');header.append(input,button('Esc',()=>dialog.close()));dialog.append(header,notice,results,node('p','hub-muted',t.keys));document.body.append(dialog)
 let request,timer,serial=0,selected=-1,entries=[]
 function reset(){request?.abort();clearTimeout(timer);serial++;selected=-1;entries=[];results.replaceChildren()}
 function group(title,items){if(!items.length)return;results.append(node('h3',null,title));for(const item of items){const b=button(item.label,()=>{dialog.close();void item.open()},'hub-search-result');b.setAttribute('aria-label',item.label);results.append(b);entries.push(b)}}
 function move(delta){if(!entries.length)return;selected=(selected+delta+entries.length)%entries.length;entries.forEach((b,i)=>b.classList.toggle('active',i===selected));entries[selected].scrollIntoView({block:'nearest'})}
 async function search(q,generation){
  const controller=new AbortController();request=controller;const {signal}=controller
  const local=getProjects(),cloud=getCloud();group(t.local,local.filter(p=>matching(p.document.name,q)).slice(0,5).map(p=>({label:p.document.name,open:()=>openLocal(p.id)})))
  group(t.cloud,cloud.remote.filter(p=>matching(p.name,q)&&!local.some(r=>r.cloud?.id===p.id&&r.cloud?.ownerId===cloud.ownerId)).slice(0,5).map(p=>({label:p.name,open:()=>openCloud(p.id,cloud.ownerId)})))
  const tasks=await Promise.allSettled([import('../editor/parts-data.js?v=system-complete'),get('/api/community/builds?'+new URLSearchParams({q,sort:'popular'}),signal),get('/api/rebrickable/lego/sets/?'+new URLSearchParams({search:q,page_size:'5'}),signal),get('/api/community',signal)])
  if(signal.aborted||generation!==serial||!dialog.open)return
  if(tasks[0].status==='fulfilled'){const matches=Object.values(tasks[0].value.parts).filter(p=>[p.design,p.ru,p.en,...(p.aliases??[])].some(v=>matching(v,q))).sort((a,b)=>Number(b.design===q)-Number(a.design===q)).slice(0,6);group(t.library,matches.map(p=>({label:p[language]+' · '+p.design,open:()=>goLibrary(p.design)})))}
  if(tasks[1].status==='fulfilled')group(t.models,(tasks[1].value.builds??[]).filter(b=>uuid.test(b.id)).slice(0,5).map(b=>({label:b.title+' · '+b.author,open:()=>{location.hash='#community/build/'+b.id}})))
  if(tasks[2].status==='fulfilled')group(t.sets,(tasks[2].value.results??[]).filter(s=>typeof s.set_num==='string').slice(0,5).map(s=>({label:s.name+' · '+s.set_num,open:()=>goSets(s.set_num)})))
  if(tasks[3].status==='fulfilled')group(t.authors,(tasks[3].value.profiles??[]).filter(p=>uuid.test(p.id)&&matching(p.displayName,q)).slice(0,5).map(p=>({label:p.displayName,open:()=>{location.hash='#community/profile/'+p.id}})))
  group(t.more,[{label:t.library+' — '+q,open:()=>goLibrary(q)},{label:t.sets+' — '+q,open:()=>goSets(q)}])
  notice.textContent=tasks.some(r=>r.status==='rejected')?t.error:entries.length>2?'':t.none
 }
 input.oninput=()=>{reset();const q=input.value.trim();notice.textContent=q?t.searching:t.hint;if(q.length)timer=setTimeout(()=>search(q,serial),350)}
 dialog.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();move(e.key==='ArrowDown'?1:-1)}else if(e.key==='Enter'&&e.target===input&&entries.length){e.preventDefault();entries[Math.max(0,selected)].click()}})
 dialog.addEventListener('close',reset)
 return {open(){if(dialog.open)return;input.value='';notice.textContent=t.hint;dialog.showModal();input.focus()},dispose(){reset();if(dialog.open)dialog.close();dialog.remove()}}
}
