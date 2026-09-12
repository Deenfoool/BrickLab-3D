import { getLDrawIndex, getLDrawMetadata, registerLDrawPart, preloadLDrawPrototype } from './runtime-v3.js?v=ldraw-catalog-20260910-v3'
import { retryLoad, withLoadDeadline } from './load-recovery-v1.js?v=ldraw-loading-20260912-v1'
import { loadLDrawCatalogIndex } from './index-loader-v1.js?v=ldraw-index-20260912-v1'
import { PARTS, findPart } from '../parts.js'
import { compatibleAssemblyChoices } from '../guidance/assembly-compatibility-v1.js?v=smart-assembly-20260911-v6'
import { libraryItems, readPreference, writePreference } from './library-model-v1.js?v=parts-library-20260912-v5'
import { mountPartsLibrary, LIBRARY_KEYS } from './library-view-v1.js?v=parts-library-20260912-v5'
import { createPartsLibraryPreviewService } from './library-preview-v1.js?v=parts-library-20260912-v5'

let index=[],view=null,root=null,panel=null,pending=null,refreshTimer,indexSource='unloaded'
const t=(en,ru)=>document.documentElement.lang==='ru'?ru:en

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
      const loaded=await loadLDrawCatalogIndex()
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
