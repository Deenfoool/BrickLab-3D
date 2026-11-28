import { createOcrWorker } from './ocr.js'
import {createInstructionPdfReader} from './instruction-pdf.js?v=smart-highlight-1'
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
  return labels
}

async function inventoryVersion(labels) {
  if (!globalThis.crypto?.subtle) return
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))
  const bytes = new TextEncoder().encode(JSON.stringify(entries))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function createInstructionRecognition(reader, set, signal) {
  const labels = inventoryLabels(set.inventory)
  const version = inventoryVersion(labels)
  const jobs = new Map()
  const books = new Map()
  let active, worker, ocr, ocrQueue = Promise.resolve(), jobId = 0

  function cancelJobs(error) {
    worker?.terminate()
    worker = undefined
    for (const job of jobs.values()) job.reject(error)
    jobs.clear()
  }
  signal.addEventListener('abort', () => {
    active?.controller.abort()
    cancelJobs(signal.reason)
    ocr?.then(engine => engine.terminate(), () => {})
  }, { once: true })

  function analyze(action, input, transfer = []) {
    signal.throwIfAborted()
    if (!worker) {
      worker = new Worker(new URL('./instruction-recognition-worker.js?v=smart-highlight-1', import.meta.url), { type: 'module' })
      worker.onmessage = ({ data }) => {
        const job = jobs.get(data.id)
        jobs.delete(data.id)
        if (data.error) job?.reject(Error(data.error))
        else job?.resolve(data.value)
      }
      worker.onerror = () => cancelJobs(Error('Instruction analysis worker unavailable'))
    }
    const id = ++jobId
    return new Promise((resolve, reject) => {
      worker.postMessage({ id, action, input }, transfer)
      jobs.set(id, { resolve, reject })
    })
  }

  function currentBook(source, pages) {
    if (active?.source === source) {if(Number.isInteger(pages)&&pages>0)active.pages=pages;return active}
    active?.controller.abort()
    const controller = new AbortController()
    const bookSignal = AbortSignal.any([controller.signal, signal])
    const key = Promise.all([reader.fingerprint(source), version]).then(([fingerprint, hash]) => {
      if (!fingerprint || !hash) return
      return JSON.stringify(['regions-v7', set.number, hash, fingerprint])
    })
    active = { source, controller, signal: bookSignal, key, pages }
    return active
  }

  function readText(canvas, geometry, request) {
    const run = ocrQueue.then(async () => {
      request.throwIfAborted()
      ocr ??= createOcrWorker(signal).catch(error => {
        ocr = undefined
        throw error
      })
      const engine = await ocr
      request.throwIfAborted()
      const { data } = await engine.recognize(canvas, {}, { text: false, blocks: true })
      request.throwIfAborted()
      const x = geometry.width / canvas.width, y = geometry.height / canvas.height
      return (data.blocks ?? []).flatMap(block =>
        (block.paragraphs??[]).flatMap(paragraph => (paragraph.lines??[]).flatMap(line => line.words??[])))
        .flatMap(({ text, bbox, confidence }) => {
          const word = normalizeCaption(text)
          if (isElement(word) ? confidence < 75 : !/^(?:[1-9]\d{0,2}x?|x)$/.test(word) || confidence < 55) return []
          return [{ text: word, box: [bbox.x0 * x, bbox.y0 * y, bbox.x1 * x, bbox.y1 * y] }]
        })
    })
    ocrQueue = run.catch(() => {})
    return run
  }

  async function extract(source, page, canvas, mode, request, pdfReader=reader) {
    const geometry = await pdfReader.inspect(source, page, request)
    let surface = canvas
    const raw=geometry.words
    geometry.words=normalizedCaptions(raw)
    const hasWords=()=>geometry.words.some(({text})=>mode?isElement(text)&&Object.hasOwn(labels,text):isQuantity(text)||isElement(text)&&Object.hasOwn(labels,text))
    if(!surface){surface=document.createElement('canvas');await pdfReader.render(source,page,surface,request)}
    async function recognize(){
      try{const words=await readText(surface,geometry,request);geometry.words=mergeCaptions(raw,words)}
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
      return analyze('extract',{bitmap,geometry,inventory:mode,labels},[bitmap])
    }
    let samples=await extractSamples()
    // Partial text layers: rerun on raster evidence if the first pass missed captions.
    const expected=geometry.words.filter(({text})=>mode?isElement(text)&&Object.hasOwn(labels,text):isQuantity(text)).length
    if(!usedOcr&&samples.length<expected&&samples.length<Math.max(2,expected*.8)){
      await recognize()
      const recovered=await extractSamples()
      if(recovered.length>=samples.length)samples=recovered
    }
    return samples
  }

  async function scanInventory(source,pages,request,pdfReader){
    const [fingerprint,hash]=await Promise.all([pdfReader.fingerprint(source),version])
    request.throwIfAborted()
    const key=fingerprint&&hash&&JSON.stringify(['regions-v7',set.number,hash,fingerprint])+'/inventory'
    const stored=await cache(key)
    request.throwIfAborted()
    if(stored?.length){books.set(source,stored);return stored}
    const templates=[]
    let emptyAfterInventory=0
    const total=Number.isInteger(pages)&&pages>0?pages:await pdfReader.pageCount(source,request)
    for(let page=total;page>Math.max(0,total-36);page--){
      request.throwIfAborted()
      let items=[]
      try{items=await extract(source,page,null,true,request,pdfReader)}catch{request.throwIfAborted()}
      templates.push(...items)
      emptyAfterInventory=items.length?0:emptyAfterInventory+Number(templates.length>0)
      if(emptyAfterInventory>=3)break
    }
    request.throwIfAborted()
    books.set(source,templates)
    if(templates.length)void cache(key,templates)
    return templates
  }
  async function illustratedInventory(book){
    // Multi-volume sets usually put the illustrated inventory in the final volume.
    // Use a separate PDF reader so opening it cannot replace the visible document.
    if(typeof book.source==='string'&&canonicalInstructionUrl(book.source)){
      const others=(set.books??[]).filter(v=>canonicalInstructionUrl(v.url)&&canonicalInstructionUrl(v.url)!==canonicalInstructionUrl(book.source)).slice(-3).reverse()
      for(const volume of others){
        book.signal.throwIfAborted()
        if(books.get(volume.url)?.length)return books.get(volume.url)
        const extra=createInstructionPdfReader()
        try{
          const templates=await scanInventory(volume.url,null,book.signal,extra)
          if(templates.length)return templates
        }catch{book.signal.throwIfAborted()}finally{extra.close()}
      }
    }
    return scanInventory(book.source,book.pages,book.signal,reader)
  }

  async function pageRegions(source, page, pages, canvas, request) {
    request.throwIfAborted()
    const book = currentBook(source, pages)
    const key = await book.key
    const pageKey = key && `${key}/${page}`
    const stored = await cache(pageKey)
    request.throwIfAborted()
    if (stored) return stored
    const samples = await extract(source, page, canvas, false, request)
    request.throwIfAborted()
    if (!samples.length) return []
    if (samples.every(sample => sample.item?.[0])) {
      const regions = samples.map(({ region, item }) => [...region, ...item])
      void cache(pageKey, regions)
      return regions
    }
    book.inventoryPromise ??= illustratedInventory(book).catch(error => {
      book.inventoryPromise = undefined
      throw error
    })
    try{await book.inventoryPromise}catch{request.throwIfAborted()}
    request.throwIfAborted()
    // A personal PDF can belong to a different edition or set.
    const templates = typeof source === 'string'
      ? [...books].filter(([volume]) => typeof volume === 'string').flatMap(([, items]) => items)
      : books.get(source)??[]
    if (!templates.length) return samples.filter(s=>s.item?.[0]).map(s=>[...s.region,...s.item])
    const regions = await analyze('rank', { samples, templates })
    if (regions.length && regions.length===samples.length) void cache(pageKey, regions)
    request.throwIfAborted()
    return regions
  }

  function closeBook(source) {
    if (active && active.source !== source) {
      active.controller.abort()
      active = undefined
    }
  }

  return { pageRegions, closeBook }
}
