import {cloudLink} from './projects-client.js?v=profile-gallery-1'
import {loadHomePreviews} from './home-previews.js?v=profile-gallery-1'
const text={
 ru:{recent:'Последние сборки',all:'Все сборки',local:'На устройстве',cloud:'В облаке',linked:'Локальная копия · облако',parts:'дет.',revision:'Версия',open:'Открыть',openCopy:'Открыть копию',empty:'Пока нет сборок. Создай первую модель.',favorites:'Избранные сборки',noFavorites:'Нет избранных сборок',published:'Публичные работы',noPublished:'Пока нет опубликованных работ.',load:'Проверить публикации',loading:'Статус публикаций не загружен.',activity:'Последняя активность',noActivity:'Сохранений в облаке пока нет.',saved:'Сохранена версия',newBuild:'Новая сборка',publicView:'Публичный профиль',manage:'Управление',award:'Достижения',firstCloud:'Первая облачная сборка',earned:'Получено · 30 XP',notEarned:'Сохрани первую сборку в облако',emptyModel:'Пустая модель',previewUnavailable:'Миниатюра недоступна'},
 en:{recent:'Recent builds',all:'All builds',local:'On this device',cloud:'Cloud',linked:'Local copy · cloud',parts:'parts',revision:'Revision',open:'Open',openCopy:'Open copy',empty:'No builds yet. Create your first model.',favorites:'Favorite builds',noFavorites:'No favorites yet',published:'Public works',noPublished:'No published works yet.',load:'Check publications',loading:'Publication status has not been loaded.',activity:'Recent activity',noActivity:'No cloud saves yet.',saved:'Saved revision',newBuild:'New build',publicView:'Public profile',manage:'Manage',award:'Achievements',firstCloud:'First cloud build',earned:'Earned · 30 XP',notEarned:'Save your first build to the cloud',emptyModel:'Empty model',previewUnavailable:'Preview unavailable'}
}
const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=String(value);return n}
function icon(id){const n=document.createElementNS('http://www.w3.org/2000/svg','svg'),u=document.createElementNS(n.namespaceURI,'use');n.setAttribute('class','icon');n.setAttribute('aria-hidden','true');u.setAttribute('href','#'+id);n.append(u);return n}
function link(label,href,cls='workspace-action'){const a=node('a',cls,label);a.href=href;return a}
function button(label,fn,busy=false){const b=node('button','workspace-action',label);b.type='button';b.disabled=busy;b.onclick=fn;return b}
const timestamp=v=>Number.isFinite(Date.parse(v))?Date.parse(v):0
export function recentWorkshopBuilds(local,remote,ownerId,limit=6){
 const linked=new Set(),entries=[]
 for(const project of local){
  const c=cloudLink(project,ownerId),head=c?remote.find(p=>p.id===c.id):null
  if(head&&c.revision===head.revision)linked.add(c.id)
  entries.push({project,cloud:head??null,modifiedAt:project.modifiedAt})
 }
 for(const cloud of remote)if(!linked.has(cloud.id))entries.push({project:null,cloud,modifiedAt:cloud.updatedAt})
 return entries.sort((a,b)=>timestamp(b.modifiedAt)-timestamp(a.modifiedAt)).slice(0,limit)
}
function section(title,action){const root=node('section','workshop-overview-section'),heading=node('div','workshop-overview-heading');heading.append(node('h2',null,title));if(action)heading.append(action);root.append(heading);return root}
function showBlob(art,blob,signal){
 if(!blob||signal.aborted||!art.isConnected)return
 const img=node('img');img.alt='';img.decoding='async';const url=URL.createObjectURL(blob)
 const release=()=>URL.revokeObjectURL(url)
 signal.addEventListener('abort',release,{once:true})
 img.onload=()=>{if(!signal.aborted&&art.isConnected)art.replaceChildren(img);release()}
 img.onerror=release;img.src=url
}
export function renderWorkshopOverview({lang,user,local,remote,busy,signal,previewsEnabled,createBuild,openLocal,openCloud,fetchCloud,go,activityData,publicLoaded,publicCard,publicBuilds,loadPublic,progress}){
 const t=text[lang]??text.en,root=node('div','workshop-overview'),recent=section(t.recent,link(t.all,'#projects')),grid=node('div','workshop-recent-grid'),jobs=[]
 const date=value=>timestamp(value)?new Intl.DateTimeFormat(lang,{dateStyle:'medium'}).format(new Date(value)):''
 const entries=recentWorkshopBuilds(local,remote,user.id)
 for(const entry of entries){
  const p=entry.project,c=entry.cloud,art=node('div','workshop-recent-art'),body=node('div','workshop-recent-body')
  const card=node('article','workshop-recent-card'),source=node('span','workshop-source',p?(c?t.linked:t.local):t.cloud)
  art.append(icon('layers'));art.append(node('small',null,p&&!p.document.parts?.length?t.emptyModel:t.previewUnavailable))
  const name=p?.document?.name??c.name
  body.append(source,node('h3',null,name),node('p','account-muted',[p?p.document.parts.length+' '+t.parts:t.revision+' '+c.revision,date(entry.modifiedAt)].filter(Boolean).join(' · ')),button(p?t.open:t.openCopy,()=>p?openLocal(p.id):openCloud(c.id),busy))
  card.append(art,body);grid.append(card)
  if(!busy&&previewsEnabled&&(!p||p.document.parts?.length))jobs.push({entry,art})
 }
 if(entries.length)recent.append(grid);else recent.append(node('p','workshop-empty',t.empty),button(t.newBuild,createBuild,busy))
 root.append(recent)
 const lower=node('div','workshop-overview-columns'),favorites=section(t.favorites,button(t.manage,()=>go('favorites'),busy)),published=section(t.published,button(t.manage,()=>go('settings'),busy))
 const fav=activityData?.favorites??[]
 if(!fav.length)favorites.append(node('p','account-muted',activityData?t.noFavorites:t.loading))
 for(const f of fav.slice(0,4)){const row=node('div','workshop-overview-row'),label=node('div');label.append(node('strong',null,f.name),node('small','account-muted',t.revision+' '+f.revision));row.append(icon('icon-heart'),label,button(t.openCopy,()=>openCloud(f.id),busy));favorites.append(row)}
 if(publicCard)published.append(link(t.publicView,'#community/profile/'+publicCard.id))
 if(!publicLoaded)published.append(node('p','account-muted',t.loading),button(t.load,loadPublic,busy))
 else if(!publicBuilds.length)published.append(node('p','account-muted',t.noPublished))
 else for(const b of publicBuilds.slice(0,4)){
  const row=node('a','workshop-overview-row');row.href='#community/build/'+b.id
  const art=node('div','workshop-public-thumb');art.append(icon('layers'))
  if(b.imageCount>0&&/^[0-9a-f-]{36}$/i.test(b.id)){const img=node('img');img.alt='';img.loading='lazy';img.src='/api/community/build/'+b.id+'/image/0';img.onload=()=>{if(!signal.aborted)art.replaceChildren(img)}}
  const label=node('div');label.append(node('strong',null,b.title),node('small','account-muted',t.revision+' '+b.revision));row.append(art,label);published.append(row)
 }
 lower.append(favorites);if(!publicCard)lower.append(published)
 const activity=section(t.activity,button(t.manage,()=>go('notifications'),busy)),awards=section(t.award,button(t.manage,()=>go('achievements'),busy))
 const events=activityData?.events??[]
 if(!events.length)activity.append(node('p','account-muted',activityData?t.noActivity:t.loading))
 for(const e of events.slice(0,4)){const row=node('div','workshop-overview-row'),label=node('div');label.append(node('strong',null,e.name),node('small','account-muted',t.saved+' '+e.revision+' · '+date(e.at)));row.append(icon('icon-cloud'),label);activity.append(row)}
 const earned=progress?.awards?.some(a=>a.award==='firstCloudSave'),award=node('div','workshop-overview-row'),label=node('div');label.append(node('strong',null,t.firstCloud),node('small','account-muted',progress?(earned?t.earned:t.notEarned):t.loading));award.append(icon('icon-trophy'),label);awards.append(award);lower.append(activity,awards);root.append(lower)
 if(jobs.length){
  let started=false,observer
  const run=async()=>{
   if(started||signal.aborted)return;started=true;observer?.disconnect()
   const batch=[]
   for(const {entry,art} of jobs){
    if(signal.aborted)return
    let project=entry.project
    if(!project){try{const item=await fetchCloud(entry.cloud.id,signal);if(!item||signal.aborted)continue;project={id:entry.cloud.id,modifiedAt:entry.cloud.updatedAt,document:item.document}}catch{continue}}
    if(!project?.document?.parts?.length)continue
    batch.push({project,cache:!!entry.project,show:blob=>showBlob(art,blob,signal)})
   }
   if(!signal.aborted)await loadHomePreviews(batch,signal)
  }
  const start=()=>void run().catch(()=>{})
  if(typeof IntersectionObserver==='function'){observer=new IntersectionObserver(items=>{if(items.some(i=>i.isIntersecting))start()},{rootMargin:'160px'});observer.observe(recent);signal.addEventListener('abort',()=>observer.disconnect(),{once:true})}else queueMicrotask(start)
 }
 return root
}
