import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { elementNumber, lookupElement } from '../src/editor/element-index.js'
import { mapInventory } from '../src/sets/data.js'
import { parts } from '../src/editor/parts-data.js'

test('printed numbers resolve to a colored design even without a set inventory', async t => {
  const request = t.mock.method(globalThis, 'fetch', async url => new Response(await readFile(url)))
  assert.equal(elementNumber('32009'), undefined)
  const [beam, pin] = await Promise.all(['LEGO 6271150', '4206482'].map(lookupElement))
  const records = mapInventory([beam, pin], parts)
  assert.deepEqual(records.map(item => [item.design, item.colorId]), [['32009', '14'], ['43093', '1']])
  assert.deepEqual(await lookupElement('6271150'), beam)
  assert.equal(request.mock.callCount(), 2)
  const printed = await lookupElement('6335195')
  assert.equal(printed.partNum, '32523pr0002')
  assert.match(printed.name, /Grill Print/)
})
