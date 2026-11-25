// Shared part identity resolver. Never infer equivalence from similar names,
// numeric prefixes, colour or an arbitrary mold relationship.
import { lookupElement, configureElementIndex } from '../editor/element-index.js?v=catalog-engine-1'

const seed = Object.freeze({ '66906': '6628', '3023': '3023b' })
const identifier = value => {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const id = String(value).trim().toLowerCase().replace(/\.dat$/, '')
  return /^[a-z0-9][a-z0-9_-]{0,79}$/.test(id) ? id : ''
}
let generated = Object.create(null)
let loading, nextRefresh = 0, generation = 0
const indexes = new WeakMap()

// A single static, public index per session; a failed refresh never erases it.
// No external requests from the browser and no per-part API rate-limit pressure.
export async function loadPartIndex({ fetcher = globalThis.fetch, now = Date.now() } = {}) {
  if (loading) return loading
  if (now < nextRefresh || typeof fetcher !== 'function') return
  loading = (async () => {
    try {
      const response = await fetcher(new URL('../../catalog/resolver/aliases.json', import.meta.url),
        { cache: 'no-cache', signal: AbortSignal.timeout(2000) })
      if (!response.ok) throw Error('index unavailable')
      const raw = await response.text()
      if (raw.length > 4_000_000) throw Error('index too large')
      const data = JSON.parse(raw)
      if (data.schema !== 1 || !data.aliases || Array.isArray(data.aliases) ||
          typeof data.aliases !== 'object') throw Error('invalid index')
      const next = Object.create(null)
      for (const [alias, target] of Object.entries(data.aliases)) {
        if (identifier(alias) !== alias || typeof target !== 'string' ||
            identifier(target) !== target || alias === target) throw Error('invalid alias')
        next[alias] = target
      }
      if (!Object.keys(next).length) throw Error('empty index')
      generated = next
      configureElementIndex(data.elementRevision)
      generation++
      nextRefresh = now + 15 * 60_000
    } catch {
      nextRefresh = now + 60_000
    }
  })().finally(() => { loading = undefined })
  return loading
}

function catalogIndex(catalog) {
  const previous = indexes.get(catalog)
  if (previous?.generation === generation) return previous.map
  const map = new Map()
  function add(alias, target) {
    alias = identifier(alias); target = identifier(target)
    if (!alias || !target || !Object.hasOwn(catalog, target) || alias === target) return
    if (!map.has(alias)) map.set(alias, new Set())
    map.get(alias).add(target)
  }
  for (const [design, part] of Object.entries(catalog)) {
    for (const alias of Array.isArray(part?.aliases) ? part.aliases : []) add(alias, design)
  }
  for (const [alias, target] of Object.entries(seed)) add(alias, target)
  for (const [alias, target] of Object.entries(generated)) add(alias, target)
  indexes.set(catalog, { generation, map })
  return map
}

// Direct local IDs always win. Official aliases are safe for pose-preserving
// imports; an ambiguous alias deliberately has no automatic resolution.
export function resolvePart(value, catalog) {
  const id = identifier(value)
  if (!id) return { status: 'missing' }
  if (Object.hasOwn(catalog, id)) return { status: 'exact', design: id, model: catalog[id] }
  const candidates = [...(catalogIndex(catalog).get(id) ?? [])]
  if (candidates.length > 1) return { status: 'ambiguous', candidates }
  if (candidates.length === 1) {
    const design = candidates[0]
    return { status: 'alias', design, model: catalog[design] }
  }
  return { status: 'missing' }
}

export function resolveInventoryPart(item, catalog) {
  const primary = resolvePart(item?.partNum, catalog)
  if (primary.design || primary.status === 'ambiguous') return primary
  const candidates = new Set()
  for (const id of Array.isArray(item?.ldraw) ? item.ldraw : []) {
    const result = resolvePart(id, catalog)
    if (result.design) candidates.add(result.design)
    for (const candidate of result.candidates ?? []) candidates.add(candidate)
  }
  if (candidates.size > 1) return { status: 'ambiguous', candidates: [...candidates] }
  if (candidates.size === 1) {
    const design = [...candidates][0]
    return { status: 'external', design, model: catalog[design] }
  }
  return primary
}

// Recover older saved inventories with their exact LEGO Element ID. The
// packaged lookup shares a promise per digit bucket (at most ten requests).
// Only trust matching part AND colour records. Do not mutate saved inventories.
export async function enrichInventory(inventory, catalog, { lookup = lookupElement, signal } = {}) {
  return Promise.all(inventory.map(async item => {
    if (signal?.aborted || resolveInventoryPart(item, catalog).status !== 'missing' || !item.elementId) return item
    try {
      const record = await lookup(item.elementId)
      if (signal?.aborted || !record || identifier(record.partNum) !== identifier(item.partNum) ||
          String(record.colorId) !== String(item.colorId)) return item
      const ldraw = [...new Set([...(item.ldraw ?? []), ...(record.ldraw ?? [])])]
      const enriched = { ...item, ldraw }
      return resolveInventoryPart(enriched, catalog).design ? enriched : item
    } catch { return item }
  }))
}

export function normalizeDocumentDesigns(document, catalog) {
  const parts = document.parts.map(part => {
    const result = resolvePart(part?.design, catalog)
    return result.status === 'alias' ? { ...part, design: result.design } : part
  })
  return { ...document, parts }
}
