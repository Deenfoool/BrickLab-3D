import {parseProject} from '../projects/documents.js'
import {readPreference} from './preferences.js?v=full-settings'
const copy={
 ru:{intro:'Открывай модели других конструкторов и делись своими сборками.',models:'Сборки',builders:'Конструкторы',search:'Название, автор или описание',find:'Найти',all:'Все категории',vehicles:'Транспорт',mechanisms:'Механизмы',architecture:'Архитектура',robots:'Роботы',other:'Другое',recent:'Сначала новые',oldest:'Сначала старые',name:'По названию',parts:'По количеству деталей',partCount:'деталей',more:'Показать ещё',loading:'Загрузка…',empty:'Ничего не найдено',disabled:'Сообщество пока не открыто на этом сервере.',failed:'Не удалось загрузить данные. Попробуй обновить страницу.',missing:'Публикация недоступна или была снята.',back:'К галерее',open:'Открыть в редакторе',download:'Скачать .bricklab',author:'Автор',revision:'Ревизия',preview:'Построить 3D-миниатюру',noPreview:'Миниатюра недоступна',previewLimit:'Для большой модели доступно открытие в редакторе',opening:'Загрузка модели…',manage:'Личный кабинет',copyHint:'Будет создана независимая локальная копия.'},
 en:{intro:'Explore builds by other constructors and share your own.',models:'Builds',builders:'Builders',search:'Title, author or description',find:'Search',all:'All categories',vehicles:'Vehicles',mechanisms:'Mechanisms',architecture:'Architecture',robots:'Robots',other:'Other',recent:'Newest first',oldest:'Oldest first',name:'By title',parts:'By part count',partCount:'parts',more:'Load more',loading:'Loading…',empty:'No results',disabled:'Community is not open on this server yet.',failed:'Could not load data. Refresh and retry.',missing:'Publication unavailable or removed.',back:'Back to gallery',open:'Open in editor',download:'Download .bricklab',author:'Author',revision:'Revision',preview:'Render 3D thumbnail',noPreview:'Thumbnail unavailable',previewLimit:'Large build: open in editor to view',opening:'Loading build…',manage:'My account',copyHint:'Creates an independent local copy.'}
}
Object.assign(copy.ru,{viewer:'3D-просмотр',viewerClose:'Закрыть',viewerReset:'Сбросить камеру',viewerFull:'На весь экран',viewerExitFull:'Выйти из полного экрана',viewerZoomIn:'Приблизить',viewerZoomOut:'Отдалить',viewerHelp:'Перетаскивай модель для вращения, колесо — масштаб, правая кнопка — перемещение. На телефоне — жесты двумя пальцами.',viewerUnavailable:'3D-просмотр недоступен. Можно открыть модель в редакторе.',viewerPartial:'Отображено деталей:',viewerLimit:'Просмотр поддерживает до 600 деталей и 120 уникальных артикулов.'})
Object.assign(copy.en,{viewer:'3D viewer',viewerClose:'Close',viewerReset:'Reset camera',viewerFull:'Fullscreen',viewerExitFull:'Exit fullscreen',viewerZoomIn:'Zoom in',viewerZoomOut:'Zoom out',viewerHelp:'Drag to rotate, scroll to zoom, right drag to pan. On mobile, use two-finger gestures.',viewerUnavailable:'3D viewer unavailable. Open the build in the editor instead.',viewerPartial:'Rendered parts:',viewerLimit:'Viewer supports up to 600 parts and 120 unique designs.'})
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function communityRoute(route){const m=/^community\/(build|profile)\/([^/]+)$/.exec(route);return route==='community'?{type:'list'}:m&&uuid.test(m[2])?{type:m[1],id:m[2]}:{type:'missing'}}
export function previewDocument(doc){
 if(!Array.isArray(doc?.parts)||!doc.parts.length||doc.parts.length>600||new Set(doc.parts.map(p=>p?.design)).size>120)return null
 const valid=(v,n,max)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isFinite(x)&&Math.abs(x)<=max)
 if(doc.parts.some(p=>!p||!['string','number'].includes(typeof p.design)||!/^[a-zA-Z0-9_-]{1,40}$/.test(String(p.design))))return null
 return {format:'bricklab-3d',version:1,name:doc.name,parts:doc.parts.map((p,i)=>({id:'preview-'+i,design:String(p.design),...(valid(p.position,3,1000000)?{position:p.position}:{}),...(valid(p.rotation,4,2)?{rotation:p.rotation}:{}),...(typeof p.color==='string'&&/^#[0-9a-f]{6}$/i.test(p.color)?{color:p.color}:{}),mirrored:p.mirrored===true})),connections:[],gears:[]}
}
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n}
function button(label,fn,cls='workspace-action'){const b=el('button',cls,label);b.type='button';b.onclick=fn;return b}
function link(label,href,cls='workspace-action'){const a=el('a',cls,label);a.href=href;return a}
function icon(id){const s=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(s.namespaceURI,'use');s.setAttribute('class','icon');s.setAttribute('aria-hidden','true');u.setAttribute('href','#'+id);s.append(u);return s}
async function request(path,signal,raw=false){
 const r=await fetch(path,{signal,credentials:'omit',cache:'no-store',redirect:'error'})
 if(!r.ok){const e=new Error('Request failed');e.status=r.status;throw e}
 if(raw){if(Number(r.headers.get('content-length'))>4194304)throw Error('Model too large');const text=await r.text();if(text.length>4194304)throw Error('Model too large');return parseProject(text)}
 return r.json()
}
export async function openPublishedCopy(id,signal,openCopy,load=request){
 if(!uuid.test(id))throw Error('Invalid publication ID')
 if(signal.aborted)return
 const doc=await load('/community/build/'+id+'/download',signal,true)
 if(!signal.aborted)return openCopy(doc)
}
export async function mountCommunity(root,{language='ru',route='community',signal,openCopy}){
 const t=copy[language]??copy.ru,view=communityRoute(route),urls=new Set()
 let observer,work=Promise.resolve(),previewJobs=0,epoch=0,activeRequest=null,activeViewer=null
 const clearPreviews=()=>{observer?.disconnect();observer=null;epoch++;for(const u of urls)URL.revokeObjectURL(u);urls.clear()}
 signal.addEventListener('abort',()=>{clearPreviews();activeRequest?.abort();activeViewer?.()},{once:true})
 const status=el('p','account-muted');status.setAttribute('role','status')
 const fail=e=>{if(!signal.aborted)status.textContent=e.status===503?t.disabled:e.status===404?t.missing:t.failed}
 const artFor=(b,large=false)=>{
  const art=el('div','community-art'+(large?' large':''));art.append(icon('layers'))
  const run=button(t.preview,()=>queue(), 'workspace-action community-preview-button')
  art.append(run)
  let queued=false
  function queue(){
   if(queued||signal.aborted)return
   queued=true;observer?.unobserve(art);run.disabled=true;run.textContent=t.loading
   const generation=epoch
   work=work.catch(()=>{}).then(async()=>{
    if(signal.aborted||generation!==epoch||!art.isConnected)return
    let renderer
    try{
      const d=await request('/community/build/'+b.id+'/download',signal,true),safe=previewDocument(d)
      if(!safe){run.textContent=t.previewLimit;return}
      const {createProjectPreviewRenderer}=await import('../editor/project-preview.js?v=contact-shadow')
      if(signal.aborted||generation!==epoch)return
      renderer=createProjectPreviewRenderer()
      const blob=await renderer.render(safe,signal)
      if(!blob||signal.aborted||generation!==epoch){run.textContent=t.noPreview;return}
      const url=URL.createObjectURL(blob);urls.add(url);const image=el('img');image.src=url;image.alt=b.title;art.replaceChildren(image)
    }catch{if(!signal.aborted)run.textContent=t.noPreview}
    finally{renderer?.dispose()}
   })
  }
  if(readPreference('previews')!=='off'&&b.partCount>0&&b.partCount<=600&&typeof IntersectionObserver==='function'){
   if(!observer)observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting&&previewJobs<8){previewJobs++;const f=e.target._bricklabPreview;if(f)f()}},{rootMargin:'100px'})
   art._bricklabPreview=queue;observer.observe(art)
  }
  return art
 }
 async function showViewer(b){
  if(signal.aborted||activeViewer)return
  const controller=new AbortController(),dialog=el('dialog','community-viewer-dialog'),bar=el('div','community-viewer-toolbar'),title=el('h2',null,b.title),host=el('div','community-viewer-stage'),message=el('p','community-viewer-status',t.loading)
  const headingId='community-viewer-title';title.id=headingId;dialog.setAttribute('aria-labelledby',headingId)
  let session,closed=false
  const controls=el('div','community-viewer-controls')
  const minus=button('−',()=>session?.zoom(1.25)),plus=button('+',()=>session?.zoom(.8)),reset=button(t.viewerReset,()=>session?.reset())
  minus.setAttribute('aria-label',t.viewerZoomOut);plus.setAttribute('aria-label',t.viewerZoomIn)
  const full=button(t.viewerFull,async()=>{
   if(document.fullscreenElement===dialog)await document.exitFullscreen?.().catch(()=>{})
   else if(dialog.requestFullscreen){try{await dialog.requestFullscreen()}catch{dialog.classList.toggle('expanded')}}
   else dialog.classList.toggle('expanded')
   updateFull()
  })
  function updateFull(){full.textContent=document.fullscreenElement===dialog||dialog.classList.contains('expanded')?t.viewerExitFull:t.viewerFull}
  const close=button(t.viewerClose,finish)
  function finish(){
   if(closed)return;closed=true;controller.abort();session?.dispose()
   document.removeEventListener('fullscreenchange',updateFull)
   if(document.fullscreenElement===dialog)void document.exitFullscreen?.().catch(()=>{})
   if(dialog.open)dialog.close()
   dialog.remove();activeViewer=null
  }
  activeViewer=finish
  document.addEventListener('fullscreenchange',updateFull)
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish()})
  dialog.addEventListener('close',finish)
  for(const control of [minus,plus,reset])control.disabled=true
  controls.append(minus,plus,reset,full,close);bar.append(title,controls)
  message.setAttribute('role','status');dialog.append(bar,host,message,el('p','community-viewer-help',t.viewerHelp));root.append(dialog)
  try{
   dialog.showModal()
   const doc=await request('/community/build/'+b.id+'/download',controller.signal,true),safe=previewDocument(doc)
   if(!safe){message.textContent=t.viewerLimit;return}
   const {mountModelViewer}=await import('./community-viewer.js?v=viewer-1')
   controller.signal.throwIfAborted()
   session=await mountModelViewer(host,safe,{signal:controller.signal,onProgress:(n,total)=>{message.textContent=t.loading+' '+n+'/'+total}})
   if(closed){session.dispose();return}
   message.textContent=session.shown<session.total?t.viewerPartial+' '+session.shown+'/'+session.total:''
   for(const control of [minus,plus,reset])control.disabled=false
  }catch(e){if(!closed)message.textContent=t.viewerUnavailable}
 }
 function buildCard(b,detail=false){
  const card=el('article','community-card'+(detail?' community-detail':'')),art=artFor(b,detail),body=el('div','community-card-body')
  const title=detail?el('h2',null,b.title):link(b.title,'#community/build/'+b.id,'community-title')
  const meta=el('div','community-meta'),author=link(b.author,'#community/profile/'+b.authorId,'community-author')
  meta.append(author,el('span',null,b.partCount+' '+t.partCount),el('span',null,t[b.category]??t.other),el('span',null,t.revision+' '+b.revision))
  const description=el('p','community-description',b.description)
  const actions=el('div','community-actions')
  const open=button(t.open,async()=>{
    if(open.disabled||signal.aborted)return
    open.disabled=true;open.textContent=t.opening;status.textContent=''
    try{await openPublishedCopy(b.id,signal,openCopy)}
    catch(e){fail(e)}
    finally{if(!signal.aborted){open.disabled=false;open.textContent=t.open}}
  },'workspace-action primary')
  open.title=t.copyHint;actions.append(open)
  const viewButton=button(t.viewer,()=>showViewer(b));viewButton.disabled=b.partCount===0||b.partCount>600;if(viewButton.disabled)viewButton.title=t.viewerLimit;actions.append(viewButton)
  const download=link(t.download,'/community/build/'+b.id+'/download');download.download='';actions.append(download)
  body.append(title,meta,description,actions);card.append(art,body);return card
 }
 function builderCard(p){const a=el('article','community-card community-builder'),avatar=el('div','account-avatar',Array.from(p.displayName).slice(0,2).join('').toUpperCase()),body=el('div','community-card-body');body.append(link(p.displayName,'#community/profile/'+p.id,'community-title'),el('p','community-description',p.bio));a.append(avatar,body);return a}
 root.replaceChildren()
 const heading=el('div','community-heading');heading.append(el('p','account-muted',t.intro),link(t.manage,'#account'));root.append(heading,status)
 if(view.type==='missing'){status.textContent=t.missing;return}
 if(view.type==='build'||view.type==='profile'){
  root.prepend(link(t.back,'#community'))
  status.textContent=t.loading
  try{
   if(view.type==='build'){const {build}=await request('/api/community/build/'+view.id,signal);if(!signal.aborted){status.textContent='';root.append(buildCard(build,true))}}
   else{const {profile}=await request('/api/community/profile/'+view.id,signal);if(signal.aborted)return;status.textContent='';root.append(builderCard(profile),el('h2',null,t.models));const grid=el('div','community-grid');root.append(grid);const {builds}=await request('/api/community/builds?author='+view.id,signal);if(signal.aborted)return;for(const b of builds)grid.append(buildCard(b));if(!builds.length)grid.append(el('p','account-muted',t.empty))}
  }catch(e){fail(e)}
  return
 }
 const tabs=el('div','community-actions'),filters=el('form','community-filters'),grid=el('div','community-grid'),more=button(t.more,()=>load(false))
 let mode='models',offset=0,serial=0
 const models=button(t.models,()=>switchMode('models')),builders=button(t.builders,()=>switchMode('builders'))
 tabs.append(models,builders)
 const search=el('input');search.type='search';search.maxLength=100;search.placeholder=t.search;search.setAttribute('aria-label',t.search)
 function select(entries,label){const n=el('select');n.setAttribute('aria-label',label);for(const [v,text] of entries){const option=el('option',null,text);option.value=v;n.append(option)}return n}
 const category=select([['',t.all],...['vehicles','mechanisms','architecture','robots','other'].map(k=>[k,t[k]])],t.all),sort=select(['recent','oldest','name','parts'].map(k=>[k,t[k]]),t.recent)
 const submit=el('button','workspace-action primary',t.find);submit.type='submit';filters.append(search,category,sort,submit)
 filters.onsubmit=e=>{e.preventDefault();load(true)};category.onchange=sort.onchange=()=>load(true)
 root.append(tabs,filters,grid,more);more.hidden=true
 function switchMode(next){mode=next;models.setAttribute('aria-pressed',String(mode==='models'));builders.setAttribute('aria-pressed',String(mode==='builders'));filters.hidden=mode!=='models';load(true)}
 async function load(reset){
  const version=++serial;activeRequest?.abort();activeRequest=new AbortController()
  const requestSignal=activeRequest.signal
  if(reset){offset=0;clearPreviews();previewJobs=0;grid.replaceChildren()}
  more.hidden=true;status.textContent=t.loading
  try{
   if(mode==='builders'){
    const {profiles}=await request('/api/community',requestSignal);if(signal.aborted||version!==serial)return
    for(const p of profiles)grid.append(builderCard(p))
   }else{
    const qs=new URLSearchParams({q:search.value.trim(),category:category.value,sort:sort.value,offset:String(offset)})
    const result=await request('/api/community/builds?'+qs,requestSignal);if(signal.aborted||version!==serial)return
    for(const b of result.builds)grid.append(buildCard(b))
    offset=result.nextOffset??0;more.hidden=result.nextOffset===null
   }
   status.textContent=grid.childElementCount?'':t.empty
  }catch(e){if(version===serial&&e.name!=='AbortError')fail(e)}
 }
 switchMode('models')
}
