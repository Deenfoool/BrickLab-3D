import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Connector V4 inspector sync reads authoritative V4 graph instead of legacy-only connection counts', async () => {
  const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const sync = await readFile(new URL('../connectors-v4/inspector-sync-v4.js', import.meta.url), 'utf8')

  assert.match(bootstrap, /inspector-sync-v4\.js\?v=connector-inspector-20260912-v1/)
  assert.equal((index.match(/bootstrap\.js\?v=connector-inspector-20260912-v1/g) ?? []).length, 2)

  assert.match(sync, /projectConnections\(\)/, 'Inspector must read the authoritative V4 graph')
  assert.match(sync, /connectivity = v4\.get\?\.\(partId\)/, 'Inspector must use V4 endpoint metadata for connector totals')
  assert.match(sync, /occupiedEndpointIds\.size/, 'Occupied count must be based on unique V4 endpoint IDs')
  assert.match(sync, /state\.legacyCount \+ links\.length/, 'Legacy and V4 graph links must coexist in the Inspector')
  assert.match(sync, /connector-v4-chip/, 'V4 links must be visible in the graph-link list')
  assert.match(sync, /disconnectButton\.disabled/, 'V4-only links must enable Disconnect all')
  assert.match(sync, /MutationObserver/, 'Legacy app Inspector rewrites must be re-synchronized without polling')
  assert.doesNotMatch(sync, /setInterval/, 'Inspector sync must remain event-driven')
})
