import { resolveInventoryPart } from '../catalog/part-resolver.js?v=catalog-engine-1'
// Set inventories are portable project data. Credentials never belong here.
// Checked against the sequence on LEGO's set-specific instruction pages.
export const knownBooks = {
  '42215-1': [
    {
      title: '1/2',
      pages: 292,
      url: 'https://www.lego.com/cdn/product-assets/product.bi.core.pdf/6592888.pdf',
    },
    {
      title: '2/2',
      pages: 232,
      url: 'https://www.lego.com/cdn/product-assets/product.bi.core.pdf/6595793.pdf',
    },
  ],
}
export const inventoryKey = (item) => `${item.partNum}/${item.colorId}`
export const normalizeQuery = (value) =>
  String(value).toLowerCase().replaceAll('ё', 'е').trim()
export const safeImage = (value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : ''
  } catch {
    return ''
  }
}
export function safeBook(value) {
  try {
    const url = new URL(value)
    url.hash = ''
    if (url.protocol !== 'https:' || url.port || url.username || url.password)
      return null
    if (url.hostname === 'www.lego.com' && url.pathname.endsWith('.pdf'))
      return url.href
    if (
      url.hostname === 'bdpinstructions.download.bricklink.info' &&
      /^\/910\d{3}\.pdf$/.test(url.pathname)
    )
      return url.href
    return null
  } catch {
    return null
  }
}
export function normalizeBooks(books) {
  const result = []
  for (const book of Array.isArray(books) ? books : []) {
    const url = safeBook(book?.url)
    if (!url) continue
    const pages = Math.trunc(Number(book.pages))
    result.push({
      title: String(book.title ?? result.length + 1).slice(0, 40),
      pages: pages >= 1 && pages <= 5000 ? pages : null,
      url,
      ...(['BrickDB', 'BrickLink'].includes(book.source) && {
        source: book.source,
      }),
    })
  }
  return result
}
export function mapInventory(inventory, catalog) {
  return inventory.map((item) => {
    const result = resolveInventoryPart(item, catalog)
    return { ...item, design: result.design, model: result.model ?? null, resolution: result.status }
  })
}
// Coverage counts actual regular pieces, not distinct inventory rows.
export function auditInventory(items) {
  const counts = { exact: 0, alias: 0, external: 0, ambiguous: 0, missing: 0 }
  for (const item of items) {
    if (item.spare || !Number.isInteger(item.quantity) || item.quantity < 1) continue
    const status = Object.hasOwn(counts, item.resolution) ? item.resolution : 'missing'
    counts[status] += item.quantity
  }
  return counts
}
export function inventoryUsage(items, parts) {
  const counts = new Map()
  for (const part of parts) {
    const color = String(part.color ?? '').toLowerCase()
    const key = `${part.design}/${color}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const remaining = new Map(counts)
  return items.map((item) => {
    const key = `${item.design}/${item.color.toLowerCase()}`
    const count = remaining.get(key) ?? 0
    const used = Math.min(count, item.quantity)
    remaining.set(key, count - used)
    return {
      ...item,
      used,
      excess: count > item.quantity ? count - item.quantity : 0,
    }
  })
}
export function validateSet(value) {
  if (
    !value ||
    !/^[\w-]+$/.test(value.number) ||
    typeof value.name !== 'string' ||
    !Array.isArray(value.inventory) ||
    value.inventory.length > 10000
  )
    throw Error('invalid-inventory')
  return {
    number: value.number,
    name: value.name.slice(0, 160),
    year: Number(value.year) || 0,
    themeId: Number(value.themeId) || (value.number === '42215-1' ? 1 : null),
    image: safeImage(value.image),
    source: 'Rebrickable',
    books: normalizeBooks(value.books ?? knownBooks[value.number]),
    inventory: value.inventory.map((item) => {
      if (
        !item ||
        typeof item.partNum !== 'string' ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        !/^#[\da-f]{6}$/i.test(item.color)
      )
        throw Error('invalid-inventory')
      return {
        partNum: item.partNum,
        name: String(item.name ?? item.partNum),
        colorId: String(item.colorId),
        colorName: String(item.colorName ?? ''),
        color: item.color,
        quantity: item.quantity,
        spare: Boolean(item.spare),
        image: safeImage(item.image),
        ...(/^\d{6,8}$/.test(String(item.elementId ?? '')) && { elementId: String(item.elementId) }),
        ldraw: Array.isArray(item.ldraw)
          ? item.ldraw.filter((id) => typeof id === 'string')
          : [],
      }
    }),
  }
}
