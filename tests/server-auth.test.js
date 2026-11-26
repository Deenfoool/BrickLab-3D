import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createBrickLabServer } from '../server/http.js'
import { createAuthHandler, hashPassword, verifyPassword } from '../server/auth.js'

function memoryStore() {
  const users = new Map(), sessions = new Map()
  return {
    users, sessions,
    async register(input) {
      if (users.has(input.email)) throw Object.assign(Error('duplicate'), { code: '23505' })
      const user = { id: randomUUID(), email: input.email, displayName: input.displayName, passwordHash: input.passwordHash }
      users.set(input.email, user)
      sessions.set(input.tokenHash, { user, expiresAt: input.expiresAt })
      return user
    },
    async findUser(email) { return users.get(email) },
    async createSession(id, hash, expiresAt, old) {
      if (old) sessions.delete(old)
      sessions.set(hash, { user: [...users.values()].find(u => u.id === id), expiresAt })
    },
    async getSession(hash) {
      const entry = sessions.get(hash)
      if (!entry || entry.expiresAt <= new Date()) return
      const { passwordHash, ...safe } = entry.user
      return safe
    },
    async deleteSession(hash) { sessions.delete(hash) },
  }
}
async function fixture(t, store, registrationEnabled = true) {
  const root = await mkdtemp(join(tmpdir(), 'bricklab-auth-'))
  const origin = 'https://bricklab.example'
  const server = createBrickLabServer({ root, auth: createAuthHandler({ store, origin, registrationEnabled }) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })
  return (path, { method = 'POST', body, cookie, from = origin } = {}) =>
    fetch(base + '/api/auth/' + path, {
      method, headers: { Origin: from, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
}
const password = 'a-long-test-passphrase'
const extractCookie = response => response.headers.get('set-cookie').split(';')[0]

test('password hashes are salted and do not expose the password', async () => {
  const a = await hashPassword(password), b = await hashPassword(password)
  assert.notEqual(a, b)
  assert.ok(!a.includes(password))
  assert.equal(await verifyPassword(password, a), true)
  assert.equal(await verifyPassword('incorrect', a), false)
  assert.equal(await verifyPassword(password, 'malformed'), false)
})

async function exercise(t, store, email) {
  const api = await fixture(t, store)
  let r = await api('register', { body: { email, displayName: 'Builder', password } })
  assert.equal(r.status, 201)
  const header = r.headers.get('set-cookie')
  for (const flag of ['__Host-bricklab_session=', 'HttpOnly', 'SameSite=Lax', 'Secure', 'Path=/']) assert.ok(header.includes(flag))
  const first = extractCookie(r)
  const registered = await r.json()
  assert.equal(registered.user.email, email.toLowerCase())
  assert.deepEqual(Object.keys(registered.user).sort(), registered.user.username?['displayName','email','id','username']:['displayName','email','id'])
  assert.equal((await api('me', { method: 'GET' })).status, 401)
  r = await api('me', { method: 'GET', cookie: first })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), registered)
  assert.equal((await api('login', { body: { email, password: 'wrong' } })).status, 401)
  assert.equal((await api('register', { body: { email, displayName: 'Other', password } })).status, 409)
  assert.equal((await api('logout', { cookie: first, from: 'https://evil.example' })).status, 403)
  r = await api('login', { body: { email, password }, cookie: first })
  assert.equal(r.status, 200)
  const second = extractCookie(r)
  assert.notEqual(first, second)
  assert.equal((await api('me', { method: 'GET', cookie: first })).status, 401)
  assert.equal((await api('me', { method: 'GET', cookie: second })).status, 200)
  r = await api('logout', { cookie: second })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await api('me', { method: 'GET', cookie: second })).status, 401)
  return registered.user.id
}

test('authentication lifecycle, cookie flags, session rotation and CSRF', async t => {
  const store = memoryStore()
  await exercise(t, store, 'TEST@example.invalid')
  assert.equal(store.sessions.size, 0)
  assert.ok(store.users.get('test@example.invalid').passwordHash.startsWith('scrypt$'))
})

test('registration disabled and malformed requests rejected', async t => {
  const api = await fixture(t, memoryStore(), false)
  assert.equal((await api('register', { body: { email: 'x@example.invalid', password, displayName: 'X' } })).status, 403)
  assert.equal((await api('login', { body: { email: 'invalid!', password } })).status, 400)
  assert.equal((await api('login', { body: { email: 'x@example.invalid', password: 'x'.repeat(9000) } })).status, 413)
  assert.equal((await api('login', { body: { email: 'x@example.invalid', password }, from: 'https://evil.example' })).status, 403)
  assert.equal((await api('login', { method: 'GET' })).status, 405)
})

test('authentication lifecycle with actual PostgreSQL runtime role', { skip: process.env.BRICKLAB_TEST_DB !== 'true' }, async t => {
  const { connectAuthStore } = await import('../server/db/auth-store.js')
  const store = connectAuthStore()
  t.after(() => store.close())
  await store.ready()
  await exercise(t, store, randomUUID() + '@example.invalid')
})
