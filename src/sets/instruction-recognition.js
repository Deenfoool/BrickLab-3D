import {boundedTask} from './instruction-task.js?v=recognition-v9-polish'
import {pageCallouts,visualKeyForSample} from './instruction-study.js?v=recognition-v9'
import {lookupElement} from '../editor/element-index.js?v=catalog-engine-1'
import {createElementRecovery} from './instruction-element-recovery.js?v=recognition-v8'
import { createOcrWorker } from './ocr.js?v=recognition-v9-polish'
import {createInstructionPdfReader} from './instruction-pdf.js?v=recognition-v9'
import {canonicalInstructionUrl} from './instruction-url.js'
import {normalizeCaption,isQuantity,isElement,normalizedCaptions,mergeCaptions} from './instruction-text.js?v=smart-highlight-1'
let database

function openCache() {
  if (!globalThis.indexedDB) return Promise.resolve(null)
  database ??= new Promise(resolve => {
    const open = indexedDB.open('bricklab.instruction-regions', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('pages')
    open.onblocked = open.onerror = () => resolve(null)
    open.onsuccess = () => resolve(open.result)
  })
  return database
}

async function cache(key, value) {
  if (!key) return
  try {
    const db = await openCache()
    if (!db) return
    return await new Promise(resolve => {
      const store = db.transaction('pages', value ? 'readwrite' : 'readonly').objectStore('pages')
      const request = value ? store.put(value, key) : store.get(key)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve()
      store.transaction.onabort = () => resolve()
    })
  } catch {
    // Recognition still works with storage disabled or full.
  }
}

function inventoryLabels(inventory) {
  const labels = Object.create(null)
  const ambiguous = new Set()
  for (const item of inventory) {
    const imageId = /^https:\/\/cdn\.rebrickable\.com\/media\/parts\/elements\/(\d{6,8})\.(?:jpg|png)$/i.exec(item.image)?.[1]
    for (const id of [item.elementId, imageId]) {
      if (!id || ambiguous.has(id)) continue
      if (labels[id] && (labels[id][0] !== item.partNum || labels[id][1] !== item.colorId)) {
        delete labels[id]
        ambiguous.add(id)
      } else {
        labels[id] = [item.partNum, item.colorId]
      }
    }
  }
  return {labels,ambiguous}
}

async function inventoryVersion(labels,inventory) {
  if (!globalThis.crypto?.subtle) return
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))
  const items=inventory.map(i=>[i.partNum,String(i.colorId),i.color,i.quantity,Boolean(i.spare),i.ldraw??[]]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const bytes = new TextEncoder().encode(JSON.stringify([entries,items]))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function createInstructionRecognition(reader, set, signal) {
  const {labels,ambiguous}=inventoryLabels(set.inventory)
  const version = inventoryVersion(labels,set.inventory)
  const recoverElements=createElementRecovery(set.inventory,lookupElement)
  let modelReferences,modelWorker
  const jobs = new Map()
  const books = new Map()
  let active, worker, ocr, ocrController, ocrQueue = Promise.resolve(), jobId = 0

  function cancelJobs(error) {
    worker?.terminate()
    worker = undefined
    modelWorker=undefined
    for (const job of jobs.values()) {clearTimeout(job.timer);job.reject(error)}
    jobs.clear()
  }
  signal.addEventListener('abort', () => {
    active?.controller.abort()
    cancelJobs(signal.reason)
    resetOcr()
  }, { once: true })

  function resetOcr(){
    const previous=ocr;ocr=undefined;ocrController?.abort();ocrController=undefined
    previous?.then(engine=>engine.terminate(),()=>{}).catch(()=>{})
  }
  function analyze(action, input, transfer = [], request=signal) {
    try{signal.throwIfAborted();request.throwIfAborted()}catch(error){for(const item of transfer)item.close?.();throw error}
    if (!worker) {
      worker = new Worker(new URL('./instruction-recognition-worker.js?v=recognition-v9-polish', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }) => {
        const job = jobs.get(data.id)
        jobs.delete(data.id)
        clearTimeout(job?.timer)
        if (data.error) job?.reject(Error(data.error))
        else job?.resolve(data.value)
      }
      worker.onerror = () => cancelJobs(Error('Instruction analysis worker unavailable'))
      worker.onmessageerror=()=>cancelJobs(Error('Instruction analysis worker message unavailable'))
    }
    const id = ++jobId
    const task=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>cancelJobs(Error('Instruction analysis worker timed out')),20000)
      jobs.set(id,{resolve,reject,timer})
      try{worker.postMessage({id,action,input},transfer)}catch(error){clearTimeout(timer);jobs.delete(id);for(const item of transfer)item.close?.();reject(error)}
    })
    return boundedTask(task,request,21000)
  }

  function currentBook(source, pages) {
    if (active?.source === source) {if(Number.isInteger(pages)&&pages>0)active.pages=pages;return active}
    active?.controller.abort()
    const controller = new AbortController()
    const bookSignal = AbortSignal.any([controller.signal, signal])
    const key = Promise.all([reader.fingerprint(source), version]).then(([fingerprint, hash]) => {
      if (!fingerprint || !hash) return
      return JSON.stringify(['regions-v9.1', set.number, hash, fingerprint])
    }).catch(()=>undefined)
    active = { source, controller, signal: bookSignal, key, pages }
    return active
  }

  function readText(canvas, geometry, request) {
    const run = ocrQueue.then(async () => {
      request.throwIfAborted()
      if(!ocr){ocrController=new AbortController();ocr=createOcrWorker(AbortSignal.any([signal,ocrController.signal]))}
      let data
      try{
        const engine=await boundedTask(ocr,request,12000)
        request.throwIfAborted()
        ;({data}=await boundedTask(engine.recognize(canvas,{}, {text:false,blocks:true}),request,15000))
      }catch(error){resetOcr();throw error}
      request.throwIfAborted()
      const x = geometry.width / canvas.width, y = geometry.height / canvas.height
      return (data.blocks ?? []).flatMap(block =>
        (block.paragraphs??[]).flatMap(paragraph => (paragraph.lines??[]).flatMap(line => line.words??[])))
        .flatMap(({ text, bbox, confidence }) => {
          if(!bbox||!Number.isFinite(confidence))return []
          const word = normalizeCaption(text)
          if (isElement(word) ? confidence < 75 : !/^(?:[1-9]\d{0,2}x?|x)$/.test(word) || confidence < 55) return []
          return [{ text: word, box: [bbox.x0 * x, bbox.y0 * y, bbox.x1 * x, bbox.y1 * y] }]
        })
    })
    ocrQueue = run.catch(() => {})
    return run
  }

  async function extract(source, page, canvas, mode, request, pdfReader=reader) {
    const geometry = await pdfReader.inspect(source, page, request,{study:!mode})
    let surface = canvas
    const raw=geometry.words
    geometry.words=normalizedCaptions(raw)
    await recoverElements(geometry.words,labels,ambiguous,request)
    const hasWords=()=>geometry.words.some(({text})=>mode?isElement(text)&&Object.hasOwn(labels,text):isQuantity(text)||isElement(text)&&Object.hasOwn(labels,text))
    if(!surface){surface=document.createElement('canvas');await pdfReader.render(source,page,surface,request)}
    async function recognize(){
      try{const words=await readText(surface,geometry,request);geometry.words=mergeCaptions(raw,words);await recoverElements(geometry.words,labels,ambiguous,request)}
      catch(error){request.throwIfAborted()} // A failed OCR pass must not discard vector evidence.
    }
    const knownElements=()=>geometry.words.filter(({text})=>isElement(text)&&Object.hasOwn(labels,text)).length
    let usedOcr=false
    if(!hasWords()||(mode&&knownElements()<2)){usedOcr=true;await recognize()}
    async function extractSamples(){
      if(!hasWords())return []
      request.throwIfAborted()
      const bitmap=await createImageBitmap(surface)
      if(request.aborted){bitmap.close();request.throwIfAborted()}
      return analyze('extract',{bitmap,geometry,inventory:mode,labels},[bitmap],request)
    }
    let samples=await extractSamples()
    // Partial text layers: rerun on raster evidence if the first pass missed captions.
    const expected=geometry.words.filter(({text})=>mode?isElement(text)&&Object.hasOwn(labels,text):isQuantity(text)||isElement(text)&&Object.hasOwn(labels,text)).length
    if(!usedOcr&&samples.length<expected&&samples.length<Math.max(2,expected*.8)){
      await recognize()
      const recovered=await extractSamples()
      if(recovered.length>=samples.length)samples=recovered
    }
    return samples
  }

  async function scanInventory(source,request,pdfReader,bookSignal){
    const [fingerprint,hash]=await boundedTask(Promise.all([pdfReader.fingerprint(source),version]),request,12000)
    request.throwIfAborted()
    const key=fingerprint&&hash&&JSON.stringify(['regions-v9.1',set.number,hash,fingerprint])+'/inventory'
    const stored=await cache(key)
    request.throwIfAborted()
    if(Array.isArray(stored)&&stored.length){books.set(source,stored);return stored}
    const templates=[]
    let emptyAfterInventory=0,complete=true
    const total=await boundedTask(pdfReader.pageCount(source,request),request,10000)
    async function visit(page){
      if(request.aborted){complete=false;return false}
      let items=[]
      const pageSignal=AbortSignal.any([request,AbortSignal.timeout(21000)])
      try{items=await boundedTask(extract(source,page,null,true,pageSignal,pdfReader),pageSignal,22000)}
      catch{if(request.aborted){complete=false;return false}complete=false}
      templates.push(...items)
      emptyAfterInventory=items.length?0:emptyAfterInventory+Number(templates.length>0)
      return emptyAfterInventory<3
    }
    for(let page=total;page>Math.max(0,total-36);page--)if(!await visit(page))break
    if(!templates.length&&!request.aborted){
      for(let page=1;page<=Math.min(12,Math.max(0,total-36));page++)if(!await visit(page))break
    }
    bookSignal.throwIfAborted()
    if(request.aborted)complete=false
    books.set(source,templates)
    if(templates.length&&complete)void cache(key,templates)
    return templates
  }
  async function illustratedInventory(book){
    const budget=AbortSignal.any([book.signal,AbortSignal.timeout(40000)])
    const identity=typeof book.source==='string'&&canonicalInstructionUrl(book.source)
    const ordered=identity?[...(set.books??[])].reverse().filter(v=>canonicalInstructionUrl(v.url)).slice(0,3).concat([{url:book.source}]):[{url:book.source}]
    const visited=new Set(),combined=[]
    const expected=new Set(set.inventory.filter(i=>!i.spare).map(i=>JSON.stringify([i.partNum,String(i.colorId)]))).size
    for(const volume of ordered){
      if(budget.aborted)break
      const url=identity?canonicalInstructionUrl(volume.url):volume.url
      if(!url||visited.has(url))continue
      visited.add(url);book.signal.throwIfAborted()
      let templates=books.get(volume.url)
      if(!templates?.length){
        const extra=createInstructionPdfReader()
        try{templates=await scanInventory(url,budget,extra,book.signal)}
        catch{book.signal.throwIfAborted();templates=[]}finally{extra.close()}
      }
      combined.push(...templates)
      const coverage=new Set(combined.filter(t=>t.item?.[0]).map(t=>JSON.stringify(t.item.slice(0,2)))).size
      if(expected&&coverage>=expected*.95)break
    }
    book.signal.throwIfAborted()
    return combined
  }

  async function pageRegions(source, page, pages, canvas, request, onProgress=()=>{}) {
    request.throwIfAborted()
    const book = currentBook(source, pages)
    const key = await book.key
    const pageKey = key && `${key}/${page}`
    const stored = await cache(pageKey)
    request.throwIfAborted()
    if(stored&&Array.isArray(stored.regions)&&Array.isArray(stored.callouts)){onProgress({stage:'cached',regions:stored.regions,total:stored.callouts.length,callouts:stored.callouts,scope:pageKey});return stored.regions}
    const samples = await extract(source, page, canvas, false, request)
    request.throwIfAborted()
    if(!samples.length)return []
    // Exact normalized artwork hashes support local corrections without storing the image itself.
    await Promise.all(samples.slice(0,300).map(async sample=>{try{sample.visualKey=await visualKeyForSample(sample)}catch{}}))
    request.throwIfAborted()
    const callouts=pageCallouts(samples)
    const notify=(stage,regions)=>onProgress({stage,regions,total:samples.length,callouts,scope:pageKey})
    const direct=samples.filter(s=>s.item?.[0]).map(s=>[...s.region,...s.item])
    notify('inventory',direct)
    if (samples.every(sample => sample.item?.[0])) {
      const regions = samples.map(({ region, item }) => [...region, ...item])
      void cache(pageKey,{regions,callouts})
      return regions
    }
    book.inventoryPromise ??= illustratedInventory(book).catch(error => {
      book.inventoryPromise = undefined
      throw error
    })
    let inventoryTemplates=[],inventoryComplete=true
    try{inventoryTemplates=await boundedTask(book.inventoryPromise,request,45000)}catch{request.throwIfAborted();inventoryComplete=false}
    request.throwIfAborted()
    // A personal PDF can belong to a different edition or set.
    const templates=inventoryTemplates??[]
    const regions=templates.length?await analyze('rank',{samples,templates},[],request):direct
    request.throwIfAborted()
    if(regions.length===samples.length){
      const available=new Set(templates.filter(t=>t.item?.[0]).map(t=>JSON.stringify(t.item.slice(0,2))))
      const expected=set.inventory.filter(i=>!i.spare).every(i=>available.has(JSON.stringify([i.partNum,String(i.colorId)])))
      if(regions.length&&inventoryComplete&&expected)void cache(pageKey,{regions,callouts})
      return regions
    }
    // Only canonical books may use the selected set as a complete candidate universe.
    // A user-supplied PDF may describe a different model.
    if(typeof source!=='string'||!canonicalInstructionUrl(source))return regions
    const identified=new Set(regions.map(r=>r.slice(0,4).join('/')))
    const unresolved=samples.filter(s=>!identified.has(s.region.join('/'))&&!s.item?.[0])
    if(!unresolved.length)return regions
    notify('models',regions)
    modelReferences??=import('./instruction-model-references.js?v=recognition-v8').then(module=>
      module.buildModelReferences(set.inventory,AbortSignal.any([signal,AbortSignal.timeout(35000)]))
    ).catch(()=>[])
    let references=[]
    try{references=await boundedTask(modelReferences,request,36000)}catch{request.throwIfAborted()}
    request.throwIfAborted()
    if(!references.length)return regions
    if(modelWorker!==worker||!worker){await analyze('model-references',{references},[],request);modelWorker=worker}
    request.throwIfAborted()
    const recovered=await analyze('rank-models',{samples:unresolved},[],request)
    request.throwIfAborted()
    // Synthetic views are supplementary and are never persisted as reviewed PDF matches.
    return [...regions,...recovered]
  }

  function closeBook(source) {
    if (active && active.source !== source) {
      active.controller.abort()
      active = undefined
    }
  }

  return { pageRegions, closeBook }
}
