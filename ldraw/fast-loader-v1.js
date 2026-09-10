import { PARTS } from '../parts.js'

export const LDRAW_FAST_LOADER_VERSION = 'ldraw-fast-loader-v1.1.0'

const HOME_WARM = ['3001.dat','3003.dat','3004.dat','3005.dat','3020.dat','3022.dat','3023.dat','3894.dat','3895.dat','2780.dat','3673.dat','6558.dat','3705.dat','3706.dat','3707.dat','3708.dat']
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null
const constrainedNetwork = Boolean(connection?.saveData || /(?:^|-)2g$/.test(connection?.effectiveType || ''))
const deviceMemory = Number(navigator.deviceMemory || 4)
const backgroundLimit = constrainedNetwork ? 0 : deviceMemory <= 2 ? 10 : deviceMemory <= 4 ? 24 : 48
const concurrency = constrainedNetwork ? 1 : deviceMemory <= 2 ? 2 : 3
const criticalConcurrency = concurrency + 1

const queue = []
const queued = new Map()
const active = new Map()
const prepared = new Set()
const failed = new Map()
const warmRoots = new Map()
const connectorWarm = new Map()
let workers = 0
let backgroundStarted = 0
let observedCards = new WeakSet()
let cardObserver = null
let mutationObserver = null

const diagnostics = {
  queued:0, active:0, prepared:0, failed:0, backgroundStarted:0,
  cacheHits:0, hoverRequests:0, visibleRequests:0, criticalRequests:0,
  connectorWarm:0, connectorWarmFailed:0, totalPrepareMs:0, lastPrepareMs:0,
}

function normalizeFile(value) {
  return String(value || '').replace(/^parts\//i, '').replace(/\\/g, '/').trim()
}
function codeOf(file) { return normalizeFile(file).replace(/\.dat$/i, '') }
function partId(file) { return `ldraw-${codeOf(file)}` }
function priorityValue(priority) {
  return priority === 'critical' ? 300 : priority === 'hover' ? 220 : priority === 'visible' ? 120 : 40
}
function findDefinition(file) {
  const id = partId(file)
  return PARTS.find(part => part.id === id) || null
}
function ensureDefinition(file) {
  const normalized = normalizeFile(file)
  let def = findDefinition(normalized)
  if (def) return def
  const runtime = globalThis.BrickLabLDraw
  if (!runtime?.register) throw new Error('LDraw runtime is not ready')
  return runtime.register({ file:normalized, code:codeOf(normalized), description:`LDraw ${codeOf(normalized)}` })
}
function disposeWarmRoot(root) {
  if (!root) return
  root.traverse?.(object => {
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []
    for (const material of materials) material?.dispose?.()
  })
  root.clear?.()
}
function waitForVisual(def, root, timeoutMs = 30000) {
  if (def?.ldraw?.ready && root?.userData?.ldraw?.status !== 'error') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const tick = () => {
      if (def?.ldraw?.ready) return resolve()
      if (root?.userData?.ldraw?.status === 'error') return reject(new Error(root.userData.ldraw.error || `Could not preload ${def?.id}`))
      if (performance.now() - started >= timeoutMs) return reject(new Error(`LDraw preload timeout: ${def?.id || 'unknown'}`))
      setTimeout(tick, 40)
    }
    tick()
  })
}
async function hydrateV4(def, root) {
  const runtime = globalThis.BrickLabConnectorV4
  if (!runtime?.hydrate || !def?.ldraw?.ready) return null
  const current = def.connectivityV4
  if (current?.status === 'ready') return current
  return runtime.hydrate(def, root)
}
function startConnectorWarm(file, def, root) {
  const normalized = normalizeFile(file)
  const existing = connectorWarm.get(normalized)
  if (existing) return existing
  const promise = hydrateV4(def, root)
    .then(value => { diagnostics.connectorWarm += 1; return value })
    .catch(error => { diagnostics.connectorWarmFailed += 1; console.debug?.(`[BrickLab LDraw Fast] V4 warm failed for ${normalized}`, error); return null })
    .finally(() => {
      connectorWarm.delete(normalized)
      warmRoots.delete(normalized)
      disposeWarmRoot(root)
    })
  connectorWarm.set(normalized, promise)
  return promise
}
async function perform(file) {
  const normalized = normalizeFile(file)
  const def = ensureDefinition(normalized)
  if (def.ldraw?.ready) {
    diagnostics.cacheHits += 1
    prepared.add(normalized)
    if (def.connectivityV4?.status !== 'ready') {
      const root = def.create(def.defaultColor)
      warmRoots.set(normalized, root)
      void startConnectorWarm(normalized, def, root)
    }
    return def
  }
  const started = performance.now()
  const root = def.create(def.defaultColor)
  warmRoots.set(normalized, root)
  try {
    await waitForVisual(def, root)
    prepared.add(normalized)
    failed.delete(normalized)
    const elapsed = performance.now() - started
    diagnostics.lastPrepareMs = elapsed
    diagnostics.totalPrepareMs += elapsed
    // Connector hydration is deliberately detached from the visual worker. Once the
    // reusable LDraw prototype exists, the next geometry preload can start while V4
    // Shadow metadata finishes on the retained temporary root.
    void startConnectorWarm(normalized, def, root)
    return def
  } catch (error) {
    warmRoots.delete(normalized)
    disposeWarmRoot(root)
    throw error
  }
}
function sortQueue() { queue.sort((a,b) => b.priority - a.priority || a.order - b.order) }
function pump() {
  sortQueue()
  while (queue.length) {
    const task = queue[0]
    const limit = task.priority >= 300 ? criticalConcurrency : concurrency
    if (workers >= limit) break
    queue.shift()
    if (!task || active.has(task.file)) continue
    queued.delete(task.file)
    workers += 1
    diagnostics.queued = queue.length
    diagnostics.active = workers
    const work = perform(task.file)
      .then(value => { diagnostics.prepared = prepared.size; task.resolve(value); return value })
      .catch(error => { failed.set(task.file, String(error?.message || error)); diagnostics.failed = failed.size; task.reject(error); throw error })
      .finally(() => {
        workers -= 1
        active.delete(task.file)
        diagnostics.active = workers
        diagnostics.prepared = prepared.size
        diagnostics.failed = failed.size
        pump()
      })
    active.set(task.file, work)
    work.catch(() => {})
    sortQueue()
  }
}
let order = 0
export function preloadLDrawPart(file, { priority='visible', background=false } = {}) {
  const normalized = normalizeFile(file)
  if (!normalized) return Promise.resolve(null)
  const def = findDefinition(normalized)
  if (prepared.has(normalized) || def?.ldraw?.ready) {
    prepared.add(normalized); diagnostics.cacheHits += 1; diagnostics.prepared = prepared.size
    return Promise.resolve(def)
  }
  if (active.has(normalized)) return active.get(normalized)
  const existing = queued.get(normalized)
  if (existing) {
    existing.priority = Math.max(existing.priority, priorityValue(priority))
    pump()
    return existing.promise
  }
  if (background && (constrainedNetwork || backgroundStarted >= backgroundLimit)) return Promise.resolve(null)
  if (background) { backgroundStarted += 1; diagnostics.backgroundStarted = backgroundStarted }
  let resolveTask, rejectTask
  const promise = new Promise((resolve,reject) => { resolveTask=resolve; rejectTask=reject })
  promise.catch(() => {})
  const task = { file:normalized, priority:priorityValue(priority), order:order++, background, resolve:resolveTask, reject:rejectTask, promise }
  queue.push(task); queued.set(normalized, task); diagnostics.queued = queue.length; pump()
  return promise
}

function cardFile(target) { return target?.closest?.('.ld2-card[data-file]')?.dataset?.file || '' }
function observeCard(card) {
  if (!card || observedCards.has(card)) return
  observedCards.add(card)
  cardObserver?.observe(card)
}
function scanCards(root=document) { root.querySelectorAll?.('.ld2-card[data-file]').forEach(observeCard) }
function installPrediction() {
  cardObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const file = entry.target.dataset.file
      if (file) { diagnostics.visibleRequests += 1; void preloadLDrawPart(file,{priority:'visible',background:true}) }
      cardObserver.unobserve(entry.target)
    }
  }, { rootMargin:'320px 180px', threshold:0.01 })
  mutationObserver = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node?.nodeType === 1) { if (node.matches?.('.ld2-card[data-file]')) observeCard(node); scanCards(node) }
  })
  mutationObserver.observe(document.documentElement,{subtree:true,childList:true})
  scanCards()
  document.addEventListener('pointerover', event => {
    const file=cardFile(event.target); if (!file) return
    diagnostics.hoverRequests += 1
    void preloadLDrawPart(file,{priority:'hover'}).catch(()=>{})
  }, {capture:true,passive:true})
  document.addEventListener('focusin', event => {
    const file=cardFile(event.target); if (file) void preloadLDrawPart(file,{priority:'hover'}).catch(()=>{})
  }, true)
  document.addEventListener('pointerdown', event => {
    const file=cardFile(event.target); if (!file) return
    diagnostics.criticalRequests += 1
    void preloadLDrawPart(file,{priority:'critical'}).catch(()=>{})
  }, {capture:true,passive:true})
}
function idle(callback, timeout=1500) {
  if (typeof requestIdleCallback === 'function') return requestIdleCallback(callback,{timeout})
  return setTimeout(callback,Math.min(timeout,600))
}
function warmSavedList(key, max) {
  try {
    const items=JSON.parse(localStorage.getItem(key)||'[]')
    if (!Array.isArray(items)) return []
    return items.slice(0,max).map(item=>normalizeFile(item?.file)).filter(Boolean)
  } catch { return [] }
}
function startIdleWarmup() {
  if (constrainedNetwork || backgroundLimit <= 0) return
  idle(() => {
    const recent=warmSavedList('bricklab.ldraw.recents.v3',8)
    const favorites=warmSavedList('bricklab.ldraw.favorites.v3',8)
    const files=[...new Set([...recent,...favorites,...HOME_WARM])].slice(0,backgroundLimit)
    files.forEach((file,index) => idle(() => void preloadLDrawPart(file,{priority:'idle',background:true}),700+index*120))
  },900)
}

installPrediction()
startIdleWarmup()

export const BrickLabLDrawFastLoader = Object.freeze({
  version:LDRAW_FAST_LOADER_VERSION,
  preload:preloadLDrawPart,
  stats:()=>Object.freeze({...diagnostics,prepared:prepared.size,failed:failed.size,queued:queue.length,active:workers,connectorWarmActive:connectorWarm.size,backgroundLimit,concurrency,criticalConcurrency,constrainedNetwork,averagePrepareMs:prepared.size?diagnostics.totalPrepareMs/prepared.size:0}),
  isPrepared:file=>prepared.has(normalizeFile(file)),
})
globalThis.BrickLabLDrawFastLoader = BrickLabLDrawFastLoader
