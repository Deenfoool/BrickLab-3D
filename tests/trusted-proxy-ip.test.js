import test from 'node:test'
import assert from 'node:assert/strict'
import { createClientIpResolver } from '../server/auth.js'

const request = (remoteAddress, value, distinct) => ({
  socket: { remoteAddress },
  headers: { 'x-real-ip': value, 'x-forwarded-for': '203.0.113.99' },
  ...(distinct ? { headersDistinct: { 'x-real-ip': distinct } } : {})
})

test('forwarded address is ignored by default and for untrusted peers', () => {
  assert.equal(createClientIpResolver()(request('172.18.0.1', '203.0.113.1')), '172.18.0.1')
  assert.equal(createClientIpResolver('172.18.0.1')(request('172.18.0.2', '203.0.113.1')), '172.18.0.2')
})
test('trusted proxy can identify distinct IPv4 and IPv6 visitors', () => {
  const resolve = createClientIpResolver('172.18.0.1')
  assert.equal(resolve(request('::ffff:172.18.0.1', '203.0.113.1')), '203.0.113.1')
  assert.equal(resolve(request('172.18.0.1', '203.0.113.2')), '203.0.113.2')
  assert.equal(resolve(request('172.18.0.1', '2001:0db8:0:0:0:0:0:1')), '2001:db8::1')
  assert.equal(resolve(request('172.18.0.1', '::ffff:cb00:7101')), '203.0.113.1')
})
test('missing, malformed, list or duplicate forwarded headers fall back to peer', () => {
  const resolve = createClientIpResolver('172.18.0.1')
  for (const value of [undefined, 'bad', '203.0.113.1, 203.0.113.2', ['203.0.113.1'], 'fe80::1%eth0']) {
    assert.equal(resolve(request('172.18.0.1', value)), '172.18.0.1')
  }
  assert.equal(resolve(request('172.18.0.1', '203.0.113.1', ['203.0.113.1', '203.0.113.2'])), '172.18.0.1')
})
test('invalid trusted proxy configuration is rejected', () => {
  assert.throws(() => createClientIpResolver('172.18.0.0/16'), /single IP/)
})
