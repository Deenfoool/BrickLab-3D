import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  validateSet,
  inventoryUsage,
  mapInventory,
  safeBook,
} from '../src/sets/data.js'
import { connectRebrickable, importSet } from '../src/sets/rebrickable.js'
import inventory from '../catalog/sets/42215-1.json' with { type: 'json' }

test('42215 inventory retains 2359 regular pieces, spares and the two instruction books', () => {
  const set = validateSet(inventory)
  assert.equal(
    set.inventory.filter((p) => !p.spare).reduce((n, p) => n + p.quantity, 0),
    2359,
  )
  assert.ok(set.inventory.some((p) => p.spare))
  assert.equal(set.books.length, 2)
  assert.equal(safeBook('javascript:alert(1)'), null)
  const withBook = validateSet({
    ...set,
    books: [...set.books, { title: 'Extra', pages: 10, url: set.books[0].url }],
  })
  assert.equal(withBook.books.length, 3)
})

test('inventory mappings count colors independently and reflect deletions without hiding missing models', () => {
  const stock = mapInventory(
    [
      { partNum: '3023', quantity: 2, color: '#05131D' },
      { partNum: '3023', quantity: 1, color: '#ffffff' },
      { partNum: 'missing', quantity: 1, color: '#ffffff' },
    ],
    { '3023b': { design: '3023b' } },
  )
  assert.equal(stock[0].design, '3023b')
  assert.equal(stock[2].model, null)
  const parts = [
    { design: '3023b', color: '#05131d' },
    { design: '3023b', color: '#ffffff' },
    { design: '3023b', color: '#ffffff' },
  ]
  assert.deepEqual(
    inventoryUsage(stock, parts).map((p) => [p.used, p.excess]),
    [
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  )
  assert.deepEqual(
    inventoryUsage(stock, parts.slice(1)).map((p) => p.used),
    [0, 1, 0],
  )
})

test('Rebrickable import follows inventory pagination and sends its key only in authorization', async () => {
  const original = globalThis.fetch
  const calls = []
  connectRebrickable('test-key')
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    if (String(url).endsWith('/sets/1-1/'))
      return {
        ok: true,
        json: async () => ({ set_num: '1-1', name: 'Test', year: 2025 }),
      }
    const second = String(url).includes('page=2')
    return {
      ok: true,
      json: async () => ({
        next: second
          ? null
          : 'https://rebrickable.com/api/v3/lego/sets/1-1/parts/?page=2',
        results: [
          {
            part: {
              part_num: second ? '2' : '1',
              name: 'Part',
              external_ids: { LDraw: ['3023b'] },
            },
            color: { id: 0, name: 'Black', rgb: '05131D' },
            quantity: 3,
            is_spare: false,
          },
        ],
      }),
    }
  }
  try {
    const set = await importSet('1-1')
    assert.equal(set.inventory.length, 2)
    assert.equal(set.inventory[0].ldraw[0], '3023b')
    assert.ok(
      calls.every(
        (c) =>
          c.options.headers.Authorization === 'key test-key' &&
          !c.url.includes('test-key'),
      ),
    )
    assert.ok(!JSON.stringify(set).includes('test-key'))
  } finally {
    globalThis.fetch = original
    connectRebrickable('')
  }
})
