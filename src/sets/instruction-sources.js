import sequences from '../../catalog/sets/instruction-sequences.json?v=instruction-preview' with { type: 'json' }
import { knownBooks, normalizeBooks, safeBook } from './data.js?v=auto-pdf'

const brickDbUrl = 'https://bricks.party/brickdb.json'
const brickInstructions = 'https://lego.brickinstructions.com'
// BrickInstructions joins volumes into one image sequence. Use it only where
// the sequence matches the official PDFs and their page counts.
const previewSets = new Set([
  '42143-1', '42154-1', '42159-1', '42171-1', '42172-1', '42206-1',
  '42210-1', '42212-1', '42213-1', '42215-1', '42223-1', '76419-1',
])
export const instructionSources = {
  BrickDB: 'https://bricks.party/',
  BrickLink: 'https://www.bricklink.com/v3/designer-program/instructions.page',
}
let archiveRequest

export function instructionPagePreview(setNumber, bookUrl, page) {
  const url = safeBook(bookUrl)
  if (!url || !Number.isInteger(page) || page < 1) return null
  const { hostname, pathname } = new URL(url)
  if (hostname === 'bdpinstructions.download.bricklink.info')
    return { frame: `${url}#page=${page}&view=FitH` }
  if (!previewSets.has(setNumber)) return null
  const pdfId = pathPdfId(pathname)
  const books = sequences[setNumber] ?? (knownBooks[setNumber] ?? []).map(
    ({ title, url, pages }) => [title, pathPdfId(new URL(url).pathname), pages],
  )
  let offset = 0
  for (const [, id, pages] of books) {
    if (id === pdfId && page <= pages) {
      const number = setNumber.split('-')[0]
      const folder = String(Math.floor(Number(number) / 1000) * 1000).padStart(5, '0')
      const imagePage = String(offset + page).padStart(3, '0')
      return {
        image: `${brickInstructions}/instructions/${folder}/${number}/${imagePage}.jpg`,
        source: `${brickInstructions}/lego_instructions/set/${number}`,
      }
    }
    offset += pages
  }
  return null
}

function pathPdfId(pathname) {
  return /^\/(?:biassets\/bi|cdn\/product-assets\/product\.bi\.core\.pdf)\/(\d+)\.pdf$/.exec(pathname)?.[1]
}

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
