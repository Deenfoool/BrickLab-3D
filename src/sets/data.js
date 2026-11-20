// Set inventories are portable project data. Credentials never belong here.
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
const aliases = { 3023: ['3023b'] }
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
    return url.protocol === 'https:' &&
      url.hostname === 'www.lego.com' &&
      url.pathname.endsWith('.pdf')
      ? url.href
      : null
  } catch {
    return null
  }
}
export function mapInventory(inventory, catalog) {
  return inventory.map((item) => {
    const candidates = [
      item.partNum,
      ...(item.ldraw ?? []),
      ...(aliases[item.partNum] ?? []),
    ]
    const design = candidates.find((id) => Object.hasOwn(catalog, id))
    return { ...item, design, model: design ? catalog[design] : null }
  })
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
    books: (value.books ?? knownBooks[value.number] ?? [])
      .filter((b) => safeBook(b.url))
      .map((b) => ({
        title: String(b.title).slice(0, 40),
        pages: Math.max(1, Math.min(5000, Number(b.pages) || 1)),
        url: safeBook(b.url),
      })),
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
        ldraw: Array.isArray(item.ldraw)
          ? item.ldraw.filter((id) => typeof id === 'string')
          : [],
      }
    }),
  }
}
