import { getLDrawIndex, getLDrawMetadata, registerLDrawPart } from './runtime-v3.js?v=ldraw-catalog-20260910-v2'

const LIBRARY_ROOT = 'https://library.ldraw.org'
const LIST_URL = `${LIBRARY_ROOT}/parts/list`
const CATEGORY_URL = `${LIBRARY_ROOT}/parts/category-list`
const STYLE_ID = 'bricklab-ldraw-catalog-v2-css'
const ROOT_ID = 'ldrawCatalogV2'
const FAVORITES_KEY = 'bricklab.ldraw.favorites.v2'
const RECENTS_KEY = 'bricklab.ldraw.recents.v2'
const VIEW_KEY = 'bricklab.ldraw.view.v2'
const SORT_KEY = 'bricklab.ldraw.sort.v2'
const CLEAN_KEY = 'bricklab.ldraw.clean.v2'
const PAGE_SIZE = 25

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
  ['Liftarm', 'Балки / Liftarm', 'Beams / Liftarms'],
  ['Axle', 'Оси', 'Axles'],
  ['Gear', 'Шестерни', 'Gears'],
  ['Pin', 'Пины', 'Pins'],
  ['Connector', 'Коннекторы', 'Connectors'],
  ['Steering', 'Рулевое', 'Steering'],
  ['Shock Absorber', 'Подвеска', 'Suspension'],
]

const CATEGORY_RU = {
  Animal:'Животные', Antenna:'Антенны', Arch:'Арки', Bar:'Штанги', Baseplate:'Базовые пластины', Bracket:'Кронштейны',
  Brick:'Кирпичи', Car:'Авто', Cockpit:'Кабины', Cone:'Конусы', Constraction:'Constraction', Container:'Контейнеры',
  Cylinder:'Цилиндры', Dish:'Тарелки', Door:'Двери', Duplo:'Duplo', Electric:'Электрика', Figure:'Фигурки',
  'Figure Accessory':'Аксессуары фигурок', Flag:'Флаги', Glass:'Стёкла', Hinge:'Шарниры', Hose:'Шланги', Magnet:'Магниты',
  'Minifig Accessory':'Аксессуары минифиг', 'Minifig Headwear':'Головные уборы', Panel:'Панели', Plane:'Авиация', Plant:'Растения',
  Plate:'Пластины', Propeller:'Пропеллеры', Rack:'Рейки', Rock:'Скалы', Slope:'Скосы', Sticker:'Стикеры',
  'Sticker Shortcut':'Стикеры (сборки)', Support:'Опоры', Technic:'Technic', Tile:'Тайлы', Train:'Поезда', Tyre:'Шины', Wheel:'Колёса', Window:'Окна',
}

let root = null
let panel = null
let input = null
let results = null
let categorySelect = null
let observer = null
let generation = 0
let searchTimer = 0
let fallbackIndex = null
let categories = []
let categoriesPromise = null
let loading = false
let favorites = readArray(FAVORITES_KEY)
let recents = readArray(RECENTS_KEY)

const state = {
  mode: 'home',
  category: '',
  preset: '',
  query: '',
  page: 1,
  total: 0,
  items: [],
  hasMore: false,
  source: 'ldraw',
  view: localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid',
  sort: ['name','id'].includes(localStorage.getItem(SORT_KEY)) ? localStorage.getItem(SORT_KEY) : 'name',
  direction: 'asc',
  clean: localStorage.getItem(CLEAN_KEY) !== 'false',
}

function readArray(key){
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] }
}
function writeArray(key,value){ try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage denied */ } }
function isRussian(){ return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru' }
function t(){return isRussian()?{
  title:'LDRAW PARTS', search:'Поиск по названию или Design ID…', home:'Подборка', all:'Все', favorites:'Избранное', recent:'Недавние',
  categories:'Все категории', sortName:'По названию', sortId:'По номеру', clean:'Только основные', decorated:'Основные + принты',
  loading:'Загрузка LDraw…', noResults:'Ничего не найдено', loadMore:'Показать ещё', retry:'Повторить',
  source:'LDraw Parts Library', unavailable:'Сайт каталога недоступен. Поиск по Design ID продолжает работать через mirror.',
  added:'добавлено', parts:'деталей', official:'официальных', clear:'Очистить поиск', grid:'Сетка', list:'Список',
  favorite:'В избранное', unfavorite:'Убрать из избранного', add:'Добавить в сцену', emptyFav:'Добавь детали в избранное кнопкой ★', emptyRecent:'Здесь появятся недавно использованные детали',
}:{
  title:'LDRAW PARTS', search:'Search by name or Design ID…', home:'Featured', all:'All', favorites:'Favorites', recent:'Recent',
  categories:'All categories', sortName:'By name', sortId:'By ID', clean:'Core parts only', decorated:'Core + decorated',
  loading:'Loading LDraw…', noResults:'Nothing found', loadMore:'Load more', retry:'Retry',
  source:'LDraw Parts Library', unavailable:'Catalog site unavailable. Design ID search still works through the mirror.',
  added:'added', parts:'parts', official:'official', clear:'Clear search', grid:'Grid', list:'List',
  favorite:'Add to favorites', unfavorite:'Remove from favorites', add:'Add to scene', emptyFav:'Add parts to favorites with ★', emptyRecent:'Recently used parts will appear here',
}}

function categoryLabel(name){ return isRussian() ? (CATEGORY_RU[name] || name) : name }
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function normalizeFile(value){ return String(value || '').replace(/^parts\//i,'').replace(/\\/g,'/').trim() }
function codeOf(file){ return normalizeFile(file).replace(/\.dat$/i,'') }
function parseNumber(value){ const n = Number(String(value||'').replace(/[^0-9]/g,'')); return Number.isFinite(n) ? n : 0 }
function absoluteUrl(value,base=LIST_URL){ try { return new URL(value,base).href } catch { return '' } }
function itemKey(item){ return normalizeFile(item?.file).toLowerCase() }
function savedItem(item){ return { file:normalizeFile(item.file), code:item.code||codeOf(item.file), description:item.description||item.name||`LDraw ${codeOf(item.file)}`, category:item.category||'' } }
function favoriteSet(){ return new Set(favorites.map(item=>itemKey(item))) }
function isFavorite(item){ return favoriteSet().has(itemKey(item)) }

function isCoreItem(item){
  if (!state.clean) return true
  const description = String(item.description || '')
  if (state.category === 'Sticker' || state.category === 'Sticker Shortcut') return true
  if (/^[~=_]/.test(description)) return false
  if (/\b(?:sticker|pattern|physical colour|physical color|moved to|obsolete)\b/i.test(description)) return false
  return true
}

function inferCategory(description=''){
  const value=description.toLowerCase()
  const rules=[
    ['Technic',/\btechnic\b|\bliftarm\b/],['Tyre',/\btyre\b|\btire\b/],['Wheel',/\bwheel\b/],['Brick',/\bbrick\b/],
    ['Plate',/\bplate\b/],['Tile',/\btile\b/],['Slope',/\bslope\b/],['Hinge',/\bhinge\b/],['Panel',/\bpanel\b/],
    ['Electric',/\belectric\b|\bmotor\b|\bsensor\b/],['Door',/\bdoor\b/],['Animal',/\banimal\b/],['Plant',/\bplant\b/],
    ['Minifig Accessory',/\bminifig\b/],['Sticker',/\bsticker\b/],
  ]
  return rules.find(([,rx])=>rx.test(value))?.[0] || 'Other'
}

function ensureStyles(){
  if(document.getElementById(STYLE_ID))return
  const link=document.createElement('link'); link.id=STYLE_ID; link.rel='stylesheet'; link.href=new URL('./catalog-v2.css?v=ldraw-catalog-20260910-v2',import.meta.url).href; document.head.append(link)
}
function icons(){ window.lucide?.createIcons?.({attrs:{'stroke-width':1.7,'aria-hidden':'true'}}) }

function shell(){
  const c=t()
  return `<div class="ld2-root ${state.view==='list'?'is-list':'is-grid'}" id="${ROOT_ID}">
    <div class="ld2-search"><i data-lucide="search"></i><input id="ld2Search" autocomplete="off" spellcheck="false" placeholder="${c.search}"><button type="button" data-ld2-clear title="${c.clear}"><i data-lucide="x"></i></button><kbd>Ctrl K</kbd></div>
    <div class="ld2-primary-nav">
      <button type="button" data-mode="home"><i data-lucide="sparkles"></i><span>${c.home}</span></button>
      <button type="button" data-mode="favorites"><i data-lucide="star"></i><span>${c.favorites}</span><b data-fav-count>${favorites.length}</b></button>
      <button type="button" data-mode="recent"><i data-lucide="history"></i><span>${c.recent}</span></button>
      <button type="button" data-mode="all"><i data-lucide="blocks"></i><span>${c.all}</span></button>
    </div>
    <div class="ld2-pinned" data-ld2-pinned></div>
    <div class="ld2-technic hidden" data-ld2-technic></div>
    <div class="ld2-category-row"><i data-lucide="folders"></i><select id="ld2Category"><option value="">${c.categories}</option></select></div>
    <div class="ld2-toolbar">
      <select id="ld2Sort"><option value="name">${c.sortName}</option><option value="id">${c.sortId}</option></select>
      <button type="button" data-ld2-direction title="A → Z"><i data-lucide="arrow-down-a-z"></i></button>
      <button type="button" data-ld2-view title="${state.view==='grid'?c.list:c.grid}"><i data-lucide="${state.view==='grid'?'list':'layout-grid'}"></i></button>
      <button type="button" class="ld2-clean ${state.clean?'active':''}" data-ld2-clean title="${state.clean?c.clean:c.decorated}"><i data-lucide="${state.clean?'package-check':'palette'}"></i><span>${state.clean?c.clean:c.decorated}</span></button>
    </div>
    <div class="ld2-summary"><span data-ld2-summary>${c.loading}</span><span class="ld2-source"><span class="dot"></span>${c.source}</span></div>
    <div class="ld2-scroll" data-ld2-scroll><div class="ld2-results" data-ld2-results></div><button class="ld2-more hidden" type="button" data-ld2-more>${c.loadMore}</button><div class="ld2-sentinel" data-ld2-sentinel></div></div>
    <div class="ld2-foot">Parts geometry provided by the LDraw Parts Library.</div>
  </div>`
}

function renderPinned(){
  const host=root?.querySelector('[data-ld2-pinned]'); if(!host)return
  host.innerHTML=PINNED_CATEGORIES.map(([name,icon])=>`<button type="button" class="${state.category===name?'active':''}" data-category="${escapeHtml(name)}" title="${escapeHtml(categoryLabel(name))}"><i data-lucide="${icon}"></i><span>${escapeHtml(categoryLabel(name))}</span></button>`).join('')
  host.querySelectorAll('[data-category]').forEach(button=>button.onclick=()=>selectCategory(button.dataset.category||''))
  icons()
}

function renderTechnicPresets(){
  const host=root?.querySelector('[data-ld2-technic]'); if(!host)return
  host.classList.toggle('hidden',state.category!=='Technic')
  if(state.category!=='Technic'){host.innerHTML='';return}
  host.innerHTML=TECHNIC_PRESETS.map(([value,ru,en])=>`<button type="button" class="${state.preset===value?'active':''}" data-preset="${escapeHtml(value)}">${escapeHtml(isRussian()?ru:en)}</button>`).join('')
  host.querySelectorAll('[data-preset]').forEach(button=>button.onclick=()=>{state.preset=button.dataset.preset||'';renderTechnicPresets();void resetRemote()})
}

function renderCategories(){
  if(!categorySelect)return
  const c=t(); const current=state.category
  categorySelect.innerHTML=`<option value="">${c.categories}</option>`+categories.map(item=>`<option value="${escapeHtml(item.name)}">${escapeHtml(categoryLabel(item.name))}${item.official?` · ${item.official.toLocaleString(isRussian()?'ru-RU':'en-US')}`:''}</option>`).join('')
  categorySelect.value=current
}

function modeButtons(){ root?.querySelectorAll('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===state.mode)) }
function syncToolbar(){
  if(!root)return
  root.classList.toggle('is-grid',state.view==='grid'); root.classList.toggle('is-list',state.view==='list')
  const sort=root.querySelector('#ld2Sort'); if(sort)sort.value=state.sort
  const clean=root.querySelector('[data-ld2-clean]'); if(clean){clean.classList.toggle('active',state.clean);clean.title=state.clean?t().clean:t().decorated;clean.querySelector('span').textContent=state.clean?t().clean:t().decorated}
  modeButtons(); renderPinned(); renderTechnicPresets(); renderCategories()
}

function parsePartList(html,sourceUrl=LIST_URL){
  const doc=new DOMParser().parseFromString(html,'text/html')
  const map=new Map()
  const leaves=[...doc.querySelectorAll('a,span,div,td')].filter(el=>el.childElementCount===0)
  for(const element of leaves){
    const own=(element.textContent||'').replace(/\s+/g,' ').trim()
    const match=own.match(/^(parts\/(?:[^\s]+\.dat))(?:\s+(.*))?$/i)
    if(!match)continue
    const path=match[1].replace(/\\/g,'/')
    if(/^parts\/s\//i.test(path)||!/^parts\/[^/]+\.dat$/i.test(path))continue
    let container=element.closest('tr,li,article')||element.parentElement
    let text=match[2]||''
    for(let depth=0;container&&depth<4&&!text;depth+=1,container=container.parentElement){
      const candidate=(container.textContent||'').replace(/\s+/g,' ').trim()
      if(candidate.length>own.length&&candidate.length<900)text=candidate.replace(own,' ').trim()
    }
    text=text.replace(/\bDownload(?: zip)?\b/gi,' ').replace(/\bOfficial\b/gi,' ').replace(/\bUnofficial\b/gi,' ').replace(/\s+/g,' ').trim()
    const file=normalizeFile(path)
    const description=text||`LDraw ${codeOf(file)}`
    if(!map.has(file))map.set(file,{file,code:codeOf(file),description,category:state.category||inferCategory(description),detailUrl:absoluteUrl(element.closest('a[href]')?.getAttribute('href')||'',sourceUrl)})
  }
  const body=(doc.body?.textContent||'').replace(/\s+/g,' ')
  const totalMatch=body.match(/([0-9][0-9,.\s]*)\s+results?\b/i)
  const total=totalMatch?parseNumber(totalMatch[1]):map.size
  return {items:[...map.values()],total}
}

function parseCategories(html){
  const doc=new DOMParser().parseFromString(html,'text/html'); const output=[]
  for(const row of doc.querySelectorAll('tr')){
    const cells=[...row.querySelectorAll('td')]; if(cells.length<4)continue
    const link=cells.find(cell=>cell.querySelector('a[href]'))?.querySelector('a[href]'); if(!link)continue
    const name=(link.textContent||'').replace(/\s+/g,' ').trim(); if(!name||/^category$/i.test(name))continue
    const linkCell=cells.findIndex(cell=>cell.contains(link)); const total=parseNumber(cells[linkCell+1]?.textContent); const official=parseNumber(cells[linkCell+2]?.textContent)
    output.push({name,total,official,href:absoluteUrl(link.getAttribute('href')||'',CATEGORY_URL)})
  }
  return [...new Map(output.map(item=>[item.name,item])).values()].sort((a,b)=>a.name.localeCompare(b.name,'en'))
}

async function fetchText(url){
  const response=await fetch(url,{mode:'cors',cache:'force-cache',headers:{Accept:'text/html'}})
  if(!response.ok)throw new Error(`LDraw catalog HTTP ${response.status}`)
  return response.text()
}

async function ensureCategories(){
  if(categories.length)return categories
  categoriesPromise??=(async()=>{
    try{ categories=parseCategories(await fetchText(CATEGORY_URL)) }catch(error){
      console.warn('[BrickLab LDraw] category list unavailable',error)
      categories=PINNED_CATEGORIES.map(([name])=>({name,total:0,official:0}))
    }
    renderCategories(); return categories
  })()
  return categoriesPromise
}

function remoteUrl(page=1){
  const url=new URL(LIST_URL)
  const effective=state.query.trim() || state.preset
  if(effective)url.searchParams.set('tableSearch',effective)
  if(state.category)url.searchParams.set('tableFilters[category][values][0]',state.category)
  if(page>1)url.searchParams.set('page',String(page))
  return url.href
}

async function enrichFiles(files,token){
  const queue=[...files]; const output=[]
  const workers=Array.from({length:Math.min(6,queue.length)},async()=>{
    while(queue.length){const entry=queue.shift();if(!entry)break;try{const meta=await getLDrawMetadata(entry.file||entry);output.push({...entry,...meta,description:meta.description||entry.description})}catch{output.push(typeof entry==='string'?{file:entry,code:codeOf(entry),description:`LDraw ${codeOf(entry)}`} : entry)}if(token!==generation)return}
  })
  await Promise.all(workers); return output
}

async function loadHome(){
  const token=++generation; loading=true; updateSummary()
  const items=await enrichFiles(HOME_FILES.map(file=>({file,code:codeOf(file)})),token)
  if(token!==generation)return
  state.items=items.map(item=>({...item,category:item.category||inferCategory(item.description)})); state.total=state.items.length; state.hasMore=false; state.page=1; state.source='mirror'; loading=false; renderResults()
}

async function loadSavedMode(kind){
  generation+=1; loading=false; state.hasMore=false; state.page=1
  const source=kind==='favorites'?favorites:recents
  state.items=source.map(savedItem); state.total=state.items.length; state.source='local'; renderResults()
}

async function ensureFallbackIndex(){ if(!fallbackIndex)fallbackIndex=await getLDrawIndex(); return fallbackIndex }

async function fallbackRemote(reset,token){
  const c=t(); const all=await ensureFallbackIndex(); if(token!==generation)return
  const q=(state.query||state.preset||'').toLowerCase().replace(/\.dat$/,'').replace(/^ldraw-/,'')
  if(state.category&&!q){state.items=[];state.total=0;state.hasMore=false;state.source='fallback-category';loading=false;renderResults(c.unavailable);return}
  const filtered=q?all.filter(item=>item.code.toLowerCase().includes(q)||item.file.toLowerCase().includes(q)):all
  const page=reset?1:state.page; const slice=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE)
  const enriched=await enrichFiles(slice,token); if(token!==generation)return
  state.items=reset?enriched:[...state.items,...enriched]; state.total=filtered.length; state.hasMore=page*PAGE_SIZE<filtered.length; state.source='mirror'; loading=false; renderResults(c.unavailable)
}

async function loadRemote({reset=false}={}){
  if(loading)return
  if(reset){state.page=1;state.items=[];state.total=0;state.hasMore=false}
  const token=reset?++generation:generation; loading=true; updateSummary()
  try{
    const page=state.page
    const parsed=parsePartList(await fetchText(remoteUrl(page)),remoteUrl(page)); if(token!==generation)return
    const before=new Set(state.items.map(itemKey)); const fresh=parsed.items.filter(item=>!before.has(itemKey(item)))
    state.items=reset?fresh:[...state.items,...fresh]; state.total=parsed.total; state.source='official'; state.hasMore=fresh.length>0&&(parsed.total===0||state.items.length<parsed.total); loading=false; renderResults()
  }catch(error){
    console.warn('[BrickLab LDraw] official parts list unavailable, using mirror fallback',error)
    await fallbackRemote(reset,token)
  }
}

async function resetRemote(){
  state.mode=state.category?'category':'all'; state.page=1; state.items=[]; state.total=0; state.hasMore=false; modeButtons(); syncToolbar(); await loadRemote({reset:true})
}

function selectCategory(name){
  state.category=name; state.preset=''; state.query=''; if(input)input.value='';
  if(categorySelect)categorySelect.value=name; void resetRemote()
}

function sortedVisible(){
  const list=state.items.filter(isCoreItem)
  const factor=state.direction==='asc'?1:-1
  list.sort((a,b)=>{
    if(state.sort==='id')return factor*String(a.code||codeOf(a.file)).localeCompare(String(b.code||codeOf(b.file)),'en',{numeric:true,sensitivity:'base'})
    return factor*String(a.description||'').localeCompare(String(b.description||''),isRussian()?'ru':'en',{numeric:true,sensitivity:'base'})
  })
  return list
}

function iconFor(item){
  const category=item.category||inferCategory(item.description)
  return ({Technic:'settings-2',Brick:'box',Plate:'layers-2',Tile:'square',Slope:'triangle',Wheel:'circle-dot',Tyre:'circle',Hinge:'panel-top',Panel:'panel-top-open',Electric:'zap',Door:'door-open',Animal:'rabbit',Plant:'sprout',Sticker:'badge'}[category]||'box')
}

function cardMarkup(item){
  const fav=isFavorite(item); const c=t(); const category=item.category||inferCategory(item.description); const code=item.code||codeOf(item.file)
  return `<article class="ld2-card" data-file="${escapeHtml(item.file)}">
    <button class="ld2-main" type="button" data-add="${escapeHtml(item.file)}" title="${c.add}">
      <span class="ld2-thumb"><i data-lucide="${iconFor(item)}"></i><b>${escapeHtml(code)}</b></span>
      <span class="ld2-copy"><strong>${escapeHtml(item.description||`LDraw ${code}`)}</strong><small><span>${escapeHtml(categoryLabel(category))}</span><code>${escapeHtml(code)}</code></small></span>
      <span class="ld2-plus"><i data-lucide="plus"></i></span>
    </button>
    <button class="ld2-star ${fav?'active':''}" type="button" data-favorite="${escapeHtml(item.file)}" title="${fav?c.unfavorite:c.favorite}"><i data-lucide="star"></i></button>
  </article>`
}

function renderResults(note=''){
  if(!results)return
  const visible=sortedVisible(); const c=t()
  if(!visible.length){
    const message=state.mode==='favorites'?c.emptyFav:state.mode==='recent'?c.emptyRecent:c.noResults
    results.innerHTML=`<div class="ld2-empty"><i data-lucide="package-search"></i><strong>${escapeHtml(message)}</strong>${note?`<small>${escapeHtml(note)}</small>`:''}</div>`
  }else results.innerHTML=visible.map(cardMarkup).join('')
  const more=root.querySelector('[data-ld2-more]'); more.classList.toggle('hidden',!state.hasMore); more.disabled=loading
  root.querySelector('[data-fav-count]').textContent=favorites.length
  updateSummary(note); icons()
}

function updateSummary(note=''){
  const host=root?.querySelector('[data-ld2-summary]'); if(!host)return
  const c=t(); if(loading){host.textContent=c.loading;return}
  const visible=sortedVisible().length
  if(note){host.textContent=`${visible} ${c.parts} · ${note}`;return}
  const total=state.total||state.items.length
  host.textContent=total?`${visible.toLocaleString(isRussian()?'ru-RU':'en-US')} / ${total.toLocaleString(isRussian()?'ru-RU':'en-US')} ${c.parts}`:`0 ${c.parts}`
  if(panel?.querySelector('#partCount'))panel.querySelector('#partCount').textContent=total?total.toLocaleString(isRussian()?'ru-RU':'en-US'):''
}

function findStateItem(file){ const key=normalizeFile(file).toLowerCase(); return state.items.find(item=>itemKey(item)===key)||favorites.find(item=>itemKey(item)===key)||recents.find(item=>itemKey(item)===key)||{file:normalizeFile(file),code:codeOf(file)} }
function toggleFavorite(file){
  const item=savedItem(findStateItem(file)); const key=itemKey(item); const index=favorites.findIndex(value=>itemKey(value)===key)
  if(index>=0)favorites.splice(index,1);else favorites.unshift(item)
  favorites=favorites.slice(0,500);writeArray(FAVORITES_KEY,favorites);renderResults()
}
function rememberRecent(item){
  const saved=savedItem(item); const key=itemKey(saved); recents=[saved,...recents.filter(value=>itemKey(value)!==key)].slice(0,48); writeArray(RECENTS_KEY,recents)
}

function clickNativePart(def){
  const legacy=document.getElementById('partSearch'); if(!legacy)return false
  legacy.value=''; legacy.dispatchEvent(new Event('input',{bubbles:true}))
  const click=()=>{const card=document.querySelector(`#partsList .part-card[data-part="${CSS.escape(def.id)}"]`);if(card){card.click();return true}return false}
  if(click())return true
  requestAnimationFrame(()=>click())
  return true
}

async function addPart(file,button){
  const item=findStateItem(file); button?.classList.add('loading')
  try{
    let metadata=item
    if(!metadata.description||/^LDraw\s/i.test(metadata.description))metadata={...metadata,...await getLDrawMetadata(file)}
    const def=registerLDrawPart(metadata); rememberRecent(metadata); clickNativePart(def)
    if(button){button.classList.remove('loading');button.classList.add('added');setTimeout(()=>button.classList.remove('added'),700)}
  }catch(error){console.warn('[BrickLab LDraw] add failed',error);button?.classList.remove('loading')}
}

async function loadMore(){
  if(!state.hasMore||loading||!['all','category'].includes(state.mode))return
  state.page+=1; await loadRemote({reset:false})
}

function setMode(mode){
  state.mode=mode; state.category=''; state.preset=''; state.query=''; if(input)input.value=''; if(categorySelect)categorySelect.value=''; syncToolbar()
  if(mode==='home')void loadHome(); else if(mode==='favorites'||mode==='recent')void loadSavedMode(mode); else void loadRemote({reset:true})
}

function bind(){
  input=root.querySelector('#ld2Search'); results=root.querySelector('[data-ld2-results]'); categorySelect=root.querySelector('#ld2Category')
  root.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.mode||'home'))
  root.querySelector('[data-ld2-clear]').onclick=()=>{input.value='';state.query='';input.focus(); if(state.mode==='home')void loadHome();else if(['favorites','recent'].includes(state.mode))void loadSavedMode(state.mode);else void resetRemote()}
  input.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=input.value.trim(); if(['favorites','recent'].includes(state.mode)){renderResults();return} if(state.mode==='home'&&!state.query){void loadHome();return} state.mode=state.category?'category':'all';modeButtons();void loadRemote({reset:true})},240)})
  categorySelect.onchange=()=>{const value=categorySelect.value;if(value)selectCategory(value);else setMode('all')}
  root.querySelector('#ld2Sort').onchange=event=>{state.sort=event.target.value;localStorage.setItem(SORT_KEY,state.sort);renderResults()}
  root.querySelector('[data-ld2-direction]').onclick=event=>{state.direction=state.direction==='asc'?'desc':'asc';event.currentTarget.innerHTML=`<i data-lucide="${state.direction==='asc'?'arrow-down-a-z':'arrow-up-z-a'}"></i>`;renderResults()}
  root.querySelector('[data-ld2-view]').onclick=()=>{state.view=state.view==='grid'?'list':'grid';localStorage.setItem(VIEW_KEY,state.view);syncToolbar();renderResults()}
  root.querySelector('[data-ld2-clean]').onclick=()=>{state.clean=!state.clean;localStorage.setItem(CLEAN_KEY,String(state.clean));syncToolbar();renderResults()}
  root.querySelector('[data-ld2-more]').onclick=()=>void loadMore()
  results.addEventListener('click',event=>{const star=event.target.closest('[data-favorite]');if(star){event.preventDefault();event.stopPropagation();toggleFavorite(star.dataset.favorite);return}const add=event.target.closest('[data-add]');if(add)void addPart(add.dataset.add,add.closest('.ld2-card'))})
  observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void loadMore()},{root:root.querySelector('[data-ld2-scroll]'),rootMargin:'180px'})
  observer.observe(root.querySelector('[data-ld2-sentinel]'))
}

function updateLanguage(){
  if(!root)return
  const c=t(); input.placeholder=c.search
  root.querySelector('[data-mode="home"] span').textContent=c.home;root.querySelector('[data-mode="favorites"] span').textContent=c.favorites;root.querySelector('[data-mode="recent"] span').textContent=c.recent;root.querySelector('[data-mode="all"] span').textContent=c.all
  root.querySelector('[data-ld2-more]').textContent=c.loadMore; renderPinned();renderTechnicPresets();renderCategories();syncToolbar();renderResults()
}

async function install(){
  panel=document.querySelector('.parts-panel'); if(!panel||!document.getElementById('partsList')||!document.getElementById('partSearch'))return requestAnimationFrame(install)
  if(document.getElementById(ROOT_ID))return
  ensureStyles(); panel.classList.add('ldraw-catalog-v2-active')
  const title=panel.querySelector('.panel-title'); const label=title?.querySelector('span:first-child'); if(label)label.textContent=t().title
  root=document.createElement('div'); root.innerHTML=shell(); const built=root.firstElementChild; root.replaceWith(built); root=built; panel.append(root)
  bind(); syncToolbar(); icons(); void ensureCategories(); await loadHome()
}

document.addEventListener('keydown',event=>{
  if(!(event.ctrlKey||event.metaKey)||event.code!=='KeyK')return
  if(!root||document.querySelector('.parts-panel')?.classList.contains('panel-hidden'))return
  event.preventDefault();input.focus();input.select()
},true)
window.addEventListener('bricklab:languagechange',updateLanguage)

install()
window.BrickLabLDrawCatalog=Object.freeze({
  focus:()=>{input?.focus();input?.select()},
  showCategory:selectCategory,
  showAll:()=>setMode('all'),
  showFavorites:()=>setMode('favorites'),
})
