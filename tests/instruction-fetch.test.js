import test from 'node:test'
import assert from 'node:assert/strict'
import { createInstructionFetch } from '../server/instruction-fetch.js'

test('instruction proxy authentication stays on its private dispatcher', async () => {
  const dispatcher = { async close() { closed = true } }
  let closed = false, agentOptions, sent
  const fetcher = createInstructionFetch({
    proxy: 'http://example%40user:test%3Apassword@proxy.example:8000',
    createAgent: options => { agentOptions = options; return dispatcher },
    fetcher: async (...args) => { sent = args; return new Response('ok') },
  })
  const options = { headers: { Range: 'bytes=0-63' }, signal: new AbortController().signal }
  await fetcher('https://www.lego.com/test.pdf', options)
  assert.equal(agentOptions.uri, 'http://proxy.example:8000')
  assert.equal(agentOptions.token, 'Basic '+Buffer.from('example@user:test:password').toString('base64'))
  assert.equal(sent[1].dispatcher, dispatcher)
  assert.deepEqual(sent[1].headers, options.headers)
  assert.equal(sent[1].signal, options.signal)
  assert.equal(options.dispatcher, undefined)
  await fetcher.close(); assert.ok(closed)
})

test('direct mode preserves normal requests and malformed proxy errors contain no credentials', async () => {
  const options = { headers: { Accept: 'application/pdf' } }
  const fetcher = createInstructionFetch({ fetcher: async (url, value) => { assert.equal(value, options); return new Response('ok') } })
  await fetcher('https://www.lego.com/test.pdf', options)
  await fetcher.close()
  for (const proxy of ['not-a-url', 'socks5://user:private@proxy.example:8000', 'http://user:private@proxy.example/path']) {
    assert.throws(() => createInstructionFetch({ proxy }), error => error.message === 'Invalid instruction proxy configuration' && !error.cause)
  }
})
