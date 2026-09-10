import { getLDrawIndex, getLDrawMetadata, registerLDrawPart } from './runtime-v3.js?v=ldraw-catalog-20260910-v3'

const INDEX_URL = 'https://raw.githubusercontent.com/partcad/partcad-ldraw/main/parts-index.json.gz'
const INDEX_SOURCE = 'PartCAD / LDraw index'
const ROOT_ID = 'ldrawCatalogV3'
const STYLE_ID = 'bricklab-ldraw-catalog-v3-css'
const FAVORITES_KEY = 'bricklab.ldraw.favorites.v3'
const RECENTS_KEY = 'bricklab.ldraw.recents.v3'
const VIEW_KEY = 'bricklab.ldraw.view.v3'
const SORT_KEY = 'bricklab.ldraw.sort.v3'
const CLEAN_KEY = 'bricklab.ldraw.clean.v3'
const PAGE_SIZE = 80

const HOME_FILES = [
  '3001.dat','3003.dat','3004.dat','3005.dat','3010.dat','3020.dat','3022.dat','3023.dat','3068b.dat','3666.dat',
  '3701.dat','3894.dat','3895.dat','32523.dat','32316.dat','2780.dat','3673.dat','6558.dat','32062.dat','32013.dat',
  '3705.dat','3706.dat','3707.dat','3708.dat','4519.dat','32073.dat','32209.dat','3647.dat','4019.dat','3648.dat','32270.dat',
]

const PINNED_CATEGORIES = [
  ['Brick','box'],['Plate','layers-2'],['Tile','square'],['Slope','triangle'],['Technic','settings-2'],
  ['Wheel','circle-dot'],['Tyre','circle'],['Hinge','panel-top'],['Panel','panel-top-open'],['Electric','zap'],
]

const TECHNIC_PRESETS = [
  ['', 'Все Technic', 'All Technic'],
  ['liftarm', 'Балки / Liftarm', 'Beams / Liftarms'],
  ['axle', 'Оси', 'Axles'],
  ['gear', 'Шестерни', 'Gears'],
  ['pin', 'Пины', 'Pins'],
  ['connector', 'Коннекторы', 'Connectors'],
  ['steering', 'Рулевое', 'Steering'],
  ['shock absorber', 'Подвеска', 'Suspension'],
]

const CATEGORY_RU = {
  Animal:'Животные',Antenna:'Антенны',Arch:'Арки',Arm:'Рычаги',Bar:'Штанги',Baseplate:'Базовые пластины',Belville:'Belville',Boat:'Лодки',Bracket:'Кронштейны',Brick:'Кирпичи',Car:'Авто',Clikits:'Clikits',Cockpit:'Кабины',Cone:'Конусы',Constraction:'Constraction','Constraction Accessory':'Аксессуары Constraction',Container:'Контейнеры',Conveyor:'Конвейеры',Crane:'Краны',Cylinder:'Цилиндры',Dish:'Тарелки',Door:'Двери',Duplo:'Duplo',Electric:'Электрика',Exhaust:'Выхлоп',Fence:'Ограждения',Figure:'Фигурки','Figure Accessory':'Аксессуары фигурок',Flag:'Флаги',Flexible:'Гибкие детали',Freestyle:'Freestyle',Garage:'Гараж',Glass:'Стёкла',Helper:'Служебные',Hinge:'Шарниры',Homemaker:'Homemaker',Hose:'Шланги',Ladder:'Лестницы',Magnet:'Магниты','Minifig Head':'Головы минифиг','Minifig Upper':'Верх минифиг','Minifig Lower':'Низ минифиг','Minifig Leg':'Ноги минифиг','Minifig Hips':'Бёдра минифиг','Minifig Arm':'Руки минифиг','Minifig Hand':'Кисти минифиг','Minifig Torso':'Торсы минифиг','Minifig Body':'Тела минифиг','Minifig Assembly':'Сборки минифиг','Minifig Accessory':'Аксессуары минифиг','Minifig Footwear':'Обувь минифиг','Minifig Headwear':'Головные уборы','Minifig Hipwear':'Аксессуары бёдер','Minifig Neckwear':'Аксессуары шеи',Monorail:'Монорельс',Modulex:'Modulex',Moved:'Перемещённые',Obsolete:'Устаревшие',Panel:'Панели',Plane:'Авиация',Plant:'Растения',Plate:'Пластины',Platform:'Платформы',Propeller:'Пропеллеры',Quatro:'Quatro',Rack:'Рейки',Roadsign:'Дорожные знаки',Rock:'Скалы',Scala:'Scala',Screw:'Винты','Sheet Cardboard':'Картон','Sheet Fabric':'Ткань','Sheet Plastic':'Пластиковые листы',Slope:'Скосы',Sphere:'Сферы',Staircase:'Лестницы',Sticker:'Стикеры','Sticker Shortcut':'Стикеры (сборки)',String:'Нити',Support:'Опоры',Tail:'Хвосты',Tap:'Краны',Technic:'Technic',Tile:'Тайлы',Tipper:'Самосвалы',Tractor:'Тракторы',Trailer:'Прицепы',Train:'Поезда',Turntable:'Поворотные столы',Tyre:'Шины',Vehicle:'Транспорт',Wedge:'Клинья',Wheel:'Колёса',Winch:'Лебёдки',Window:'Окна',Windscreen:'Лобовые стёкла',Wing:'Крылья',Znap:'Znap',
}

let panel = null
let root = null
let input = null
let results = null
let categorySelect = null
let sentinelObserver = null
let indexPromise = null
let allParts = []
let categoryCounts = new Map()
let generation = 0
let searchTimer = 0
let favorites = readArray(FAVORITES_KEY)
let recents = readArray(RECENTS_KEY)

const state = {
  mode:'home', category:'', preset:'', query:'', page:1, total:0, visibleTotal:0,
  view:localStorage.getItem(VIEW_KEY)==='list'?'list':'grid',
  sort:['name','id'].includes(localStorage.getItem(SORT_KEY))?localStorage.getItem(SORT_KEY):'name',
  direction:'asc', clean:localStorage.getItem(CLEAN_KEY)!=='false', loading:false, fallback:false,
}

function readArray(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]}catch{return[]}}
function writeArray(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{/* storage unavailable */}}
function isRussian(){return document.documentElement.lang==='ru'||localStorage.getItem('bricklab.ui.language.v1')==='ru'}
function copy(){return isRussian()?{
  search:'Поиск по названию, категории или Design ID…',featured:'Подборка',favorites:'Избранное',recent:'Недавние',all:'Все',allCategories:'Все категории',
  byName:'По названию',byId:'По номеру',core:'Только основные',decorated:'Основные + принты',loading:'Загрузка индекса LDraw…',parts:'деталей',
  add:'Добавить в сцену',fav:'В избранное',unfav:'Убрать из избранного',empty:'Ничего не найдено',emptyFav:'В избранном пока ничего нет',emptyRecent:'Недавно использованных деталей пока нет',
  loadMore:'Показать ещё',source:'LDraw Parts Library',fallback:'Индекс метаданных недоступен · доступен поиск по Design ID',clear:'Очистить поиск',grid:'Сетка',list:'Список',
}:{
  search:'Search by name, category or Design ID…',featured:'Featured',favorites:'Favorites',recent:'Recent',all:'All',allCategories:'All categories',
  byName:'By name',byId:'By ID',core:'Core parts only',decorated:'Core + decorated',loading:'Loading LDraw index…',parts:'parts',
  add:'Add to scene',fav:'Add to favorites',unfav:'Remove from favorites',empty:'Nothing found',emptyFav:'No favorite parts yet',emptyRecent:'No recently used parts yet',
  loadMore:'Load more',source:'LDraw Parts Library',fallback:'Metadata index unavailable · Design ID search remains available',clear:'Clear search',grid:'Grid',list:'List',
}}
function categoryLabel(name){return isRussian()?(CATEGORY_RU[name]||name):name}
function normalizeFile(value){return String(value||'').replace(/^parts\//i,'').replace(/\\/g,'/').trim()}
function codeOf(file){return normalizeFile(file).replace(/\.dat$/i,'')}
function normalizeQuery(value){return String(value||'').trim().toLocaleLowerCase().replace(/^ldraw-/,'').replace(/\.dat$/,'')}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function itemKey(item){return normalizeFile(item?.file).toLowerCase()}
function savedItem(item){return{file:normalizeFile(item.file),code:item.code||codeOf(item.file),description:item.description||`LDraw ${item.code||codeOf(item.file)}`,category:item.category||''}}
function favoriteKeys(){return new Set(favorites.map(itemKey))}
function isFavorite(item){return favoriteKeys().has(itemKey(item))}

function ensureStyles(){
  if(document.getElementById(STYLE_ID))return
  const link=document.createElement('link');link.id=STYLE_ID;link.rel='stylesheet';link.href=new URL('./catalog-v2.css?v=ldraw-catalog-20260910-v3',import.meta.url).href;document.head.append(link)
}
function icons(){window.lucide?.createIcons?.({attrs:{'stroke-width':1.7,'aria-hidden':'true'}})}

async function ungzipJson(response){
  if(!response.ok)throw new Error(`LDraw index HTTP ${response.status}`)
  if(typeof DecompressionStream!=='function')throw new Error('gzip decompression is unavailable')
  if(!response.body)throw new Error('LDraw index response has no body')
  const stream=response.body.pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(stream).text())
}

function unpackIndex(data){
  if(!data||data.format!==2||!data.categories)throw new Error('Unsupported LDraw catalog index')
  const list=[];const counts=new Map()
  for(const [category,parts] of Object.entries(data.categories)){
    let count=0
    for(const [code,entry] of Object.entries(parts||{})){
      const description=Array.isArray(entry)?String(entry[0]||'').trim():''
      if(!description)continue // site-only / unofficial entry, not in complete.zip
      list.push({file:`${code}.dat`,code,description,category})
      count+=1
    }
    if(count)counts.set(category,count)
  }
  allParts=list
  categoryCounts=counts
  return list
}

async function ensureIndex(){
  if(allParts.length)return allParts
  if(indexPromise)return indexPromise
  indexPromise=(async()=>{
    try{
      const response=await fetch(INDEX_URL,{mode:'cors',cache:'force-cache'})
      return unpackIndex(await ungzipJson(response))
    }catch(error){
      console.warn('[BrickLab LDraw] compact metadata index unavailable; using mirror fallback',error)
      state.fallback=true
      return []
    }
  })()
  return indexPromise
}

async function fallbackSearch(query){
  const q=normalizeQuery(query)
  const index=await getLDrawIndex()
  const matches=(q?index.filter(item=>item.code.toLowerCase().includes(q)):index).slice(0,Math.max(PAGE_SIZE,state.page*PAGE_SIZE))
  const token=++generation
  const queue=[...matches];const output=[]
  const workers=Array.from({length:Math.min(5,queue.length)},async()=>{
    while(queue.length){
      const item=queue.shift();if(!item)break
      try{const meta=await getLDrawMetadata(item.file);output.push({...item,...meta,description:meta.description||`LDraw ${item.code}`,category:meta.category||guessCategory(meta.description)})}
      catch{output.push({...item,description:`LDraw ${item.code}`,category:'Other'})}
      if(token!==generation)return
    }
  })
  await Promise.all(workers)
  return output
}

function guessCategory(description=''){
  const value=description.toLowerCase()
  for(const name of ['Technic','Brick','Plate','Tile','Slope','Wheel','Tyre','Hinge','Panel','Electric','Door','Window','Plant','Animal','Sticker']){
    if(value.includes(name.toLowerCase()))return name
  }
  return 'Other'
}

function shell(){
  const c=copy()
  return `<div class="ld2-root ${state.view==='list'?'is-list':'is-grid'}" id="${ROOT_ID}">
    <div class="ld2-search"><i data-lucide="search"></i><input id="ld3Search" autocomplete="off" spellcheck="false" placeholder="${c.search}"><button type="button" data-clear title="${c.clear}"><i data-lucide="x"></i></button><kbd>Ctrl K</kbd></div>
    <div class="ld2-primary-nav">
      <button type="button" data-mode="home"><i data-lucide="sparkles"></i><span>${c.featured}</span></button>
      <button type="button" data-mode="favorites"><i data-lucide="star"></i><span>${c.favorites}</span><b data-fav-count>${favorites.length}</b></button>
      <button type="button" data-mode="recent"><i data-lucide="history"></i><span>${c.recent}</span></button>
      <button type="button" data-mode="all"><i data-lucide="blocks"></i><span>${c.all}</span></button>
    </div>
    <div class="ld2-pinned" data-pinned></div>
    <div class="ld2-technic hidden" data-technic></div>
    <div class="ld2-category-row"><i data-lucide="folders"></i><select id="ld3Category"><option value="">${c.allCategories}</option></select></div>
    <div class="ld2-toolbar">
      <select id="ld3Sort"><option value="name">${c.byName}</option><option value="id">${c.byId}</option></select>
      <button type="button" data-direction title="A → Z"><i data-lucide="arrow-down-a-z"></i></button>
      <button type="button" data-view title="${state.view==='grid'?c.list:c.grid}"><i data-lucide="${state.view==='grid'?'list':'layout-grid'}"></i></button>
      <button type="button" class="ld2-clean ${state.clean?'active':''}" data-clean><i data-lucide="${state.clean?'package-check':'palette'}"></i><span>${state.clean?c.core:c.decorated}</span></button>
    </div>
    <div class="ld2-summary"><span data-summary>${c.loading}</span><span class="ld2-source"><span class="dot"></span>${c.source}</span></div>
    <div class="ld2-scroll" data-scroll><div class="ld2-results" data-results></div><button class="ld2-more hidden" type="button" data-more>${c.loadMore}</button><div class="ld2-sentinel" data-sentinel></div></div>
    <div class="ld2-foot">Parts geometry provided by the LDraw Parts Library.<br><span data-index-source>${INDEX_SOURCE}</span></div>
  </div>`
}

function renderPinned(){
  const host=root?.querySelector('[data-pinned]');if(!host)return
  host.innerHTML=PINNED_CATEGORIES.map(([name,icon])=>`<button type="button" class="${state.category===name?'active':''}" data-category="${name}" title="${escapeHtml(categoryLabel(name))}"><i data-lucide="${icon}"></i><span>${escapeHtml(categoryLabel(name))}</span></button>`).join('')
  host.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>selectCategory(button.dataset.category||''));icons()
}
function renderTechnic(){
  const host=root?.querySelector('[data-technic]');if(!host)return
  host.classList.toggle('hidden',state.category!=='Technic')
  if(state.category!=='Technic'){host.innerHTML='';return}
  host.innerHTML=TECHNIC_PRESETS.map(([value,ru,en])=>`<button type="button" class="${state.preset===value?'active':''}" data-preset="${value}">${escapeHtml(isRussian()?ru:en)}</button>`).join('')
  host.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{state.preset=button.dataset.preset||'';state.page=1;renderTechnic();renderResults()})
}
function renderCategories(){
  if(!categorySelect)return
  const current=state.category;const c=copy()
  const entries=[...categoryCounts.entries()].sort((a,b)=>categoryLabel(a[0]).localeCompare(categoryLabel(b[0]),isRussian()?'ru':'en'))
  categorySelect.innerHTML=`<option value="">${c.allCategories}</option>`+entries.map(([name,count])=>`<option value="${escapeHtml(name)}">${escapeHtml(categoryLabel(name))} · ${count.toLocaleString(isRussian()?'ru-RU':'en-US')}</option>`).join('')
  categorySelect.value=current
}
function syncControls(){
  if(!root)return
  root.classList.toggle('is-grid',state.view==='grid');root.classList.toggle('is-list',state.view==='list')
  root.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===state.mode))
  const sort=root.querySelector('#ld3Sort');if(sort)sort.value=state.sort
  const clean=root.querySelector('[data-clean]');if(clean){clean.classList.toggle('active',state.clean);clean.innerHTML=`<i data-lucide="${state.clean?'package-check':'palette'}"></i><span>${state.clean?copy().core:copy().decorated}</span>`}
  const view=root.querySelector('[data-view]');if(view){view.title=state.view==='grid'?copy().list:copy().grid;view.innerHTML=`<i data-lucide="${state.view==='grid'?'list':'layout-grid'}"></i>`}
  renderPinned();renderTechnic();renderCategories();icons()
}

function isCore(item){
  if(!state.clean)return true
  const exact=normalizeQuery(state.query)
  if(exact&&String(item.code).toLowerCase()===exact)return true
  if(['Sticker','Sticker Shortcut','Moved','Obsolete'].includes(state.category))return true
  const description=String(item.description||'')
  if(/^[~=_]/.test(description))return false
  if(/\b(?:sticker|pattern|physical colour|physical color|moved to|obsolete)\b/i.test(description))return false
  return true
}
function matchesQuery(item){
  const q=normalizeQuery(state.query||state.preset);if(!q)return true
  const haystack=`${item.code} ${item.description} ${item.category}`.toLocaleLowerCase()
  return q.split(/\s+/).every(word=>haystack.includes(word))
}
function sourceItems(){
  if(state.mode==='favorites')return favorites
  if(state.mode==='recent')return recents
  if(state.mode==='home'&&!state.query)return HOME_FILES.map(file=>allParts.find(item=>item.file.toLowerCase()===file.toLowerCase())).filter(Boolean)
  return allParts
}
function filteredItems(){
  let list=sourceItems().filter(item=>!state.category||item.category===state.category).filter(matchesQuery).filter(isCore)
  const factor=state.direction==='asc'?1:-1
  list=[...list].sort((a,b)=>state.sort==='id'
    ?factor*String(a.code).localeCompare(String(b.code),'en',{numeric:true,sensitivity:'base'})
    :factor*String(a.description).localeCompare(String(b.description),isRussian()?'ru':'en',{numeric:true,sensitivity:'base'}))
  return list
}
function iconFor(item){return({Technic:'settings-2',Brick:'box',Plate:'layers-2',Tile:'square',Slope:'triangle',Wheel:'circle-dot',Tyre:'circle',Hinge:'panel-top',Panel:'panel-top-open',Electric:'zap',Door:'door-open',Window:'panels-top-left',Animal:'rabbit',Plant:'sprout',Sticker:'badge'}[item.category]||'box')}
function cardMarkup(item){
  const fav=isFavorite(item);const c=copy()
  return `<article class="ld2-card" data-file="${escapeHtml(item.file)}"><button class="ld2-main" type="button" data-add="${escapeHtml(item.file)}" title="${c.add}"><span class="ld2-thumb"><i data-lucide="${iconFor(item)}"></i><b>${escapeHtml(item.code)}</b></span><span class="ld2-copy"><strong>${escapeHtml(item.description)}</strong><small><span>${escapeHtml(categoryLabel(item.category))}</span><code>${escapeHtml(item.code)}</code></small></span><span class="ld2-plus"><i data-lucide="plus"></i></span></button><button class="ld2-star ${fav?'active':''}" type="button" data-favorite="${escapeHtml(item.file)}" title="${fav?c.unfav:c.fav}"><i data-lucide="star"></i></button></article>`
}

async function ensureHomeMetadata(){
  if(allParts.length)return
  const token=++generation;const output=[]
  await Promise.all(HOME_FILES.map(async file=>{try{const meta=await getLDrawMetadata(file);output.push({file,code:codeOf(file),description:meta.description||`LDraw ${codeOf(file)}`,category:meta.category||guessCategory(meta.description)})}catch{/* skip */}}))
  if(token!==generation)return
  allParts=output
}

async function prepareIndex(){
  state.loading=true;updateSummary()
  await ensureIndex()
  if(!allParts.length){await ensureHomeMetadata()}
  state.loading=false;renderCategories();renderResults()
}

async function ensureFallbackForQuery(){
  if(!state.fallback)return
  if(!state.query&&state.mode==='home')return
  state.loading=true;updateSummary()
  const items=await fallbackSearch(state.query||state.preset)
  allParts=items;state.loading=false;renderResults()
}

function renderResults(){
  if(!results)return
  const c=copy();const all=filteredItems();state.visibleTotal=all.length
  const shown=all.slice(0,state.page*PAGE_SIZE);state.total=all.length
  const empty=state.mode==='favorites'?c.emptyFav:state.mode==='recent'?c.emptyRecent:c.empty
  results.innerHTML=shown.length?shown.map(cardMarkup).join(''):`<div class="ld2-empty"><i data-lucide="package-search"></i><strong>${escapeHtml(empty)}</strong></div>`
  const more=root.querySelector('[data-more]');more.classList.toggle('hidden',shown.length>=all.length);more.disabled=state.loading
  root.querySelector('[data-fav-count]').textContent=favorites.length
  updateSummary();icons()
}
function updateSummary(){
  const host=root?.querySelector('[data-summary]');if(!host)return
  const c=copy();if(state.loading){host.textContent=c.loading;return}
  if(state.fallback&&allParts.length<200){host.textContent=c.fallback;return}
  host.textContent=`${state.visibleTotal.toLocaleString(isRussian()?'ru-RU':'en-US')} ${c.parts}`
  const count=panel?.querySelector('#partCount');if(count)count.textContent=String(state.visibleTotal||allParts.length)
}

function selectCategory(name){state.mode=name?'category':'all';state.category=name;state.preset='';state.query='';state.page=1;if(input)input.value='';syncControls();renderResults();if(state.fallback)void ensureFallbackForQuery()}
function setMode(mode){state.mode=mode;state.category='';state.preset='';state.query='';state.page=1;if(input)input.value='';if(categorySelect)categorySelect.value='';syncControls();renderResults();if(state.fallback&&mode==='all')void ensureFallbackForQuery()}
function toggleFavorite(file){
  const item=findItem(file);if(!item)return
  const key=itemKey(item);const index=favorites.findIndex(value=>itemKey(value)===key)
  if(index>=0)favorites.splice(index,1);else favorites.unshift(savedItem(item))
  favorites=favorites.slice(0,600);writeArray(FAVORITES_KEY,favorites);renderResults()
}
function rememberRecent(item){const saved=savedItem(item);const key=itemKey(saved);recents=[saved,...recents.filter(value=>itemKey(value)!==key)].slice(0,60);writeArray(RECENTS_KEY,recents)}
function findItem(file){const key=normalizeFile(file).toLowerCase();return allParts.find(item=>itemKey(item)===key)||favorites.find(item=>itemKey(item)===key)||recents.find(item=>itemKey(item)===key)||null}

function clickNativePart(def){
  const legacy=document.getElementById('partSearch');if(!legacy)return false
  legacy.value='';legacy.dispatchEvent(new Event('input',{bubbles:true}))
  const click=()=>{const card=document.querySelector(`#partsList .part-card[data-part="${CSS.escape(def.id)}"]`);if(!card)return false;card.click();return true}
  if(click())return true;requestAnimationFrame(click);return true
}
async function addPart(file,card){
  card?.classList.add('loading')
  try{
    let item=findItem(file)||{file:normalizeFile(file),code:codeOf(file),description:`LDraw ${codeOf(file)}`,category:''}
    if(!item.description||/^LDraw\s/i.test(item.description)){const meta=await getLDrawMetadata(file);item={...item,...meta,description:meta.description||item.description,category:meta.category||item.category||guessCategory(meta.description)}}
    const def=registerLDrawPart(item);rememberRecent(item);clickNativePart(def)
    card?.classList.remove('loading');card?.classList.add('added');setTimeout(()=>card?.classList.remove('added'),700)
  }catch(error){console.warn('[BrickLab LDraw] add failed',error);card?.classList.remove('loading')}
}

function bind(){
  input=root.querySelector('#ld3Search');results=root.querySelector('[data-results]');categorySelect=root.querySelector('#ld3Category')
  root.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.mode||'home'))
  root.querySelector('[data-clear]').onclick=()=>{input.value='';state.query='';state.page=1;input.focus();renderResults()}
  input.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=input.value.trim();state.page=1;if(state.mode==='home'&&state.query)state.mode=state.category?'category':'all';syncControls();renderResults();if(state.fallback)void ensureFallbackForQuery()},120)})
  categorySelect.onchange=()=>categorySelect.value?selectCategory(categorySelect.value):setMode('all')
  root.querySelector('#ld3Sort').onchange=event=>{state.sort=event.target.value;localStorage.setItem(SORT_KEY,state.sort);state.page=1;renderResults()}
  root.querySelector('[data-direction]').onclick=event=>{state.direction=state.direction==='asc'?'desc':'asc';event.currentTarget.innerHTML=`<i data-lucide="${state.direction==='asc'?'arrow-down-a-z':'arrow-up-z-a'}"></i>`;state.page=1;renderResults()}
  root.querySelector('[data-view]').onclick=()=>{state.view=state.view==='grid'?'list':'grid';localStorage.setItem(VIEW_KEY,state.view);syncControls();renderResults()}
  root.querySelector('[data-clean]').onclick=()=>{state.clean=!state.clean;localStorage.setItem(CLEAN_KEY,String(state.clean));state.page=1;syncControls();renderResults()}
  root.querySelector('[data-more]').onclick=()=>{state.page+=1;renderResults()}
  results.addEventListener('click',event=>{const fav=event.target.closest('[data-favorite]');if(fav){event.preventDefault();event.stopPropagation();toggleFavorite(fav.dataset.favorite);return}const add=event.target.closest('[data-add]');if(add)void addPart(add.dataset.add,add.closest('.ld2-card'))})
  sentinelObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){const all=filteredItems();if(state.page*PAGE_SIZE<all.length){state.page+=1;renderResults()}}},{root:root.querySelector('[data-scroll]'),rootMargin:'160px'})
  sentinelObserver.observe(root.querySelector('[data-sentinel]'))
}

function updateLanguage(){
  if(!root)return
  const c=copy();input.placeholder=c.search
  root.querySelector('[data-mode="home"] span').textContent=c.featured;root.querySelector('[data-mode="favorites"] span').textContent=c.favorites;root.querySelector('[data-mode="recent"] span').textContent=c.recent;root.querySelector('[data-mode="all"] span').textContent=c.all
  root.querySelector('#ld3Sort').options[0].textContent=c.byName;root.querySelector('#ld3Sort').options[1].textContent=c.byId;root.querySelector('[data-more]').textContent=c.loadMore
  syncControls();renderResults()
}

async function install(){
  panel=document.querySelector('.parts-panel');if(!panel||!document.getElementById('partsList')||!document.getElementById('partSearch'))return requestAnimationFrame(install)
  if(document.getElementById(ROOT_ID))return
  ensureStyles();panel.classList.add('ldraw-catalog-v2-active')
  const label=panel.querySelector('.panel-title span:first-child');if(label)label.textContent='LDRAW PARTS'
  const holder=document.createElement('div');holder.innerHTML=shell();root=holder.firstElementChild;panel.append(root)
  bind();syncControls();icons();renderResults();void prepareIndex()
}

document.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey)||event.code!=='KeyK')return;if(!root||document.querySelector('.parts-panel')?.classList.contains('panel-hidden'))return;event.preventDefault();input.focus();input.select()},true)
window.addEventListener('bricklab:languagechange',updateLanguage)

install()
window.BrickLabLDrawCatalog=Object.freeze({focus:()=>{input?.focus();input?.select()},showCategory:selectCategory,showAll:()=>setMode('all'),showFavorites:()=>setMode('favorites')})
