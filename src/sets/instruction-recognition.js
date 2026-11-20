const ocrRoot = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/'
const quantity = /^[1-9]\d{0,2}[x×]$/i
const element = /^\d{6,8}$/
let ocrLibrary
let database

function loadOcr() {
  ocrLibrary ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${ocrRoot}tesseract.min.js`
    script.crossOrigin = 'anonymous'
    script.integrity = 'sha384-r1ru3tcf6FhnCFR4B7pIFG+BhFF9LlFtz/P1y4pblWn3AGs9y3lBx5SKLNf4+rED'
    script.onload = () => globalThis.Tesseract ? resolve(globalThis.Tesseract) : reject(Error('OCR unavailable'))
    script.onerror = () => {
      script.remove()
      reject(Error('OCR unavailable'))
    }
    document.head.append(script)
  }).catch(error => {
    ocrLibrary = undefined
    throw error
  })
  return ocrLibrary
}

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
      worker = new Worker(new URL('./instruction-recognition-worker.js?v=instruction-artwork-v3', import.meta.url), { type: 'module' })
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
    if (active?.source === source) return active
    active?.controller.abort()
    const controller = new AbortController()
    const bookSignal = AbortSignal.any([controller.signal, signal])
    const key = Promise.all([reader.fingerprint(source), version]).then(([fingerprint, hash]) => {
      if (!fingerprint || !hash) return
      return JSON.stringify(['regions-v3', set.number, hash, fingerprint])
    })
    active = { source, controller, signal: bookSignal, key, pages }
    return active
  }

  function readText(canvas, geometry, request) {
    const run = ocrQueue.then(async () => {
      request.throwIfAborted()
      ocr ??= loadOcr().then(api => {
        signal.throwIfAborted()
        return api.createWorker('eng', 1, {
          workerPath: `${ocrRoot}worker.min.js`,
          corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
          langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
          errorHandler: () => {},
        })
      }).then(async engine => {
        await engine.setParameters({ tessedit_pageseg_mode: '11' })
        return engine
      }).catch(error => {
        ocr = undefined
        throw error
      })
      const engine = await ocr
      request.throwIfAborted()
      const { data } = await engine.recognize(canvas, {}, { text: false, blocks: true })
      request.throwIfAborted()
      const x = geometry.width / canvas.width, y = geometry.height / canvas.height
      return (data.blocks ?? []).flatMap(block =>
        block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => line.words)))
        .flatMap(({ text, bbox, confidence }) => {
          const word = text.trim()
          if (element.test(word) ? confidence < 75 : !quantity.test(word) || confidence < 55) return []
          return [{ text: word, box: [bbox.x0 * x, bbox.y0 * y, bbox.x1 * x, bbox.y1 * y] }]
        })
    })
    ocrQueue = run.catch(() => {})
    return run
  }

  async function extract(source, page, canvas, mode, request) {
    const geometry = await reader.inspect(source, page, request)
    let surface = canvas
    const hasWords = () => geometry.words.some(({ text }) => mode ? element.test(text) : quantity.test(text))
    if (!hasWords() && !geometry.wideScan) return []
    if (!surface) {
      surface = document.createElement('canvas')
      await reader.render(source, page, surface, request)
    }
    if (!hasWords()) geometry.words = await readText(surface, geometry, request)
    if (!hasWords()) return []
    request.throwIfAborted()
    const bitmap = await createImageBitmap(surface)
    if (request.aborted) {
      bitmap.close()
      request.throwIfAborted()
    }
    return analyze('extract', { bitmap, geometry, inventory: mode, labels }, [bitmap])
  }

  async function illustratedInventory(book) {
    const bookKey = await book.key
    const key = bookKey && `${bookKey}/inventory`
    const stored = await cache(key)
    book.signal.throwIfAborted()
    if (stored) {
      books.set(book.source, stored)
      return stored
    }
    const templates = []
    let emptyAfterInventory = 0
    for (let page = book.pages; page > Math.max(0, book.pages - 24); page--) {
      book.signal.throwIfAborted()
      const items = await extract(book.source, page, null, true, book.signal)
      templates.push(...items)
      emptyAfterInventory = items.length ? 0 : emptyAfterInventory + Number(templates.length > 0)
      if (emptyAfterInventory >= 3) break
    }
    books.set(book.source, templates)
    if (templates.length) void cache(key, templates)
    return templates
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
    if (samples.every(sample => sample.item)) {
      const regions = samples.map(({ region, item }) => [...region, ...item])
      void cache(pageKey, regions)
      return regions
    }
    book.inventoryPromise ??= illustratedInventory(book).catch(error => {
      book.inventoryPromise = undefined
      throw error
    })
    await book.inventoryPromise
    request.throwIfAborted()
    // A personal PDF can belong to a different edition or set.
    const templates = typeof source === 'string'
      ? [...books].filter(([volume]) => typeof volume === 'string').flatMap(([, items]) => items)
      : books.get(source)
    if (!templates.length) return []
    const regions = await analyze('rank', { samples, templates })
    if (regions.length) void cache(pageKey, regions)
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
