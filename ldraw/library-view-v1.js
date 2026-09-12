import { FAMILIES, filterLibrary, readPreference, writePreference } from './library-model-v1.js?v=parts-library-20260912-v3'

export const LIBRARY_KEYS = Object.freeze({ family:'bricklab.library.family.v1', favorites:'bricklab.library.favorites.v1', recents:'bricklab.library.recents.v1' })
const PAGE_SIZE=48
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

// Global icon replacement also mutates the hidden native catalog. Those mutations
// must never trigger refresh → createIcons → mutation → refresh feedback loops.
export function hasNewPreview(records) {
  return records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1 && (node.tagName==='IMG'||node.querySelector?.('img'))))
}

// Dependency-injected UI: no Three.js, physics, project writes or part registration.
export function mountPartsLibrary(root, { storage=globalThis.localStorage, language=()=>document.documentElement.lang, insert, context=()=>({}), preview=()=>null, info=()=>({}), onClose=()=>{} }) {
  const saved=readPreference(storage,LIBRARY_KEYS.family,null)
  const array=key=>{const value=readPreference(storage,key,[]);return Array.isArray(value)?value.filter(x=>typeof x==='string'):[]}
  let family=FAMILIES.some(f=>f.id===saved)?saved:null
  let favorites=array(LIBRARY_KEYS.favorites),recents=array(LIBRARY_KEYS.recents)
  let items=[],category='',query='',tab='all',page=0,selected=null,loading=true,warning='',busy=false,timer
  let destroyed=false
  const counts=new Map()
  const expanded=new Set(['gears','wheels'])
  const t=(en,ru)=>language()==='ru'?ru:en
  const label=n=>t(n.en,n.ru)
  const familyDef=()=>FAMILIES.find(f=>f.id===family)
  const byKey=key=>items.find(item=>item.key===key)
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`
  const icons=()=>globalThis.lucide?.createIcons?.({attrs:{'aria-hidden':'true','stroke-width':1.6}})
  const count=(id,path='')=>counts.get(`${id}:${path}`)||0

  function illustration(f) {
    // Small local vector illustrations, not remote imagery or extra WebGL contexts.
    const drawings={
      system:'<path d="M12 30 42 14 78 30 48 48Z M12 30v24l36 18 30-18V30 M48 48v24"/><ellipse cx="35" cy="26" rx="7" ry="4"/><ellipse cx="53" cy="34" rx="7" ry="4"/>',
      technic:'<path d="M16 54 57 18a12 12 0 0 1 16 18L32 72a12 12 0 0 1-16-18Z"/><circle cx="27" cy="61" r="5"/><circle cx="46" cy="45" r="5"/><circle cx="64" cy="28" r="5"/>',
      duplo:'<path d="M14 34 43 20 76 34v30L46 78 14 62Z M14 34l32 17 30-17 M46 51v27"/><ellipse cx="44" cy="23" rx="14" ry="7"/><path d="M30 23v9c0 10 28 10 28 0v-9"/>',
      bionicle:'<circle cx="44" cy="19" r="9"/><path d="M25 36h38l-8 24H33Z M25 38 13 57m50-19 13 19M35 62l-9 18m28-18 9 18"/><circle cx="13" cy="60" r="5"/><circle cx="76" cy="60" r="5"/>',
      trains:'<path d="M14 29h59v30H14Z M20 29V17h26v12 M52 29V17h13v12 M11 78h70 M17 72h58"/><circle cx="28" cy="63" r="8"/><circle cx="61" cy="63" r="8"/>',
      power:'<rect x="20" y="24" width="52" height="46" rx="8"/><path d="M35 24V14h22v10 M48 33 37 48h16L42 62 M72 45h10v14"/>',
      other:'<path d="m46 14 29 17v34L46 81 17 65V31Z M17 31l29 17 29-17 M46 48v33"/><circle cx="46" cy="31" r="5"/>',
    }
    return `<svg class="pl-family-art" viewBox="0 0 92 92" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true">${drawings[f.id]}</svg>`
  }
  function render() {
    if(destroyed)return
    root.className='pl-root'
    root.innerHTML=`<header class="pl-heading"><div><small>BRICKLAB / ${t('PARTS LIBRARY','БИБЛИОТЕКА ДЕТАЛЕЙ')}</small><h2>${family?escape(familyDef().name):t('Choose your building system','Выберите семейство')}</h2></div>${family?`<button type="button" data-change>${icon('grid-2x2')}${t('Change family','Сменить семейство')}</button>`:''}</header>
      ${family?`<div class="pl-search"><label for="plSearch">${icon('search')}<span class="pl-sr">${t('Search parts','Поиск деталей')}</span></label><input id="plSearch" type="search" autocomplete="off" placeholder="${t('Name, ID, axle 5, gear 24…','Название, ID, ось 5, gear 24…')}" value="${escape(query)}"><kbd>⌘ / Ctrl K</kbd></div>
      <nav class="pl-tabs" aria-label="${t('Quick sections','Быстрые разделы')}">${[['all','All','Все'],['recent','Recent','Недавние'],['favorites','Favorites','Избранное'],['project','In Project','В проекте'],['compatible','Compatible','Совместимые']].map(([id,en,ru])=>`<button type="button" data-tab="${id}" aria-pressed="${tab===id}">${t(en,ru)}</button>`).join('')}</nav>
      <div class="pl-body"><nav class="pl-tree" aria-label="${t('Categories','Категории')}"></nav><section class="pl-content"><div class="pl-summary" role="status"></div><div class="pl-scroll"><div class="pl-results" data-results></div></div><div class="pl-paging"></div></section></div><section class="pl-detail" aria-label="${t('Selected part','Выбранная деталь')}"></section>`:
      `<p class="pl-intro">${t('Find the right piece. Build something remarkable.','Найдите нужную деталь для вашей следующей идеи.')}</p><div class="pl-families">${FAMILIES.map(f=>`<button type="button" class="pl-family" data-family="${f.id}" style="--family-color:${f.color}">${illustration(f)}<span><strong>${f.name}</strong><small>${label(f)}</small><em>${loading?t('Loading…','Загрузка…'):count(f.id).toLocaleString()} ${loading?'':t('parts','деталей')}</em></span>${icon('chevron-right')}</button>`).join('')}</div>`}
      <footer class="pl-footer">BrickLab + LDraw <span>${t('One library. Every building system.','Одна библиотека — все системы сборки.')}</span></footer>`
    if(family){renderTree();renderResults();renderDetail()}
    icons()
  }
  function renderTree() {
    const tree=root.querySelector('.pl-tree');if(!tree)return
    const row=(n,parent='')=>{
      const path=parent?`${parent}/${n.id}`:n.id,has=n.children.length>0
      return `<div class="pl-tree-node"><div class="pl-tree-row">${has?`<button type="button" class="pl-expand" data-expand="${path}" aria-expanded="${expanded.has(path)}" aria-label="${escape(label(n))}">${expanded.has(path)?'−':'+'}</button>`:'<span class="pl-tree-spacer"></span>'}<button type="button" data-category="${path}" aria-current="${category===path}"><span>${escape(label(n))}</span><small>${count(family,path)}</small></button></div>${has&&expanded.has(path)?`<div class="pl-children">${n.children.map(child=>row(child,path)).join('')}</div>`:''}</div>`
    }
    tree.innerHTML=`<button type="button" class="pl-tree-all" data-category="" aria-current="${!category}">${t('All categories','Все категории')} <small>${count(family)}</small></button>${familyDef().tree.map(n=>row(n)).join('')}`
  }
  function imageMarkup(item,large=false) {
    const url=preview(item)
    return `<span class="pl-thumb ${large?'pl-large':''}"><span class="pl-preview-fallback">${illustration(familyDef()||FAMILIES[0])}<small>${t('Preview unavailable','Нет превью')}</small></span>${url?`<img src="${escape(url)}" alt="${escape(item.name||item.description)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}<code>${escape(item.code)}</code></span>`
  }
  function bindImages(host) {
    host.querySelectorAll('img').forEach(img=>{
      img.onload=()=>img.parentElement?.classList.add('has-image')
      img.onerror=()=>{img.hidden=true;img.parentElement?.classList.remove('has-image')}
      if(img.complete&&img.naturalWidth)img.onload()
    })
  }
  function filtered() { return filterLibrary(items,{family,category,query,tab,favorites,recents,...context()}) }
  function renderResults() {
    if(!family)return
    const all=filtered();page=Math.min(page,Math.max(0,Math.ceil(all.length/PAGE_SIZE)-1))
    const shown=all.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)
    root.querySelector('.pl-summary').textContent=loading?t('Loading catalog…','Загрузка каталога…'):warning||`${all.length.toLocaleString()} ${t('parts','деталей')}${tab==='compatible'?t(' · verified matches only',' · только подтверждённые пары'):''}`
    root.querySelector('[data-results]').innerHTML=shown.length?shown.map(item=>`<article class="pl-card ${selected===item.key?'selected':''}" data-key="${escape(item.key)}"><button type="button" class="pl-select" data-select="${escape(item.key)}" aria-pressed="${selected===item.key}" title="${escape(item.name||item.description)}">${imageMarkup(item)}<strong>${escape(item.name||item.description)}</strong><small>${item.source} · ${escape(item.code)}</small></button><div class="pl-card-actions"><button type="button" data-favorite="${escape(item.key)}" aria-pressed="${favorites.includes(item.key)}" aria-label="${t('Favorite','В избранное')}">${favorites.includes(item.key)?'★':'☆'}</button><button type="button" data-add="${escape(item.key)}" ${busy?'disabled':''} aria-label="${t('Add','Добавить')} ${escape(item.code)}">+ ${t('Add','Добавить')}</button></div></article>`).join(''):`<div class="pl-empty">${icon('search')}<strong>${t('No matching parts','Нет подходящих деталей')}</strong><p>${tab==='compatible'?t('Select a part with a verified Smart Assembly pairing. Unverified fits are never guessed.','Выберите деталь с проверенной парой Smart Assembly. Неподтверждённые сопряжения не угадываются.'):t('Try a shorter search or another category. Sections stay within this family.','Попробуйте другой запрос или категорию. Разделы ограничены выбранным семейством.')}</p></div>`
    root.querySelector('.pl-paging').innerHTML=`<button type="button" data-page="-1" ${page===0?'disabled':''}>${t('Previous','Назад')}</button><span>${all.length?page+1:0} / ${Math.ceil(all.length/PAGE_SIZE)}</span><button type="button" data-page="1" ${(page+1)*PAGE_SIZE>=all.length?'disabled':''}>${t('Next','Далее')}</button>`
    bindImages(root)
    icons()
  }
  function renderDetail() {
    const host=root.querySelector('.pl-detail');if(!host)return
    const item=byKey(selected)
    if(!item){host.innerHTML=`<span>${t('Select a card to inspect. Use + Add or double-click to place.','Выберите карточку для просмотра. + Добавить или двойной клик — вставка.')}</span>`;return}
    const meta=info(item)||{}
    host.innerHTML=`${imageMarkup(item,true)}<div><strong>${escape(item.name||item.description)}</strong><p>${escape(item.description)}</p><small>${item.source} · ${escape(item.code)}${meta.size?` · ${escape(meta.size)}`:''}</small><small>${t('Mechanical class','Механический класс')}: ${escape(meta.mechanical||t('not available','нет данных'))}</small><small>${t('Connectors','Коннекторы')}: ${escape(meta.connectors||t('not resolved','не загружены'))}</small></div>`
    bindImages(host)
    icons()
  }
  async function add(key) {
    if(busy)return
    const item=byKey(key);if(!item)return
    busy=true;renderResults()
    try {
      const result=await insert(item)
      if(result===false)throw Error(t('Insertion unavailable in this mode','Вставка недоступна в этом режиме'))
      recents=[key,...recents.filter(x=>x!==key)].slice(0,60);writePreference(storage,LIBRARY_KEYS.recents,recents)
      selected=key;warning='';renderDetail()
    } catch(error) { warning=t('Could not add part: ','Не удалось добавить деталь: ')+(error?.message||'unknown error') }
    finally { busy=false;if(!destroyed)renderResults() }
  }
  function click(event) {
    const b=event.target.closest('button');if(!b||!root.contains(b))return
    if(b.hasAttribute('data-family')){family=b.dataset.family;category='';query='';tab='all';page=0;selected=null;writePreference(storage,LIBRARY_KEYS.family,family);render();root.querySelector('input')?.focus()}
    else if(b.hasAttribute('data-change')){family=null;render();root.querySelector('[data-family]')?.focus()}
    else if(b.hasAttribute('data-expand')){const id=b.dataset.expand;expanded.has(id)?expanded.delete(id):expanded.add(id);renderTree();root.querySelector(`[data-expand="${id}"]`)?.focus()}
    else if(b.hasAttribute('data-category')){category=b.dataset.category;page=0;renderTree();renderResults()}
    else if(b.hasAttribute('data-tab')){tab=b.dataset.tab;page=0;root.querySelectorAll('[data-tab]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.tab===tab)));renderResults()}
    else if(b.hasAttribute('data-select')){selected=b.dataset.select;root.querySelectorAll('.pl-card').forEach(n=>{n.classList.toggle('selected',n.dataset.key===selected);n.querySelector('[data-select]').setAttribute('aria-pressed',String(n.dataset.key===selected))});renderDetail()}
    else if(b.hasAttribute('data-favorite')){const key=b.dataset.favorite;favorites=favorites.includes(key)?favorites.filter(x=>x!==key):[key,...favorites].slice(0,600);writePreference(storage,LIBRARY_KEYS.favorites,favorites);renderResults()}
    else if(b.hasAttribute('data-add'))void add(b.dataset.add)
    else if(b.hasAttribute('data-page')){page+=Number(b.dataset.page);renderResults();root.querySelector('.pl-scroll').scrollTop=0}
  }
  function input(event){if(event.target.id!=='plSearch')return;query=event.target.value;page=0;clearTimeout(timer);timer=setTimeout(()=>renderResults(),100)}
  function dblclick(event){const b=event.target.closest('[data-select]');if(b)void add(b.dataset.select)}
  function keydown(event){event.stopPropagation();if(event.key==='Escape'){event.preventDefault();onClose()}}
  // Bubble isolation allows native controls, but prevents BUILD shortcuts while typing.
  root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('dblclick',dblclick);root.addEventListener('keydown',keydown)
  const isolatePointer=event=>event.stopPropagation()
  root.addEventListener('pointerdown',isolatePointer)
  render()
  return Object.freeze({
    setItems(next,{pending=false,message=''}={}){
      items=next;loading=pending;warning=message;counts.clear()
      for(const item of items){const paths=['',item.category.split('/')[0]];if(item.category.includes('/'))paths.push(item.category);for(const path of paths){const key=`${item.family}:${path}`;counts.set(key,(counts.get(key)||0)+1)}}
      if(family){renderTree();renderResults();renderDetail()}else render()
    },
    refresh(){if(family){renderResults();renderDetail()}},
    languageChanged:render,
    focus(){if(!family){family=FAMILIES.some(f=>f.id===saved)?saved:'system';render()}root.querySelector('input')?.focus()},
    showFamily(id){if(!FAMILIES.some(f=>f.id===id))return;family=id;category='';query='';page=0;writePreference(storage,LIBRARY_KEYS.family,id);render()},
    showSection(value){tab=value;page=0;if(!family)family='system';render()},
    state:()=>({family,category,query,tab,page,selected,total:items.length}),
    destroy(){destroyed=true;clearTimeout(timer);root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('dblclick',dblclick);root.removeEventListener('keydown',keydown);root.removeEventListener('pointerdown',isolatePointer);root.replaceChildren()},
  })
}
