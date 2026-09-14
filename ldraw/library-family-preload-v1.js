import { FAMILIES } from './library-model-v1.js?v=parts-library-20260912-v5'

export const PARTS_LIBRARY_FAMILY_PRELOAD_VERSION = 'parts-library-family-preload-v1.0.1'

const keyFor=item=>item?.key||item?.id||(item?.file?`ldraw-${item.file}`:'')

function signature(family,items){
  if(!family)return ''
  const list=items.filter(item=>item?.family===family)
  return `${family}:${list.length}:${keyFor(list[0])}:${keyFor(list[list.length-1])}`
}

export function createPartsLibraryFamilyPreloader(root,{previewService,getItems=()=>[],getFamily=()=>null,language=()=>document.documentElement.lang}={}){
  if(!root||typeof previewService?.preloadFamily!=='function')return Object.freeze({sync(){},destroy(){},state:()=>null})
  let activeFamily=null,activeSignature='',controller=null,state=null,destroyed=false,paintPending=false
  const t=(en,ru)=>language()==='ru'?ru:en

  function familyName(id){return FAMILIES.find(item=>item.id===id)?.name||id||''}

  function ensureUi(){
    if(!activeFamily)return null
    let node=root.querySelector('[data-family-preload]')
    if(node)return node
    node=root.ownerDocument.createElement('section')
    node.className='pl-family-preload'
    node.dataset.familyPreload='true'
    node.innerHTML='<div class="pl-family-preload-head"><span data-family-preload-label></span><strong data-family-preload-count></strong></div><div class="pl-family-preload-track" data-family-preload-track role="progressbar" aria-valuemin="0" aria-valuemax="100"><span data-family-preload-bar></span></div><small data-family-preload-note></small>'
    const tabs=root.querySelector('.pl-tabs')
    if(tabs)tabs.after(node);else root.querySelector('.pl-heading')?.after(node)
    return node
  }

  function paint(){
    paintPending=false
    if(destroyed||!activeFamily||!state)return
    const node=ensureUi();if(!node)return
    const percent=Math.max(0,Math.min(100,Number(state.percent)||0))
    const label=node.querySelector('[data-family-preload-label]')
    const count=node.querySelector('[data-family-preload-count]')
    const track=node.querySelector('[data-family-preload-track]')
    const bar=node.querySelector('[data-family-preload-bar]')
    const note=node.querySelector('[data-family-preload-note]')
    node.dataset.phase=state.phase
    if(track){track.setAttribute('aria-valuenow',String(percent));track.setAttribute('aria-valuetext',`${state.done||0} / ${state.total||0}`)}
    if(bar)bar.style.width=`${percent}%`
    if(count)count.textContent=`${Number(state.done||0).toLocaleString()} / ${Number(state.total||0).toLocaleString()} · ${percent}%`
    if(state.phase==='complete'){
      if(label)label.textContent=t(`All ${familyName(activeFamily)} previews are ready`,`Все превью ${familyName(activeFamily)} готовы`)
      if(note)note.textContent=t('Saved in this browser for instant reuse.','Сохранено локально в браузере для быстрого повторного открытия.')
    }else if(state.phase==='unavailable'){
      if(label)label.textContent=t('Persistent preview cache is unavailable','Локальный кэш превью недоступен')
      if(note)note.textContent=t('Visible cards will continue to render on demand.','Видимые карточки продолжат создавать превью по мере просмотра.')
    }else if(state.phase==='partial'){
      if(label)label.textContent=t(`Preview preload finished with ${state.failed||0} unavailable`,`Предзагрузка завершена · не удалось: ${state.failed||0}`)
      if(note)note.textContent=t('Available previews were cached; missing ones can retry later.','Доступные превью сохранены; недостающие можно будет повторить позже.')
    }else{
      if(label)label.textContent=t(`Loading all ${familyName(activeFamily)} previews…`,`Загружаем все превью ${familyName(activeFamily)}…`)
      if(note)note.textContent=t('You can keep browsing — visible cards have priority.','Можно продолжать работать — видимые карточки загружаются в первую очередь.')
    }
  }

  function schedulePaint(){
    if(paintPending)return
    paintPending=true
    const run=()=>paint()
    if(typeof globalThis.requestAnimationFrame==='function')globalThis.requestAnimationFrame(run);else setTimeout(run,0)
  }

  function abort(){
    controller?.abort?.();controller=null
  }

  function sync(){
    if(destroyed)return
    const family=getFamily?.()||null
    if(!family){
      abort();activeFamily=null;activeSignature='';state=null
      root.querySelector('[data-family-preload]')?.remove();return
    }
    const supplied=getItems?.()
    const all=Array.isArray(supplied)?supplied:[]
    const familyItems=all.filter(item=>item?.family===family)
    const nextSignature=signature(family,all)
    if(family===activeFamily&&nextSignature===activeSignature){ensureUi();schedulePaint();return}
    abort();activeFamily=family;activeSignature=nextSignature
    controller=typeof AbortController==='function'?new AbortController():{signal:{aborted:false},abort(){this.signal.aborted=true}}
    const own=controller
    state={phase:'loading',familyId:family,total:familyItems.length,done:0,failed:0,cached:0,percent:familyItems.length?0:100,cancelled:false}
    ensureUi();schedulePaint()
    Promise.resolve(previewService.preloadFamily(family,familyItems,{signal:own.signal,onProgress:next=>{
      if(destroyed||own!==controller||next?.familyId!==activeFamily)return
      state=next;schedulePaint()
    }})).then(result=>{
      if(destroyed||own!==controller||own.signal.aborted)return
      state=result;schedulePaint()
    }).catch(error=>{
      if(destroyed||own!==controller||own.signal.aborted)return
      state={phase:'partial',familyId:family,total:familyItems.length,done:0,failed:familyItems.length,cached:0,percent:0,cancelled:false,error:String(error?.message||error)};schedulePaint()
    })
  }

  function click(event){
    const button=event.target?.closest?.('button')
    if(!button||!root.contains(button))return
    if(button.hasAttribute('data-family')||button.hasAttribute('data-change'))queueMicrotask(sync)
  }
  root.addEventListener('click',click)

  return Object.freeze({
    version:PARTS_LIBRARY_FAMILY_PRELOAD_VERSION,
    sync,
    state:()=>state?Object.freeze({...state,familyId:activeFamily,signature:activeSignature}):null,
    destroy(){destroyed=true;abort();root.removeEventListener('click',click);root.querySelector('[data-family-preload]')?.remove()},
  })
}
