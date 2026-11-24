import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { createBrickLabServer } from '../server/http.js'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'bricklab-http-'))
  await mkdir(join(root, 'assets'))
  await mkdir(join(root, 'src'))
  await writeFile(join(root, 'index.html'), '<h1>BrickLab</h1>')
  await writeFile(join(root, 'src', 'editor.mjs'), 'export const ready = true')
  await writeFile(join(root, 'assets', 'pack.gz'), Buffer.from([31, 139, 8, 0, 1, 2]))
  await writeFile(join(root, '.env'), 'PRIVATE=secret')
  await symlink(join(root, '.env'), join(root, 'assets', 'leak.txt'))
  const server = createBrickLabServer({ root })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    await new Promise(resolve => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })
  return { base, raw(path) {
    return new Promise((resolve, reject) => {
      const req = request(base, { path }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)) })
      req.on('error', reject); req.end()
    })
  } }
}

test('health, editor and cache revalidation', async t => {
  const { base } = await fixture(t)
  const health = await fetch(base + '/api/health')
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok', service: 'bricklab-3d' })
  const index = await fetch(base + '/')
  assert.match(index.headers.get('content-type'), /text\/html/)
  assert.equal(await index.text(), '<h1>BrickLab</h1>')
  const js = await fetch(base + '/src/editor.mjs?v=1')
  assert.match(js.headers.get('content-type'), /text\/javascript/)
  assert.equal(js.headers.get('x-content-type-options'), 'nosniff')
  await js.text()
  const cached = await fetch(base + '/src/editor.mjs', { headers: { 'If-None-Match': js.headers.get('etag') } })
  assert.equal(cached.status, 304)
  const head = await fetch(base + '/', { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
})

test('compressed assets remain raw bytes and support range requests', async t => {
  const { base } = await fixture(t)
  const pack = await fetch(base + '/assets/pack.gz')
  assert.equal(pack.headers.get('content-type'), 'application/gzip')
  assert.equal(pack.headers.get('content-encoding'), null)
  assert.deepEqual([...new Uint8Array(await pack.arrayBuffer())], [31, 139, 8, 0, 1, 2])
  const slice = await fetch(base + '/assets/pack.gz', { headers: { Range: 'bytes=1-3' } })
  assert.equal(slice.status, 206)
  assert.equal(slice.headers.get('content-range'), 'bytes 1-3/6')
  assert.deepEqual([...new Uint8Array(await slice.arrayBuffer())], [139, 8, 0])
  const invalid = await fetch(base + '/assets/pack.gz', { headers: { Range: 'bytes=9-10' } })
  assert.equal(invalid.status, 416)
})

test('private files, traversal and unknown API routes are rejected', async t => {
  const { base, raw } = await fixture(t)
  for (const path of ['/.env', '/server/index.js', '/tests/server-http.test.js', '/assets/leak.txt', '/assets/', '/missing.js']) {
    const response = await fetch(base + path)
    assert.equal(response.status, 404, path)
    await response.text()
  }
  assert.equal(await raw('/assets/%2e%2e/.env'), 400)
  assert.equal(await raw('/assets/%5c.env'), 400)
  assert.equal(await raw('/%ZZ'), 400)
  const missing = await fetch(base + '/api/missing')
  assert.equal(missing.status, 404)
  assert.deepEqual(await missing.json(), { error: 'not_found' })
  const post = await fetch(base + '/api/health', { method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET, HEAD')
  await post.text()
})
