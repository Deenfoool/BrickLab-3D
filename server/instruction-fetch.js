import { ProxyAgent } from 'undici'

// This dispatcher belongs only to instruction requests; never set a global proxy.
export function createInstructionFetch({ proxy = '', fetcher = fetch, createAgent = options => new ProxyAgent(options) } = {}) {
  if (!proxy) return Object.assign((url, options) => fetcher(url, options), { close: async () => {} })
  let dispatcher
  try {
    const url = new URL(proxy)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.pathname !== '/' || url.search || url.hash) throw Error()
    const token = url.username || url.password
      ? `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}` : undefined
    dispatcher = createAgent({ uri: url.origin, ...(token && { token }) })
  } catch {
    // URL/agent errors can contain credentials; never expose the original error.
    throw Error('Invalid instruction proxy configuration')
  }
  return Object.assign((url, options) => fetcher(url, { ...options, dispatcher }), { close: () => dispatcher.close() })
}
