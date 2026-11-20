// Rebrickable bulk data, packaged locally for keyless searches on GitHub Pages.
const buckets = new Map()

export function elementNumber(query) {
  return /^(?:LEGO\s+)?(\d{6,8})$/i.exec(String(query).trim())?.[1]
}

export async function lookupElement(query) {
  const id = elementNumber(query)
  if (!id) return
  const digit = id.at(-1)
  if (!buckets.has(digit)) {
    const url = new URL(`../../catalog/elements/${digit}.gz`, import.meta.url)
    buckets.set(digit, fetch(url).then(async response => {
      if (!response.ok) throw Error('Element index unavailable')
      const blob = await response.blob()
      const [magic] = new Uint8Array(await blob.slice(0, 1).arrayBuffer())
      const body = magic === 0x1f ? blob.stream().pipeThrough(new DecompressionStream('gzip')) : blob
      return new Response(body).json()
    }).catch(error => {
      buckets.delete(digit)
      throw error
    }))
  }
  const { elements, names, colors } = await buckets.get(digit)
  const entry = elements[id]
  if (!entry) return
  const [partNum, colorId, designId] = entry
  const [colorName, color] = colors[colorId] ?? ['', '#999999']
  return { elementId: id, partNum, colorId, colorName, color, name: names[partNum],
    ldraw: designId ? [designId] : [], image: `https://cdn.rebrickable.com/media/parts/elements/${id}.jpg` }
}
