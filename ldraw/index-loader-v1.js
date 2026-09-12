export const LDRAW_CATALOG_INDEX_URLS = Object.freeze({
  current: 'https://raw.githubusercontent.com/partcad/partcad-ldraw/main/parts-index.zip',
  legacy: 'https://raw.githubusercontent.com/partcad/partcad-ldraw/b91d69a98f72c9d550a838dcb74534a2991575ea/parts-index.json.gz',
})

const utf8 = new TextDecoder()
const ZIP_LOCAL = 0x04034b50
const ZIP_CENTRAL = 0x02014b50
const ZIP_EOCD = 0x06054b50

async function inflateBytes(bytes, format) {
  if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream is unavailable')
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function findEocd(view) {
  const min = Math.max(0, view.byteLength - 0xffff - 22)
  for (let offset = view.byteLength - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_EOCD) return offset
  }
  throw new Error('Invalid ZIP: end-of-central-directory not found')
}

function zipReader(buffer) {
  const view = new DataView(buffer)
  const eocd = findEocd(view)
  const entries = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const files = new Map()
  for (let i = 0; i < entries; i += 1) {
    if (view.getUint32(offset, true) !== ZIP_CENTRAL) throw new Error('Invalid ZIP central directory')
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const fileNameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = utf8.decode(new Uint8Array(buffer, offset + 46, fileNameLength))
    if (view.getUint32(localOffset, true) !== ZIP_LOCAL) throw new Error(`Invalid ZIP local header: ${name}`)
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength
    const compressed = new Uint8Array(buffer, dataOffset, compressedSize)
    files.set(name, { async text() {
      if (method === 0) return utf8.decode(compressed)
      if (method !== 8) throw new Error(`Unsupported ZIP compression method ${method}: ${name}`)
      return utf8.decode(await inflateBytes(compressed, 'deflate-raw'))
    } })
    offset += 46 + fileNameLength + extraLength + commentLength
  }
  return files
}

const categoryMember = category => `c/${String(category).trim().replace(/\s+/g, '-')}.json`
const catalogItem = (code, description, category) => ({
  file: `${code}.dat`, code,
  description: String(description || '').trim() || `LDraw ${code}`,
  category,
})

export async function decodeLDrawZipIndex(buffer) {
  const files = zipReader(buffer)
  const metaFile = files.get('index.json')
  if (!metaFile) throw new Error('LDraw ZIP index is missing index.json')
  const meta = JSON.parse(await metaFile.text())
  if (meta.format !== 3 || !meta.categories) throw new Error(`Unsupported LDraw ZIP index format: ${meta.format}`)
  const items = []
  for (const [category, ids] of Object.entries(meta.categories)) {
    const member = files.get(categoryMember(category))
    if (!member) throw new Error(`LDraw ZIP index is missing category: ${category}`)
    const parts = JSON.parse(await member.text())
    for (const code of ids) {
      const entry = parts[code]
      items.push(catalogItem(code, Array.isArray(entry) ? entry[0] : '', category))
    }
  }
  if (!items.length) throw new Error('LDraw ZIP index is empty')
  return items
}

export async function decodeLDrawLegacyIndex(buffer) {
  const json = utf8.decode(await inflateBytes(new Uint8Array(buffer), 'gzip'))
  const data = JSON.parse(json)
  if (data.format !== 2 || !data.categories) throw new Error(`Unsupported legacy LDraw index format: ${data.format}`)
  const items = []
  for (const [category, parts] of Object.entries(data.categories)) {
    for (const [code, entry] of Object.entries(parts)) {
      if (Array.isArray(entry)) items.push(catalogItem(code, entry[0], category))
    }
  }
  if (!items.length) throw new Error('Legacy LDraw index is empty')
  return items
}

async function fetchBuffer(fetcher, url) {
  const response = await fetcher(url, { mode: 'cors', cache: 'force-cache' })
  if (!response.ok) throw new Error(`Index HTTP ${response.status}: ${url}`)
  return response.arrayBuffer()
}

export async function loadLDrawCatalogIndex({ fetcher = globalThis.fetch, urls = LDRAW_CATALOG_INDEX_URLS } = {}) {
  let currentError
  try {
    const items = await decodeLDrawZipIndex(await fetchBuffer(fetcher, urls.current))
    return { items, source: 'current-zip', url: urls.current }
  } catch (error) {
    currentError = error
    console.warn('[BrickLab Library] Current ZIP index unavailable; trying pinned legacy index.', error)
  }
  try {
    const items = await decodeLDrawLegacyIndex(await fetchBuffer(fetcher, urls.legacy))
    return { items, source: 'pinned-legacy-gzip', url: urls.legacy, recoveredFrom: String(currentError?.message || currentError) }
  } catch (legacyError) {
    throw new Error(`LDraw catalog indexes unavailable: ${currentError?.message || currentError}; ${legacyError?.message || legacyError}`)
  }
}
