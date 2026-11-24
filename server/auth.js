import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'

const derive = promisify(scrypt)
const params = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }
const lifetime = 7 * 24 * 60 * 60
const hashToken = token => createHash('sha256').update(token).digest('hex')
const dummy = 'scrypt$' + '0'.repeat(32) + '$' + '0'.repeat(128)

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = await derive(password, salt, 64, params)
  return 'scrypt$' + salt + '$' + hash.toString('hex')
}
export async function verifyPassword(password, encoded) {
  const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded || '')
  if (!match) return false
  const hash = await derive(password, match[1], 64, params)
  return timingSafeEqual(hash, Buffer.from(match[2], 'hex'))
}
function reply(res, code, data, cookie) {
  const body = JSON.stringify(data)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...(cookie ? { 'Set-Cookie': cookie } : {}) })
  res.end(body)
}
class InputError extends Error {
  constructor(status, code) { super(code); this.status = status }
}
async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new InputError(415, 'json_required')
  const limit = 8192
  if (Number(req.headers['content-length']) > limit) throw new InputError(413, 'body_too_large')
  const chunks = []
  let size = 0
  // Leaving iteration must not destroy the socket before the error response.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length
    if (size > limit) { req.resume(); throw new InputError(413, 'body_too_large') }
    chunks.push(chunk)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error()
    return value
  } catch { throw new InputError(400, 'invalid_json') }
}
function credentials(data, registering) {
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
  const password = data.password
  const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
      typeof password !== 'string' || password.includes('\0') || password.length > 256 ||
      password.length < (registering ? 12 : 1) ||
      (registering && (!displayName || displayName.length > 80 || /[\u0000-\u001f\u007f]/.test(displayName)))) {
    throw new InputError(400, 'invalid_credentials')
  }
  return { email, password, displayName }
}
export function createAuthHandler({ store, origin, registrationEnabled = false, logger = console }) {
  const url = new URL(origin)
  if (url.origin !== origin || (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw Error('PUBLIC_ORIGIN must be an HTTPS origin or a loopback HTTP development origin')
  }
  const secure = url.protocol === 'https:'
  const name = secure ? '__Host-bricklab_session' : 'bricklab_session'
  const cookie = (token, age = lifetime) => name + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + age + (secure ? '; Secure' : '')
  function tokenFrom(req) {
    const value = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1)
    return /^[a-f0-9]{64}$/.test(value || '') ? hashToken(value) : null
  }
  function session() {
    const token = randomBytes(32).toString('hex')
    return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + lifetime * 1000) }
  }
  const attempts = new Map()
  let active = 0
  function throttle(key, limit, windowMs) {
    const now = Date.now()
    const current = attempts.get(key)
    if (current && current.until > now) {
      if (current.count >= limit) return false
      current.count++; return true
    }
    if (attempts.size >= 10000) {
      for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k)
      if (attempts.size >= 10000 && !attempts.has(key)) return false
    }
    attempts.set(key, { count: 1, until: now + windowMs })
    return true
  }
  const routes = new Map([['/api/auth/register','POST'], ['/api/auth/login','POST'], ['/api/auth/logout','POST'], ['/api/auth/me','GET']])
  return async function auth(req, res, path) {
    const method = routes.get(path)
    if (!method) return false
    try {
      if (req.method !== method) {
        res.setHeader('Allow', method)
        reply(res, 405, { error: 'method_not_allowed' }); return true
      }
      if (method === 'POST' && req.headers.origin !== origin) {
        reply(res, 403, { error: 'invalid_origin' }); return true
      }
      const previousHash = tokenFrom(req)
      if (path === '/api/auth/me') {
        const user = previousHash && await store.getSession(previousHash)
        reply(res, user ? 200 : 401, user ? { user } : { error: 'unauthenticated' })
      } else if (path === '/api/auth/logout') {
        if (previousHash) await store.deleteSession(previousHash)
        reply(res, 200, { ok: true }, cookie('', 0))
      } else {
        const register = path.endsWith('/register')
        if (register && !registrationEnabled) { reply(res, 403, { error: 'registration_disabled' }); return true }
        // Do not trust forwarded IP headers from the public Internet.
        if (!throttle('ip:' + req.socket.remoteAddress, 60, 60_000)) throw new InputError(429, 'too_many_attempts')
        const input = credentials(await readJson(req), register)
        if (!throttle('account:' + input.email, 10, 15 * 60_000) || active >= 4) throw new InputError(429, 'too_many_attempts')
        active++
        try {
          const s = session()
          let user
          if (register) {
            const passwordHash = await hashPassword(input.password)
            try {
              user = await store.register({ ...input, password: undefined, passwordHash, tokenHash: s.tokenHash, expiresAt: s.expiresAt })
            } catch (err) {
              if (err.code === '23505') throw new InputError(409, 'registration_unavailable')
              throw err
            }
          } else {
            const record = await store.findUser(input.email)
            const valid = await verifyPassword(input.password, record?.passwordHash || dummy)
            if (!record?.passwordHash || !valid) throw new InputError(401, 'invalid_login')
            const { passwordHash, ...safeUser } = record
            user = safeUser
            if(await store.createSession(user.id, s.tokenHash, s.expiresAt, previousHash,passwordHash)===false)throw new InputError(401,'invalid_login')
          }
          reply(res, register ? 201 : 200, { user: { id: user.id, email: user.email, displayName: user.displayName,...(user.admin===true?{admin:true}:{}) } }, cookie(s.token))
        } finally { active-- }
      }
    } catch (error) {
      if (error instanceof InputError) reply(res, error.status, { error: error.message })
      else { logger.error('Auth operation failed:', error.code || error.name); reply(res, 503, { error: 'auth_unavailable' }) }
    }
    return true
  }
}
