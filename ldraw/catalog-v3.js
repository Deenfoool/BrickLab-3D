import { getLDrawIndex, getLDrawMetadata, registerLDrawPart, preloadLDrawPrototype } from './runtime-v3.js?v=ldraw-catalog-20260910-v3'
import { retryLoad, withLoadDeadline } from './load-recovery-v1.js?v=ldraw-loading-20260912-v1'
import { PARTS, findPart } from '../parts.js'
import { compatibleAssemblyChoices } from '../guidance/assembly-compatibility-v1.js?v=smart-assembly-20260911-v6'
import { libraryItems, readPreference, writePreference } from './library-model-v1.js?v=parts-library-20260912-v5'
import { mountPartsLibrary, LIBRARY_KEYS } from './library-view-v1.js?v=parts-library-20260912-v5'
import { createPartsLibraryPreviewService } from './library-preview-v1.js?v=parts-library-20260912-v5'

const INDEX_URLS=Object.freeze({
  current:'https://raw.githubusercontent.com/partcad/partcad-ldraw/main/parts-index.zip',
  legacy:'https://raw.githubusercontent.com/partcad/partcad-ldraw/b91d69a98f72c9d550a838dcb74534a2991575ea/parts-index.json.gz',
})
const ZIP_LOCAL=0x04034b50,ZIP_CENTRAL=0x02014b50,ZIP_EOCD=0x06054b50
const utf8=new TextDecoder()
let index=[],view=null,root=null,panel=null,pending=null,refreshTimer,indexSource='unloaded'
const t=(en,ru)=>document.documentElement.lang==='ru'?ru:en

async function inflateBytes(bytes,format){
  if(typeof DecompressionStream!=='function')throw Error('DecompressionStream is unavailable')
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
function findZipEocd(view){
  const min=Math.max(0,view.byteLength-0xffff-22)
  for(let offset=view.byteLength-22;offset>=min;offset-=1)if(view.getUint32(offset,true)===ZIP_EOCD)return offset
  throw Error('Invalid ZIP: end-of-central-directory not found')
}
function zipReader(buffer){
  const data=new DataView(buffer),eocd=findZipEocd(data),count=data.getUint16(eocd+10,true),files=new Map()
  let offset=data.getUint32(eocd+16,true)
  for(let i=0;i<count;i+=1){
    if(data.getUint32(offset,true)!==ZIP_CENTRAL)throw Error('Invalid ZIP central directory')
    const method=data.getUint16(offset+10,true),compressedSize=data.getUint32(offset+20,true)
    const fileNameLength=data.getUint16(offset+28,true),extraLength=data.getUint16(offset+30,true),commentLength=data.getUint16(offset+32,true)
    const localOffset=data.getUint32(offset+42,true),name=utf8.decode(new Uint8Array(buffer,offset+46,fileNameLength))
    if(data.getUint32(localOffset,true)!==ZIP_LOCAL)throw Error(`Invalid ZIP local header: ${name}`)
    const localNameLength=data.getUint16(localOffset+26,true),localExtraLength=data.getUint16(localOffset+28,true)
    const start=localOffset+30+localNameLength+localExtraLength,compressed=new Uint8Array(buffer,start,compressedSize)
    files.set(name,{async text(){
      if(method===0)return utf8.decode(compressed)
      if(method!==8)throw Error(`Unsupported ZIP compression method ${method}: ${name}`)
      return utf8.decode(await inflateBytes(compressed,'deflate-raw'))
    }})
    offset+=46+fileNameLength+extraLength+commentLength
  }
  return files
}
const categoryMember=category=>`c/${String(category).trim().replace(/\s+/g,'-')}.json`
const catalogItem=(code,description,category)=>({file:`${code}.dat`,code,description:String(description||'').trim()||`LDraw ${code}`,category})
async function decodeCurrentIndex(buffer){
  const files=zipReader(buffer),metaFile=files.get('index.json')
  if(!metaFile)throw Error('LDraw ZIP index is missing index.json')
  const meta=JSON.parse(await metaFile.text())
  if(meta.format!==3||!meta.categories)throw Error(`Unsupported LDraw ZIP index format: ${meta.format}`)
  const items=[]
  for(const [category,ids] of Object.entries(meta.categories)){
    const member=files.get(categoryMember(category))
    if(!member)throw Error(`LDraw ZIP index is missing category: ${category}`)
    const parts=JSON.parse(await member.text())
    for(const code of ids){const entry=parts[code];items.push(catalogItem(code,Array.isArray(entry)?entry[0]:'',category))}
  }
  if(!items.length)throw Error('LDraw ZIP index is empty')
  return items
}
async function decodeLegacyIndex(buffer){
  const data=JSON.parse(utf8.decode(await inflateBytes(new Uint8Array(buffer),'gzip')))
  if(data.format!==2||!data.categories)throw Error(`Unsupported legacy LDraw index format: ${data.format}`)
  const items=[]
  for(const [category,parts] of Object.entries(data.categories))for(const [code,entry] of Object.entries(parts))if(Array.isArray(entry))items.push(catalogItem(code,entry[0],category))
  if(!items.length)throw Error('Legacy LDraw index is empty')
  return items
}
async function fetchIndexBuffer(url){
  const response=await fetch(url,{mode:'cors',cache:'force-cache'})
  if(!response.ok)throw Error(`Index HTTP ${response.status}: ${url}`)
  return response.arrayBuffer()
}
async function loadCatalogIndex(){
  let currentError
  try{return{items:await decodeCurrentIndex(await fetchIndexBuffer(INDEX_URLS.current)),source:'current-zip'}}
  catch(error){currentError=error;console.warn('[BrickLab Library] Current ZIP index unavailable; trying pinned legacy index.',error)}
  try{return{items:await decodeLegacyIndex(await fetchIndexBuffer(INDEX_URLS.legacy)),source:'pinned-legacy-gzip'}}
  catch(error){throw Error(`LDraw catalog indexes unavailable: ${currentError?.message||currentError}; ${error?.message||error}`)}
}

// Exact geometry previews share one bounded offscreen renderer. LDraw catalog records
// are previewed directly from preloadLDrawPrototype(), so browsing never registers
// thousands of definitions or mutates the project/Connector graph.
const previewService=createPartsLibraryPreviewService()
const preview=item=>previewService.peek(item)
preview.request=(item,options)=>previewService.request(item,options)

function migratePreferences() {
  for(const [oldKey,newKey] of [['bricklab.ldraw.favorites.v3',LIBRARY_KEYS.favorites],['bricklab.ldraw.recents.v3',LIBRARY_KEYS.recents]]) {
    if(readPreference(localStorage,newKey,null)!==null)continue
    const old=readPreference(localStorage,oldKey,[])
    if(Array.isArray(old))writePreference(localStorage,newKey,old.filter(x=>x?.file).map(x=>`ldraw-${x.file.replace(/^parts\//i,'').replace(/\.dat$/i,'').toLowerCase()}`))
  }
}
function context() {
  const editor=globalThis.BrickLabSubsystems?.editor
  const selected=editor?.primarySelection?.()
  const def=findPart(selected?.userData?.partId)
  return {
    project:(editor?.objects?.()||[]).map(object=>object.userData?.partId),
    compatible:def?compatibleAssemblyChoices(def,PARTS).map(choice=>choice.targetPartId):[],
    failedCount:(editor?.objects?.()||[]).filter(object=>object.userData.ldraw?.status==='error').length,
  }
}
function info(item) {
  const def=findPart(item.key),size=def?.ldraw?.size || def?.size
  return {
    size:Array.isArray(size)?`${size.map(n=>Number(n).toFixed(2)).join(' × ')} stud`:null,
    mechanical:def?.mechanicalIntelligence?.class || def?.mechanics?.type || def?.mechanics?.kind,
    connectors:def?.connectors?.length?[...new Set(def.connectors.map(c=>c.type||c.family).filter(Boolean))].join(', '):null,
  }
}
function canInsert() {
  if(globalThis.BrickLabKinematics?.active?.())return false
  return globalThis.BrickLabSubsystems?.editor?.mode?.()==='build'
}
async function repair() {
  if(!canInsert())throw Error(t('Return to BUILD first','Сначала вернитесь в СБОРКУ'))
  const editor=globalThis.BrickLabSubsystems.editor
  const failed=editor.objects().filter(object=>object.userData.ldraw?.status==='error')
  const outcomes=await Promise.allSettled(failed.map(root=>withLoadDeadline(globalThis.BrickLabLDraw.retry(root,{canAttach:()=>canInsert()&&editor.objects().includes(root)}))))
  const remaining=outcomes.filter(result=>result.status==='rejected').length
  if(remaining)throw Error(t(`Still unavailable: ${remaining}. Check network and retry.`,`Ещё недоступно: ${remaining}. Проверьте сеть и повторите.`))
}
// Native card click retains app.js addPart, history, selection, sound and guidance.
// No editor objects, connector semantics or project data are written by this UI.
async function insert(item) {
  if(!canInsert())throw Error(t('Return to BUILD first','Сначала вернитесь в СБОРКУ'))
  if(item.file)await withLoadDeadline(retryLoad(()=>globalThis.BrickLabLDrawFastLoader?.preload
    ?globalThis.BrickLabLDrawFastLoader.preload(item.file,{priority:'critical'})
    :preloadLDrawPrototype(item.file)))
  if(!canInsert())throw Error(t('Return to BUILD first','Сначала вернитесь в СБОРКУ'))
  const def=item.file?registerLDrawPart({...item,category:item.sourceCategory}):findPart(item.key)
  if(!def)throw Error(t('Part unavailable','Деталь недоступна'))
  const search=document.getElementById('partSearch')
  if(!search)throw Error('Native catalog unavailable')
  document.querySelector('#categoryTabs [data-cat="All"]')?.click()
  search.value='';search.dispatchEvent(new Event('input',{bubbles:true}))
  let card=document.querySelector(`#partsList .part-card[data-part="${CSS.escape(def.id)}"]`)
  if(!card){await new Promise(resolve=>requestAnimationFrame(resolve));card=document.querySelector(`#partsList .part-card[data-part="${CSS.escape(def.id)}"]`)}
  if(!card||!canInsert())throw Error(t('Editor insertion unavailable','Вставка в редактор недоступна'))
  const before=new Set((globalThis.BrickLabSubsystems?.editor?.objects?.()||[]).map(o=>o.userData.instanceId))
  card.click()
  const added=(globalThis.BrickLabSubsystems?.editor?.objects?.()||[]).some(o=>o.userData.partId===def.id&&!before.has(o.userData.instanceId))
  if(!added)throw Error(t('Editor did not place the part','Редактор не разместил деталь'))
  return true
}
function refresh({pending=false,message=''}={}) { view?.setItems(libraryItems(index,PARTS),{pending,message}) }

async function loadIndex() {
  if(pending)return pending
  pending=(async()=>{
    try {
      const loaded=await loadCatalogIndex()
      index=loaded.items
      indexSource=loaded.source
      refresh()
    } catch(error) {
      indexSource='unavailable'
      console.warn('[BrickLab Library] Metadata indexes unavailable; registered parts remain usable.',error)
      refresh({message:t('Index unavailable · registered parts available','Индекс недоступен · доступны зарегистрированные детали')})
    }
  })()
  return pending
}

// Retain explicit Design-ID recovery without issuing thousands of metadata requests.
async function lookupCode(query) {
  const code=String(query).trim().replace(/^ldraw-/i,'').replace(/\.dat$/i,'')
  if(!/^[0-9][a-z0-9_-]*$/i.test(code)||index.some(x=>x.code===code))return
  try {
    const known=await getLDrawIndex();const item=known.find(x=>x.code.toLowerCase()===code.toLowerCase())
    if(!item)return
    const meta=await getLDrawMetadata(item.file)
    index.push({...item,...meta,code,description:meta.description||`LDraw ${code}`})
    refresh()
  } catch(error){console.warn('[BrickLab Library] Design ID lookup unavailable.',error)}
}

function install() {
  panel=document.querySelector('.parts-panel')
  if(!panel||!document.getElementById('partsList'))return
  if(document.getElementById('ldrawCatalogV3'))return
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./library-v1.css?v=parts-library-20260912-v5',import.meta.url).href;document.head.append(css)
  migratePreferences()
  panel.classList.add('parts-library-v1')
  root=document.createElement('div');root.id='ldrawCatalogV3';panel.append(root)
  const title=panel.querySelector('.panel-title>span:first-child');if(title)title.textContent=t('PARTS LIBRARY','БИБЛИОТЕКА ДЕТАЛЕЙ')
  view=mountPartsLibrary(root,{language:()=>document.documentElement.lang,insert,repair,preview,info,context,onClose:()=>panel.querySelector('.panel-float-close')?.click()})
  refresh({pending:true})
  // Compact metadata only; geometry is requested lazily by the preview service for
  // the rendered page and by insertion at critical priority.
  void loadIndex()
  root.addEventListener('change',event=>{if(event.target.id==='plSearch')void lookupCode(event.target.value)})
  const schedule=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>view?.refresh(),120)}
  globalThis.addEventListener('bricklab:partcatalogchange',()=>refresh())
  globalThis.addEventListener('bricklab:languagechange',()=>{view.languageChanged();if(title)title.textContent=t('PARTS LIBRARY','БИБЛИОТЕКА ДЕТАЛЕЙ')})
  for(const name of ['bricklab:editorexternalmutation','bricklab:selectionchange','bricklab:editorselectionchange','bricklab:smartassemblyinstalled','bricklab:ldrawloaded'])globalThis.addEventListener(name,schedule)
  new MutationObserver(()=>{if(!panel.classList.contains('panel-hidden'))schedule()}).observe(panel,{attributes:true,attributeFilter:['class']})
  document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.code!=='KeyK'||panel.classList.contains('panel-hidden'))return
    event.preventDefault();event.stopImmediatePropagation();view.focus()
  },true)
}
install()
globalThis.BrickLabLDrawCatalog=Object.freeze({
  focus:()=>view?.focus(),showCategory:name=>view?.showFamily(/technic|wheel|tyre/i.test(name)?'technic':'system'),
  showAll:()=>view?.showSection('all'),showFavorites:()=>view?.showSection('favorites'),
  state:()=>view?.state(),previewStatus:()=>previewService.status(),
  indexStatus:()=>({source:indexSource,items:index.length}),
})
