import sequences from '../../catalog/sets/instruction-sequences.json' with { type: 'json' }
import { knownBooks, normalizeBooks, safeBook } from './data.js?v=auto-pdf'

const brickDbUrl = 'https://bricks.party/brickdb.json'
export const instructionSources = {
  BrickDB: 'https://bricks.party/',
  BrickLink: 'https://www.bricklink.com/v3/designer-program/instructions.page',
}
let archiveRequest

export function archiveBooks(instructions) {
  const books = (Array.isArray(instructions) ? instructions : [])
    .filter(
      (book) => book?.pdf_type === 'Instruction' && safeBook(book.pdf_url),
    )
    .sort((a, b) =>
      String(a.pdf_id).localeCompare(String(b.pdf_id), 'en', { numeric: true }),
    )
  const unique = new Map(books.map((book) => [safeBook(book.pdf_url), book]))
  return normalizeBooks(
    [...unique.values()].map((book, index) => ({
      title: String(index + 1),
      url: book.pdf_url,
      pages: book.page_count,
      source: 'BrickDB',
    })),
  )
}

function loadArchive() {
  // This is the same public index that BrickDB's browser client uses. Share
  // the lazy download across cards and editors, and allow retry after a failure.
  archiveRequest ??= (async () => {
    const response = await fetch(brickDbUrl, {
      credentials: 'omit',
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw Error('instruction-index-unavailable')
    const archive = await response.json()
    return new Map(archive.sets.map((set) => [set.set_num, set.instructions]))
  })().catch((error) => {
    archiveRequest = undefined
    throw error
  })
  return archiveRequest
}

async function findDesignerBook(number, signal) {
  const url = `https://bdpinstructions.download.bricklink.info/${number}.pdf`
  const response = await fetch(url, {
    credentials: 'omit',
    headers: { Range: 'bytes=0-1023' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  })
  if (response.status === 403 || response.status === 404) return []
  if (!response.ok) throw Error('designer-book-unavailable')
  if (!response.headers.get('content-type')?.startsWith('application/pdf')) {
    response.body?.cancel().catch(() => {})
    return []
  }
  // Linearized PDFs put the page count in the first object. If the CDN
  // ignores Range, close the stream instead of downloading the entire book.
  let pages = null
  const length = Number(response.headers.get('content-length'))
  if (response.status === 206 && length > 0 && length <= 1024) {
    const header = new TextDecoder().decode(await response.arrayBuffer())
    if (!header.startsWith('%PDF-')) return []
    if (header.includes('/Linearized'))
      pages = Number(header.match(/\/N\s+(\d+)/)?.[1])
  } else {
    response.body?.cancel().catch(() => {})
  }
  return normalizeBooks([{ title: '1', url, pages, source: 'BrickLink' }])
}

export async function discoverBooks(setNumber, signal) {
  signal.throwIfAborted()
  const known = knownBooks[setNumber]
  if (Array.isArray(known)) return known
  const sequence = sequences[setNumber]
  if (Array.isArray(sequence))
    return normalizeBooks(
      sequence.map(([title, id, pages]) => ({
        title,
        pages,
        url: `https://www.lego.com/cdn/product-assets/product.bi.core.pdf/${id}.pdf`,
      })),
    )

  const designer = /^(910\d{3})-1$/.exec(setNumber)
  if (designer) {
    const books = await findDesignerBook(designer[1], signal).catch((error) => {
      signal.throwIfAborted()
      return error
    })
    if (Array.isArray(books) && books.length) return books
    const archive = await loadArchive()
    signal.throwIfAborted()
    const indexed = archiveBooks(archive.get(setNumber))
    if (!indexed.length && books instanceof Error) throw books
    return indexed
  }

  const archive = await loadArchive()
  signal.throwIfAborted()
  return archiveBooks(archive.get(setNumber))
}
