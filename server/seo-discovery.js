import {readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
import {siteOrigin,previewImage} from './seo.js'

const idPattern=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/
const setPattern=/^\d{3,7}-\d{1,2}$/
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c])
const clean=(v,n=240)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n):''
const links=[['/editor','Редактор'],['/sets','Наборы'],['/parts','Детали'],['/mechanics','Механика'],['/builds','Сообщество'],['/updates','Обновления'],['/learn','Статьи'],['/en','English']]
const html=(path,title,description,body,{lang='ru',image=previewImage,noindex=false}={})=>{
 const url=siteOrigin+path
 return {type:'text/html; charset=utf-8',body:'<!doctype html><html lang="'+lang+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+esc(title)+' — BrickLab 3D</title><meta name="description" content="'+esc(description)+'"><link rel="canonical" href="'+url+'">'+(noindex?'<meta name="robots" content="noindex,follow">':'')+'<link rel="icon" href="/assets/bricklab.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/seo.css"><meta property="og:type" content="website"><meta property="og:site_name" content="BrickLab 3D"><meta property="og:title" content="'+esc(title)+' — BrickLab 3D"><meta property="og:description" content="'+esc(description)+'"><meta property="og:url" content="'+url+'"><meta property="og:image" content="'+esc(image)+'"><meta name="twitter:card" content="summary_large_image"></head><body><header><a class="brand" href="/"><img src="/assets/bricklab.svg" width="36" height="36" alt="">BrickLab 3D</a><nav>'+links.map(([href,label])=>'<a href="'+href+'">'+label+'</a>').join('')+'</nav></header><main><p class="eyebrow">BRICKLAB / DISCOVER</p><h1>'+esc(title)+'</h1><p class="intro">'+esc(description)+'</p>'+body+'</main><footer>BrickLab 3D — independent project, not affiliated with LEGO Group.</footer></body></html>'}
}
const card=(url,title,description='')=>'<section><h2><a href="'+esc(url)+'">'+esc(title)+'</a></h2><p>'+esc(description)+'</p></section>'
const grid=items=>'<div class="sections">'+items.join('')+'</div>'
const cta=(href,label)=>'<a class="cta" href="'+esc(href)+'">'+esc(label)+'</a>'
const readJson=(root,path,fallback)=>{try{return JSON.parse(readFileSync(join(root,path),'utf8'))}catch{return fallback}}
export function loadDiscoveryCatalog(root){
 const parts=new Map(),sets=new Map()
 const library=readJson(root,'catalog/parts-library.json',{})
 for(const section of library.sections??[]){
  const groups=new Map((section.groups??[]).map(g=>[g[0],g[1]]))
  for(const entry of section.parts??[]){
   const [id,group,en,ru]=entry
   if(typeof id!=='string'||!idPattern.test(id)||!clean(en)||parts.has(id))continue
   parts.set(id,{id,ru:clean(ru)||clean(en),en:clean(en),family:clean(section.ru)||clean(section.id),group:clean(groups.get(group))})
  }
 }
 const sequences=readJson(root,'catalog/sets/instruction-sequences.json',{})
 for(const [id,books] of Object.entries(sequences))if(setPattern.test(id)&&Array.isArray(books)&&books.length)sets.set(id,{id,name:'LEGO '+id.split('-')[0],volumes:books.length,pages:books.every(b=>Number.isSafeInteger(b[2])&&b[2]>0)?books.reduce((n,b)=>n+b[2],0):null})
 sets.set('42238-1',{id:'42238-1',name:'LEGO 42238',volumes:1,pages:null})
 sets.set('42215-1',{id:'42215-1',name:'LEGO 42215',volumes:2,pages:524})
 let names=[]
 try{names=readdirSync(join(root,'catalog/sets')).filter(n=>/^\d{3,7}-\d{1,2}\.json$/.test(n)).slice(0,200)}catch{}
 for(const file of names){
  const id=file.slice(0,-5),raw=readJson(root,'catalog/sets/'+file,null)
  if(!raw||raw.number!==id||!clean(raw.name))continue
  const known=sets.get(id)
  if(!known)continue // Only index sets with a known instruction source.
  const count=Array.isArray(raw.inventory)?raw.inventory.reduce((sum,p)=>sum+(!p.spare&&Number.isSafeInteger(p.quantity)&&p.quantity>0?p.quantity:0),0):0
  sets.set(id,{...known,name:clean(raw.name,160),year:Number.isInteger(raw.year)&&raw.year>1900?raw.year:null,count:count||null})
 }
 return {parts,sets}
}
export function readReleaseNotes(root){
 try{
  const source=readFileSync(join(root,'src/menu/home-hub.js'),'utf8')
  const match=source.match(/\bconst releaseHistory\s*=\s*(\[\s*\n[\s\S]*?\n\s*\])/)
  return match?JSON.parse(match[1]).filter(e=>Array.isArray(e)&&e.length===6&&e.every(v=>typeof v==='string')&&/^\d{4}-\d{2}-\d{2}$/.test(e[0])&&/^(pull\/\d+|commit\/[a-f0-9]{7,40})$/.test(e[1])):[]
 }catch{return []}
}
const articles={
 'gear-ratio':{title:'Как работает передаточное отношение шестерён',intro:'Пара шестерён меняет скорость и направление вращения. Попробуйте проверить это на цифровой сборке.',sections:[['Пример 8T и 24T','Если ведущая шестерня имеет 8 зубьев, а ведомая 24, ведомая вращается в три раза медленнее и в противоположную сторону.'],['Эксперимент','Соберите две шестерни на параллельных осях, запустите кинематику и сравните число оборотов. Реальный крутящий момент зависит от потерь и нагрузки.']]},
 'piston-engine':{title:'Как коленчатый вал приводит поршни в движение',intro:'Кривошип преобразует вращение в возвратно-поступательное движение поршня.',sections:[['Механизм','Коленвал вращается, шатун передаёт перемещение поршню, а направляющая ограничивает движение вдоль цилиндра.'],['Эксперимент','Откройте пример 858 Inline Engine в BrickLab и медленно поверните коленвал. Проследите движение поршней и связанных деталей.']]},
 'build-by-instructions':{title:'Как собирать цифровую модель по инструкции',intro:'PDF-инструкция и библиотека деталей помогают воспроизвести шаги сборки в 3D.',sections:[['Выберите набор','Откройте каталог и проверьте наличие инструкции. Доступность может отличаться для разных наборов.'],['Проверяйте подсказки','Найденные артикулы ускоряют поиск, но похожие детали следует сверять с описью и количеством.']]}}
export function createDiscovery({root,store=null,publicBuilds=false,catalog=loadDiscoveryCatalog(root),logger=console}={}){
 const {parts,sets}=catalog
 // Index useful named pages first, not thousands of near-empty variants.
 const partIndex=[...parts.values()].filter(p=>p.group&&p.ru&&p.en).slice(0,500)
 const indexedPartIds=new Set(partIndex.map(p=>p.id))
 const notes=()=>readReleaseNotes(root)
 const safeBuild=b=>b&&uuid.test(b.id)&&clean(b.title,160)?{id:b.id,title:clean(b.title,160),description:clean(b.description,1000),author:clean(b.author,80),authorId:b.authorId,partCount:Number.isSafeInteger(b.partCount)&&b.partCount>=0?b.partCount:0}:null
 async function publicList(){
  if(!publicBuilds||!store)return []
  return (await store.listPublicBuilds(null,{limit:200,sort:'recent'})).map(safeBuild).filter(b=>b&&b.description.length>=25)
 }
 const fixed=['/sets','/builds','/updates','/learn','/en',...Object.keys(articles).map(k=>'/learn/'+k)]
 return async function discovery(path){
  if(path==='/sitemap.xml'){
   let builds=[]
   try{builds=await publicList()}catch(error){logger.error('SEO public list unavailable:',error.code||error.name);return {status:503,type:'text/plain; charset=utf-8',body:'Sitemap temporarily unavailable'}}
   return {type:'application/xml; charset=utf-8',body:'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+['/','/editor','/instructions','/parts','/mechanics',...fixed.filter(p=>p!=='/builds'||builds.length)].concat([...sets.keys()].map(id=>'/sets/'+id),partIndex.map(p=>'/parts/'+p.id),builds.map(b=>'/builds/'+b.id)).map(p=>'<url><loc>'+esc(siteOrigin+p)+'</loc></url>').join('')+'</urlset>'}
  }
  if(path==='/sets')return html(path,'Каталог инструкций LEGO','Наборы с известными источниками инструкций в BrickLab.',grid([...sets.values()].map(s=>card('/sets/'+s.id,s.name+' · '+s.id,s.volumes+' том(а) инструкции')))+cta('/#sets','Открыть каталог редактора'))
  if(path==='/parts')return html(path,'Библиотека деталей LEGO Technic и System','Найдите цифровые детали по артикулу и названию.',grid(partIndex.map(p=>card('/parts/'+p.id,p.ru+' · '+p.id,p.family+' / '+p.group)))+cta('/#library','Вся библиотека'))
  if(path==='/updates')return html(path,'История обновлений BrickLab','Публичный журнал разработки. Даты относятся к коммитам и объединённым изменениям, а не обязательно к деплою.',grid(notes().map(e=>card('https://github.com/Deenfoool/BrickLab-3D/'+e[1],e[0]+' · '+e[2],e[3]))))
  if(path==='/learn')return html(path,'Инженерные эксперименты и руководства','Практические материалы о цифровой сборке и работе механизмов.',grid(Object.entries(articles).map(([id,a])=>card('/learn/'+id,a.title,a.intro))))
  if(path==='/en')return html(path,'Online 3D brick builder and mechanical playground','BrickLab 3D is an independent browser-based editor for building models, exploring supported mechanisms and following instructions.',grid([card('/editor','Build models','Use Technic and System parts, placement tools and groups.'),card('/instructions','Follow instructions','Browse available sets and use part hints where supported.'),card('/mechanics','Explore mechanics','Experiment with gears, shafts, piston engines and test drives; simulation is approximate.')])+cta('/#projects','Open BrickLab'),{lang:'en'})
  if(path==='/builds'){
   let builds=[]
   try{builds=await publicList()}catch(error){logger.error('SEO public list unavailable:',error.code||error.name);return {status:503,type:'text/plain; charset=utf-8',body:'Community temporarily unavailable'}}
   return html(path,'Публичные сборки BrickLab','Работы участников, опубликованные в сообществе.',grid(builds.map(b=>card('/builds/'+b.id,b.title,b.description)))+cta('/#community','Открыть сообщество'),{noindex:!publicBuilds||!builds.length})
  }
  const m=/^\/(sets|parts|builds|learn)\/([^/]+)$/.exec(path)
  if(!m)return null
  const [,kind,id]=m
  if(kind==='sets'&&sets.has(id)){
   const s=sets.get(id),number=id.split('-')[0],title='Инструкция LEGO '+number+(s.name==='LEGO '+number?'':' — '+s.name)
   return html(path,title,'Сборка набора '+s.name+' ('+id+') в виртуальном редакторе BrickLab.',grid([card('/instructions','Инструкция','Томов: '+s.volumes+(s.pages?' · страниц: '+s.pages:'')),card('/sets','Данные набора',(s.year?'Год: '+s.year+'. ':'')+(s.count?'Деталей по локальной описи: '+s.count+'. ':'')+'Номер: '+id),card('/parts','Библиотека','Ищите детали по артикулу. Точность распознавания зависит от инструкции.')])+cta('/?set='+encodeURIComponent(id)+'#sets','Найти набор в редакторе'))
  }
  if(kind==='parts'&&parts.has(id)){
   const p=parts.get(id)
   return html(path,p.ru+' — деталь '+id,p.en+' · '+p.family+'. Артикул '+id+'.',grid([card('/parts','Категория',p.group||p.family),card('/editor','Использование в редакторе','Выберите деталь по артикулу. Наличие геометрии не гарантирует поддержку всех соединений.')])+cta('/?part='+encodeURIComponent(id)+'#library','Найти деталь'),{noindex:!indexedPartIds.has(id)})
  }
  if(kind==='learn'&&Object.hasOwn(articles,id)){const a=articles[id];return html(path,a.title,a.intro,grid(a.sections.map(([h,t])=>card('/mechanics',h,t)))+cta('/#examples','Открыть примеры'))}
  if(kind==='builds'&&publicBuilds&&store&&uuid.test(id)){
   const b=safeBuild(await store.getPublicBuild(id))
   // Recheck author visibility; never request document/geometry or private projects.
   if(!b||!b.authorId||!await store.getPublicCard(b.authorId))return null
   return html(path,b.title,b.description||'Публичная сборка BrickLab.',grid([card('/builds','Автор',b.author),card('/editor','Деталей',String(b.partCount))])+cta('/#community/build/'+id,'Открыть 3D-сборку'),{noindex:b.description.length<25})
  }
  return null
 }
}
