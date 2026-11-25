import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { canonicalInstructionUrl } from '../src/sets/instruction-url.js'

const maxPdfBytes = 256 * 1024 * 1024
function reply(req, res, status, error) {
  const body = JSON.stringify({ error })
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) })
  res.end(req.method === 'HEAD' ? undefined : body)
}

export function officialBooks(html) {
  const script = /<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)
  if (!script) throw Error('instruction-page-unavailable')
  const pending = [JSON.parse(script[1])], books = new Map()
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object') continue
    if (Array.isArray(value.buildingInstructions)) {
      for (const item of value.buildingInstructions) {
        const url = canonicalInstructionUrl(item?.pdf?.pdfUrl)
        if (!url || item.isAdditionalInfoBooklet) continue
        const order = Number(item.sequence?.element) || books.size + 1
        const total = Number(item.sequence?.total) || 1
        books.set(url, { title: total > 1 ? `${order}/${total}` : String(order), url, pages: null, order })
      }
    }
    pending.push(...Object.values(value).filter(child => child && typeof child === 'object'))
  }
  return [...books.values()].sort((a, b) => a.order - b.order).map(({ order, ...book }) => book)
}

export function createInstructionsHandler({ fetcher = fetch, maxBytes = maxPdfBytes, concurrency = 8, timeout = 120_000 } = {}) {
  let active = 0
  const cache = new Map(), pendingBooks = new Map()
  async function upstream(url, options) {
    for (let hop = 0; hop < 4; hop++) {
      const response = await fetcher(url, { ...options, redirect: 'manual' })
      if (![301, 302, 303, 307, 308].includes(response.status)) return response
      const next = canonicalInstructionUrl(new URL(response.headers.get('location'), url).href)
      await response.body?.cancel()
      if (!next) throw Error('invalid-instruction-redirect')
      url = next
    }
    throw Error('too-many-redirects')
  }
  async function books(set, signal) {
    const cached = cache.get(set)
    if (cached?.until > Date.now()) return cached.books
    if (pendingBooks.has(set)) return pendingBooks.get(set)
    // One official set page replaces a multi-megabyte third-party index in each browser.
    const request = (async () => {
      const response = await fetcher(`https://www.lego.com/en-us/service/building-instructions/${set.split('-')[0]}`, {
        redirect: 'error', signal, headers: { Accept: 'text/html', 'User-Agent': 'BrickLab/0.2 (building instructions)' },
      })
      if (!response.ok) { await response.body?.cancel(); throw Error('instruction-page-unavailable') }
      const chunks = []; let size = 0
      for await (const chunk of response.body) {
        size += chunk.length
        if (size > 6 * 1024 * 1024) throw Error('instruction-page-too-large')
        chunks.push(chunk)
      }
      const result = officialBooks(Buffer.concat(chunks).toString('utf8'))
      cache.delete(set)
      cache.set(set, { books: result, until: Date.now() + (result.length ? 12 * 3600_000 : 300_000) })
      if (cache.size > 1000) cache.delete(cache.keys().next().value)
      return result
    })().finally(() => pendingBooks.delete(set))
    pendingBooks.set(set, request)
    return request
  }
  return async (req, res, pathname) => {
    if (!['/api/instructions/pdf', '/api/instructions/books'].includes(pathname)) return false
    if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); reply(req, res, 405, 'method_not_allowed'); return true }
    const params = new URL(req.url, 'http://localhost').searchParams
    const isPdf = pathname.endsWith('/pdf'), key = isPdf ? 'url' : 'set'
    const value = params.get(key)
    if (params.size !== 1 || !value || (isPdf ? !canonicalInstructionUrl(value) : !/^\d{3,7}-\d{1,2}$/.test(value))) {
      reply(req, res, 400, 'invalid_instruction'); return true
    }
    if (req.headers.range && !/^bytes=\d*-\d*$/.test(req.headers.range)) { reply(req, res, 416, 'invalid_range'); return true }
    if (active >= concurrency) { res.setHeader('Retry-After', '3'); reply(req, res, 503, 'instructions_busy'); return true }
    active++
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout).unref()
    const abort = () => controller.abort()
    res.once('close', abort)
    try {
      if (!isPdf) {
        const body = JSON.stringify({ books: await books(value, controller.signal) })
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'public, max-age=300' })
        res.end(req.method === 'HEAD' ? undefined : body)
        return true
      }
      const headers = { Accept: 'application/pdf', 'Accept-Encoding': 'identity' }
      for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) if (req.headers[name]) headers[name] = req.headers[name]
      const response = await upstream(canonicalInstructionUrl(value), { method: req.method, headers, signal: controller.signal })
      if (response.status === 304) { res.writeHead(304, { 'Cache-Control': 'public, max-age=86400' }); res.end(); return true }
      if (response.status === 416) {
        const range = response.headers.get('content-range')
        if (range) res.setHeader('Content-Range', range)
        await response.body?.cancel(); reply(req, res, 416, 'invalid_range'); return true
      }
      if (![200, 206].includes(response.status)) {
        await response.body?.cancel(); reply(req, res, response.status === 404 ? 404 : 502, 'instruction_unavailable'); return true
      }
      const length = Number(response.headers.get('content-length'))
      if (length > maxBytes) { await response.body?.cancel(); reply(req, res, 413, 'instruction_too_large'); return true }
      const type = response.headers.get('content-type') ?? ''
      if (!/^(application\/(pdf|octet-stream))(;|$)/i.test(type)) {
        await response.body?.cancel(); reply(req, res, 502, 'invalid_instruction_pdf'); return true
      }
      const outgoing = { 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=86400', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' }
      for (const name of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        const header = response.headers.get(name)
        if (header) outgoing[name] = header
      }
      // Do not forward upstream cookies, X-Frame-Options, or the LEGO page CSP.
      if (req.method === 'HEAD') { await response.body?.cancel(); res.writeHead(response.status, outgoing); res.end(); return true }
      const reader = response.body.getReader()
      const prefix = []; let prefixSize = 0
      while (prefixSize < 5) {
        const chunk = await reader.read()
        if (chunk.done) break
        prefix.push(Buffer.from(chunk.value)); prefixSize += chunk.value.length
      }
      if (response.status === 200 || /^bytes 0-/.test(response.headers.get('content-range') ?? '')) {
        if (!Buffer.concat(prefix).subarray(0, 5).equals(Buffer.from('%PDF-'))) {
          await reader.cancel(); reply(req, res, 502, 'invalid_instruction_pdf'); return true
        }
      }
      res.writeHead(response.status, outgoing)
      async function* body() {
        let size = prefixSize
        if (size > maxBytes) throw Error('instruction-too-large')
        yield* prefix
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) return
          size += chunk.value.length
          if (size > maxBytes) throw Error('instruction-too-large')
          yield chunk.value
        }
      }
      await pipeline(Readable.from(body()), res)
    } catch {
      controller.abort()
      if (res.headersSent) res.destroy()
      else if (!res.destroyed) reply(req, res, 502, 'instruction_unavailable')
    } finally {
      clearTimeout(timer); res.removeListener('close', abort); active--
    }
    return true
  }
}
