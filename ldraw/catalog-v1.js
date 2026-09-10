import { getLDrawIndex, getLDrawMetadata, registerLDrawPart } from './runtime-v3.js?v=ldraw-20260910-v3'

const STYLE_ID = 'bricklab-ldraw-catalog-v1-css'
const LAYER_ID = 'bricklabLDrawCatalog'
const SEED_FILES = [
  '3001.dat','3003.dat','3004.dat','3005.dat','3010.dat','3020.dat','3023b.dat','3034.dat',
  '3701.dat','3894.dat','3895.dat','2780.dat','4519.dat','3705.dat','3706.dat','3707.dat','3708.dat',
  '3647.dat','4019.dat','3648.dat','32270.dat',
]
const metadataMemo = new Map()
let index = []
let layer = null
let input = null
let results = null
let status = null
let searchTimer = 0
let queryGeneration = 0
let opening = false

function isRussian(){return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'}
function copy(){return isRussian()?{
  title:'Библиотека LDraw', subtitle:'Официальные детали · геометрия загружается по требованию', placeholder:'Номер или название: 3001, Technic Brick, gear…',
  loading:'Загрузка индекса…', ready:n=>`${n.toLocaleString('ru-RU')} файлов деталей`, seed:'Популярные детали для быстрого старта. Введи Design ID или название для поиска по библиотеке.',
  codeHint:'Поиск по Design ID работает по полному remote index. Поиск по названию использует LDraw Library и уже загруженные DAT-заголовки.',
  empty:'Ничего не найдено', adding:'Добавляю…', failed:'Не удалось загрузить LDraw. Проверь интернет и попробуй ещё раз.',
  footer:'Геометрия: LDraw Parts Library · источник: pybricks/ldraw mirror',
}:{
  title:'LDraw Library', subtitle:'Official parts · geometry loads on demand', placeholder:'Number or name: 3001, Technic Brick, gear…',
  loading:'Loading index…', ready:n=>`${n.toLocaleString('en-US')} part files`, seed:'Popular parts for a quick start. Enter a Design ID or name to search the library.',
  codeHint:'Design ID search uses the complete remote index. Name search uses LDraw Library plus DAT headers already loaded.',
  empty:'Nothing found', adding:'Adding…', failed:'Could not load LDraw. Check your connection and try again.',
  footer:'Geometry: LDraw Parts Library · source: pybricks/ldraw mirror',
}}

function ensureStyles(){
  if(document.getElementById(STYLE_ID))return
  const link=document.createElement('link');link.id=STYLE_ID;link.rel='stylesheet';link.href=new URL('./catalog-v1.css?v=ldraw-20260910-v3',import.meta.url).href;document.head.append(link)
}
function icons(){window.lucide?.createIcons?.({attrs:{'stroke-width':1.7,'aria-hidden':'true'}})}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function normalizeFile(value){return String(value||'').replace(/^parts\//i,'').trim()}
function codeOf(file){return normalizeFile(file).replace(/\.dat$/i,'')}

async function metadata(file){
  const normalized=normalizeFile(file)
  if(metadataMemo.has(normalized))return metadataMemo.get(normalized)
  const promise=getLDrawMetadata(normalized)
  metadataMemo.set(normalized,promise)
  try{return await promise}catch(error){metadataMemo.delete(normalized);throw error}
}

function shell(){
  const t=copy()
  return `<section class="ldraw-catalog" role="dialog" aria-modal="true" aria-labelledby="ldrawTitle">
    <header class="ldraw-head"><div class="ldraw-logo">LD</div><div class="ldraw-title"><strong id="ldrawTitle">${t.title}</strong><small>${t.subtitle}</small></div><button class="ldraw-close" type="button" data-ldraw-close aria-label="Close"><i data-lucide="x"></i></button></header>
    <div class="ldraw-toolbar"><label class="ldraw-search"><i data-lucide="search"></i><input id="ldrawSearch" autocomplete="off" spellcheck="false" placeholder="${t.placeholder}"></label><div class="ldraw-status" data-ldraw-status>${t.loading}</div></div>
    <div class="ldraw-body"><div class="ldraw-note" data-ldraw-note>${t.seed}<br>${t.codeHint}</div><div class="ldraw-results" data-ldraw-results></div></div>
    <footer class="ldraw-foot"><span>${t.footer}</span><a href="https://library.ldraw.org/" target="_blank" rel="noopener noreferrer">library.ldraw.org ↗</a></footer>
  </section>`
}

function installLayer(){
  if(layer)return layer
  ensureStyles()
  layer=document.createElement('div');layer.id=LAYER_ID;layer.className='ldraw-catalog-layer hidden';layer.innerHTML=shell();document.body.append(layer)
  input=layer.querySelector('#ldrawSearch');results=layer.querySelector('[data-ldraw-results]');status=layer.querySelector('[data-ldraw-status]')
  layer.querySelector('[data-ldraw-close]').onclick=close
  layer.addEventListener('pointerdown',event=>{if(event.target===layer)close()})
  input.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>void runSearch(input.value),180)})
  results.addEventListener('click',event=>{const button=event.target.closest('[data-ldraw-file]');if(button)void addPart(button)})
  icons()
  return layer
}

function updateCopy(){
  if(!layer)return
  const t=copy()
  layer.querySelector('#ldrawTitle').textContent=t.title
  layer.querySelector('.ldraw-title small').textContent=t.subtitle
  input.placeholder=t.placeholder
  layer.querySelector('[data-ldraw-note]').innerHTML=`${t.seed}<br>${t.codeHint}`
  layer.querySelector('.ldraw-foot span').textContent=t.footer
  status.textContent=index.length?t.ready(index.length):t.loading
}

function resultMarkup(item){
  const file=normalizeFile(item.file)
  const code=item.code||codeOf(file)
  const name=item.description||item.name||`LDraw ${code}`
  const meta=[item.category,item.license].filter(Boolean).join(' · ') || file
  return `<button class="ldraw-result" type="button" data-ldraw-file="${escapeHtml(file)}"><span class="ldraw-part-id">${escapeHtml(code)}</span><span class="ldraw-result-copy"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(meta)}</small></span><span class="ldraw-add"><i data-lucide="plus"></i></span></button>`
}
function render(items){
  results.innerHTML=items.length?items.map(resultMarkup).join(''):`<div class="ldraw-empty">${copy().empty}</div>`
  icons()
}

async function enrich(items,generation){
  const output=[]
  const queue=[...items]
  const workers=Array.from({length:Math.min(6,queue.length)},async()=>{
    while(queue.length){
      const item=queue.shift();if(!item)break
      try{output.push(await metadata(item.file||item))}catch{output.push(typeof item==='string'?{file:item,code:codeOf(item)}:item)}
      if(generation!==queryGeneration)return
    }
  })
  await Promise.all(workers)
  return output
}

async function siteNameSearch(query){
  try{
    const response=await fetch(`https://library.ldraw.org/parts/list?tableSearch=${encodeURIComponent(query)}`,{mode:'cors',cache:'no-store'})
    if(!response.ok)return []
    const html=await response.text()
    const doc=new DOMParser().parseFromString(html,'text/html')
    const found=new Map()
    for(const element of doc.querySelectorAll('a,span,div,td')){
      const own=(element.childElementCount===0?element.textContent:'').trim()
      const match=own.match(/^parts\/([^/\s]+\.dat)$/i)
      if(!match)continue
      const file=match[1]
      let container=element.closest('tr,li')||element.parentElement
      let description=''
      for(let depth=0;container&&depth<3;depth++,container=container.parentElement){
        const text=container.textContent.replace(/\s+/g,' ').trim()
        if(text.length>own.length&&text.length<500){description=text.replace(own,'').replace(/\bOfficial\b.*$/i,'').replace(/\bDownload\b/gi,'').trim();if(description)break}
      }
      if(!found.has(file))found.set(file,{file,code:codeOf(file),description:description||`LDraw ${codeOf(file)}`})
      if(found.size>=60)break
    }
    return [...found.values()]
  }catch{return []}
}

async function runSearch(raw){
  const generation=++queryGeneration
  const q=String(raw||'').trim().toLowerCase()
  if(!q){
    status.textContent=index.length?copy().ready(index.length):copy().loading
    const enriched=await enrich(SEED_FILES.map(file=>({file,code:codeOf(file)})),generation)
    if(generation===queryGeneration)render(enriched)
    return
  }

  const compact=q.replace(/\.dat$/,'').replace(/^ldraw-/,'')
  const codeMatches=index.filter(item=>item.code.toLowerCase().includes(compact)||item.file.toLowerCase().includes(q)).slice(0,60)
  let candidates=codeMatches
  if(!/\d/.test(q)||codeMatches.length<8){
    const remote=await siteNameSearch(q)
    const merged=new Map([...codeMatches,...remote].map(item=>[item.file,item]))
    candidates=[...merged.values()].slice(0,60)
  }
  if(generation!==queryGeneration)return
  if(!candidates.length){render([]);return}
  const enriched=await enrich(candidates.slice(0,36),generation)
  if(generation!==queryGeneration)return
  const ordered=new Map(enriched.map(item=>[item.file,item]))
  render(candidates.map(item=>ordered.get(item.file)||item).slice(0,60))
}

function refreshBrickLabCatalog(def){
  const legacy=document.getElementById('partSearch')
  if(legacy){legacy.value='';legacy.dispatchEvent(new Event('input',{bubbles:true}))}
  requestAnimationFrame(()=>{
    const search=document.getElementById('catalogSearchV2')
    if(search){search.value=def.ldraw?.code||def.id;search.dispatchEvent(new Event('input',{bubbles:true}))}
    requestAnimationFrame(()=>document.querySelector(`.part-card[data-part="${CSS.escape(def.id)}"]`)?.click())
  })
}

async function addPart(button){
  const file=button.dataset.ldrawFile
  if(!file)return
  button.classList.add('loading')
  const add=button.querySelector('.ldraw-add')
  const old=add?.innerHTML
  if(add)add.textContent='…'
  try{
    const def=registerLDrawPart(await metadata(file))
    refreshBrickLabCatalog(def)
    close()
  }catch(error){
    console.warn('[BrickLab LDraw] catalog add failed',error)
    status.textContent=copy().failed
    button.classList.remove('loading')
    if(add)add.innerHTML=old||'<i data-lucide="plus"></i>'
    icons()
  }
}

async function ensureIndex(){
  if(index.length)return index
  status.textContent=copy().loading
  try{index=await getLDrawIndex();status.textContent=copy().ready(index.length);return index}
  catch(error){console.warn('[BrickLab LDraw] index failed',error);status.textContent=copy().failed;throw error}
}

async function open(){
  if(opening)return
  opening=true
  installLayer();updateCopy();layer.classList.remove('hidden');input.focus();input.select();icons()
  try{await ensureIndex();await runSearch(input.value)}catch{/* status already shown */}
  finally{opening=false}
}
function close(){if(layer)layer.classList.add('hidden')}

function installButton(){
  const browser=document.getElementById('catalogBrowserV2')
  const meta=browser?.querySelector('.catalog-meta-row')
  if(!browser||!meta)return requestAnimationFrame(installButton)
  if(document.getElementById('ldrawCatalogButton'))return
  const button=document.createElement('button');button.id='ldrawCatalogButton';button.type='button';button.textContent='LDraw';button.title=isRussian()?'Открыть библиотеку LDraw':'Open LDraw Library';button.onclick=()=>void open();meta.append(button)
  window.addEventListener('bricklab:languagechange',()=>{button.title=isRussian()?'Открыть библиотеку LDraw':'Open LDraw Library';updateCopy();if(layer&&!layer.classList.contains('hidden'))void runSearch(input.value)})
}

document.addEventListener('keydown',event=>{
  if(event.code==='Escape'&&layer&&!layer.classList.contains('hidden')){event.preventDefault();event.stopImmediatePropagation();close()}
},true)

installButton()
window.BrickLabLDrawCatalog=Object.freeze({open,close,search:value=>{installLayer();input.value=value;return runSearch(value)}})
