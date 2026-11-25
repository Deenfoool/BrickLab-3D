// Rebrickable bulk data, packaged locally for keyless searches on GitHub Pages.
const buckets = new Map()
let revision = ''
export function configureElementIndex(value) {
  const next = typeof value === 'string' && /^[a-f0-9]{24}$/.test(value) ? value : ''
  if (revision !== next) { revision = next; buckets.clear() }
}

export function elementNumber(query) {
  return /^(?:LEGO\s+)?(\d{6,8})$/i.exec(String(query).trim())?.[1]
}

export async function lookupElement(query) {
  const id = elementNumber(query)
  if (!id) return
  const digit = id.at(-1)
  const version = revision
  const key = version + '/' + digit
  async function readBucket(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(4500) })
    if (!response.ok) throw Error('Element index unavailable')
    const blob = await response.blob()
    if (blob.size > 12 * 1024 * 1024) throw Error('Element index too large')
    const [magic] = new Uint8Array(await blob.slice(0, 1).arrayBuffer())
    const body = magic === 0x1f ? blob.stream().pipeThrough(new DecompressionStream('gzip')) : blob
    const data = await new Response(body).json()
    if (!data.elements || !data.names || !data.colors) throw Error('Invalid element index')
    return data
  }
  if (!buckets.has(key)) {
    const local = new URL(`../../catalog/elements/${digit}.gz`, import.meta.url)
    const remote = version && new URL(`../../catalog/resolver/elements/${version}/${digit}.gz`, import.meta.url)
    const request = (remote ? readBucket(remote).catch(() => readBucket(local)) : readBucket(local))
      .catch(error => { if (buckets.get(key) === request) buckets.delete(key); throw error })
    buckets.set(key, request)
  }
  const { elements, names, colors } = await buckets.get(key)
  const entry = elements[id]
  if (!entry) return
  const [partNum, colorId, designId] = entry
  const [colorName, color] = colors[colorId] ?? ['', '#999999']
  return { elementId: id, partNum, colorId, colorName, color, name: names[partNum],
    ldraw: designId ? [designId] : [], image: `https://cdn.rebrickable.com/media/parts/elements/${id}.jpg` }
}
