import { createServer } from 'node:http'
import { createReadStream, realpathSync } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { extname, relative, resolve, sep } from 'node:path'
import { createInstructionsHandler } from './instructions.js'

const directories = new Set(['src', 'assets', 'catalog', 'examples', 'vendor'])
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.bricklab': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.mpd': 'text/plain; charset=utf-8', '.dat': 'text/plain; charset=utf-8',
  '.ldr': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.gz': 'application/gzip',
  '.wasm': 'application/wasm', '.pdf': 'application/pdf', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
}

function publicPath(name) {
  // Precomputed annotations must pass through the access-checked API.
  if(/^catalog\/sets\/(?:instruction-part-index|\d+(?:-\d+)?-parts-by-page)\.json$/.test(name))return false
  const segments = name.split('/')
  return name === 'index.html' || (segments.length > 1 && directories.has(segments[0]) &&
    segments.every(part => part && !part.startsWith('.')) &&
    (Object.hasOwn(types, extname(name)) || segments.at(-1) === 'LICENSE'))
}

function send(req, res, status, value, type = 'text/plain; charset=utf-8') {
  const body = Buffer.from(value)
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store' })
  res.end(req.method === 'HEAD' ? undefined : body)
}

function rangeOf(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!match || (!match[1] && !match[2]) || !size) return null
  const first = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const last = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  return Number.isSafeInteger(first) && Number.isSafeInteger(last) && first >= 0 && first <= last && last < size
    ? { start: first, end: last } : null
}

export function createBrickLabServer({ root, logger = console, auth, projects, profile, activity, community, bureau, security, rebrickable, cspReport, payments, approvedLegal=null, instructions = createInstructionsHandler() } = {}) {
  const base = realpathSync(root)
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    try {
      let pathname
      try { pathname = decodeURIComponent(req.url.split('?')[0]) } catch { return send(req, res, 400, 'Bad path') }
      if (!pathname.startsWith('/') || pathname.includes('\\') || /[\u0000-\u001f\u007f]/.test(pathname) ||
          pathname.split('/').some(part => part === '.' || part === '..')) return send(req, res, 400, 'Bad path')
      if (payments && await payments(req,res,pathname)) return
      if (pathname==='/payment/success'||pathname==='/payment/fail') {
        if(req.method!=='GET')return send(req,res,405,'Method not allowed')
        res.writeHead(303,{'Location':'/#store','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return
      }
      if (rebrickable && await rebrickable(req,res,pathname)) return
      if (instructions && await instructions(req,res,pathname)) return
      if (cspReport && await cspReport(req,res,pathname)) return
      if (security && await security(req,res,pathname)) return
      if (auth && pathname.startsWith('/api/auth/') && await auth(req, res, pathname)) return
      if (bureau && await bureau(req,res,pathname)) return
      if (community && await community(req,res,pathname)) return
      if (activity && await activity(req,res,pathname)) return
      if (profile && await profile(req,res,pathname)) return
      if (projects && await projects(req, res, pathname)) return
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD')
        return send(req, res, 405, 'Method not allowed')
      }
      if (pathname === '/store') {
        res.writeHead(302,{'Location':'/#store','Cache-Control':'no-store'});return res.end()
      }
      if (pathname === '/api/health') {
        return send(req, res, 200, JSON.stringify({ status: 'ok', service: 'bricklab-3d' }), 'application/json; charset=utf-8')
      }
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        return send(req, res, 404, JSON.stringify({ error: 'not_found' }), 'application/json; charset=utf-8')
      }
      if(approvedLegal?.pages&&Object.hasOwn(approvedLegal.pages,pathname))return send(req,res,200,approvedLegal.pages[pathname],'text/html; charset=utf-8')
      const name = pathname === '/' ? 'index.html' : pathname === '/requisites' ? 'assets/legal/requisites.html' : ['/offer','/privacy','/refund'].includes(pathname) ? 'assets/legal-public'+pathname+'.html' : pathname.slice(1)
      if (!publicPath(name)) return send(req, res, 404, 'Not found')
      let file, info
      try {
        file = await realpath(resolve(base, name))
        const actual = relative(base, file).split(sep).join('/')
        if (!publicPath(actual) || actual !== name) return send(req, res, 404, 'Not found')
        info = await stat(file)
      } catch (error) {
        if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) return send(req, res, 404, 'Not found')
        throw error
      }
      if (!info.isFile()) return send(req, res, 404, 'Not found')
      const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`
      res.setHeader('ETag', etag)
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Content-Type', types[extname(name)] ?? 'text/plain; charset=utf-8')
      res.setHeader('Accept-Ranges', 'bytes')
      if (req.headers['if-none-match']?.split(',').map(value => value.trim()).some(value => value === etag || value === '*')) {
        res.writeHead(304)
        return res.end()
      }
      const range = req.headers.range && !req.headers['if-range'] ? rangeOf(req.headers.range, info.size) : undefined
      if (range === null) {
        res.setHeader('Content-Range', `bytes */${info.size}`)
        res.writeHead(416, { 'Content-Length': 0 })
        return res.end()
      }
      if (range) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`)
      res.setHeader('Content-Length', range ? range.end - range.start + 1 : info.size)
      res.writeHead(range ? 206 : 200)
      if (req.method === 'HEAD') return res.end()
      await pipeline(createReadStream(file, range), res)
    } catch (error) {
      if (res.destroyed) return
      logger.error('BrickLab HTTP error:', error.code ?? error.name)
      if (res.headersSent) res.destroy()
      else send(req, res, 500, 'Internal server error')
    }
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 15_000
  server.keepAliveTimeout = 5_000
  return server
}
