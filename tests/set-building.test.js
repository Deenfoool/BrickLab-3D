import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  validateSet,
  inventoryUsage,
  mapInventory,
  safeBook,
} from '../src/sets/data.js'
import {
  connectRebrickable,
  importSet,
  loadSetPage,
  searchSets,
} from '../src/sets/rebrickable.js'
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

test('set catalog loads one page at a time and preserves the API continuation and abort signal', async () => {
  const original = globalThis.fetch
  const calls = []
  const controller = new AbortController()
  connectRebrickable('pagination-test')
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options })
    return {
      ok: true,
      json: async () => ({
        next:
          calls.length === 1
            ? 'https://rebrickable.com/api/v3/lego/sets/?search=technic&page=2'
            : null,
        results: [{ set_num: `${calls.length}-1`, name: 'Set', year: 2025 }],
      }),
    }
  }
  try {
    const first = await loadSetPage('technic', controller.signal)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url.searchParams.get('page_size'), '24')
    assert.equal(calls[0].url.searchParams.get('search'), 'technic')
    assert.equal(calls[0].options.signal, controller.signal)
    const second = await loadSetPage('technic', controller.signal, first.next)
    assert.equal(calls.length, 2)
    assert.equal(calls[1].url.searchParams.get('page'), '2')
    assert.equal(second.next, null)
    assert.equal(second.items[0].number, '2-1')
    assert.ok(Array.isArray(await searchSets('technic', controller.signal)))
    await assert.rejects(
      loadSetPage('', controller.signal, 'https://example.com/parts/'),
      /invalid-page/,
    )
    assert.equal(calls.length, 3)
  } finally {
    globalThis.fetch = original
    connectRebrickable('')
  }
})

test('set filters apply inclusive limits and numeric ordering to cached catalogs', async () => {
  const { filterSetItems, normalizeFilters } = await import(
    '../src/sets/filters.js'
  )
  const items = [
    { number: '10-1', name: 'Ten', year: 2020, themeId: 1, numParts: 500 },
    { number: '2-1', name: 'Two', year: 2025, themeId: 1, numParts: 150 },
    { number: '3-1', name: 'Three', year: 2025, themeId: 2, numParts: 300 },
  ]
  assert.deepEqual(
    filterSetItems(items, '', {
      themeId: 1,
      minYear: 2020,
      maxYear: 2025,
      minParts: 150,
      maxParts: 500,
      ordering: '-num_parts',
    }).map((i) => i.number),
    ['10-1', '2-1'],
  )
  assert.deepEqual(
    filterSetItems(items, '', { ordering: 'set_num' }).map((i) => i.number),
    ['2-1', '3-1', '10-1'],
  )
  assert.equal(
    filterSetItems(items, '', { minParts: 0, maxParts: 0 }).length,
    0,
  )
  assert.equal(
    filterSetItems(items, 'ten', { themeId: 1, maxParts: null }).length,
    1,
  )
  assert.equal(normalizeFilters({ minYear: 2025, maxYear: 2020 }).maxYear, 2025)
  assert.equal(validateSet(inventory).themeId, 1)
})

test('set filter requests use server parameters and preserve continuation query parameters', async () => {
  const original = globalThis.fetch
  const urls = []
  connectRebrickable('filter-test')
  globalThis.fetch = async (url) => {
    urls.push(new URL(url))
    return { ok: true, json: async () => ({ next: null, results: [] }) }
  }
  try {
    await loadSetPage('truck', undefined, undefined, {
      themeId: 1,
      minYear: 2000,
      maxYear: 2025,
      minParts: 100,
      maxParts: 500,
      ordering: '-num_parts',
    })
    assert.equal(urls[0].searchParams.get('theme_id'), '1')
    assert.equal(urls[0].searchParams.get('min_year'), '2000')
    assert.equal(urls[0].searchParams.get('max_year'), '2025')
    assert.equal(urls[0].searchParams.get('min_parts'), '100')
    assert.equal(urls[0].searchParams.get('max_parts'), '500')
    assert.equal(urls[0].searchParams.get('ordering'), '-num_parts,set_num')
    const next = new URL(urls[0])
    next.searchParams.set('page', '2')
    await loadSetPage('truck', undefined, next.href, {})
    assert.equal(urls[1].searchParams.get('max_parts'), '500')
    assert.equal(urls[1].searchParams.get('page'), '2')
    await loadSetPage('', undefined, undefined, { maxParts: null })
    assert.equal(urls[2].searchParams.has('max_parts'), false)
  } finally {
    globalThis.fetch = original
    connectRebrickable('')
  }
})

test('instruction discovery shares the archive, retries failed downloads and supports BrickLink PDFs', async () => {
  const { discoverBooks } = await import('../src/sets/instruction-sources.js')
  const { instructionState } = await import('../src/sets/instructions.js')
  const original = globalThis.fetch
  const signal = new AbortController().signal
  const pdf = (id) => `https://www.lego.com/biassets/bi/${id}.pdf`
  let archiveCalls = 0
  globalThis.fetch = async (url, options) => {
    if (
      String(url).startsWith('https://bdpinstructions.download.bricklink.info/')
    ) {
      assert.equal(options.headers.Range, 'bytes=0-1023')
      return new Response('%PDF-1.7\n1 0 obj<</Linearized 1/N 431>>', {
        status: 206,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': '1024',
        },
      })
    }
    assert.equal(url, 'https://bricks.party/brickdb.json')
    assert.equal(options.credentials, 'omit')
    if (++archiveCalls === 1) return new Response(null, { status: 503 })
    return Response.json({
      sets: [
        {
          set_num: '100-1',
          instructions: [
            {
              pdf_type: 'Instruction',
              pdf_id: '2',
              pdf_url: pdf(2),
              page_count: 20,
            },
            {
              pdf_type: 'Instruction',
              pdf_id: '1',
              pdf_url: pdf(1),
              page_count: 0,
            },
            {
              pdf_type: 'Alternative Build',
              pdf_id: '3',
              pdf_url: pdf(3),
              page_count: 10,
            },
          ],
        },
      ],
    })
  }
  try {
    const official = await discoverBooks('10307-1', signal)
    assert.match(official[1].url, /6501712\.pdf$/)
    assert.equal(archiveCalls, 0)
    await assert.rejects(
      discoverBooks('100-1', signal),
      /instruction-index-unavailable/,
    )
    const [archive, missing] = await Promise.all([
      discoverBooks('100-1', signal),
      discoverBooks('100-2', signal),
    ])
    assert.equal(archiveCalls, 2)
    assert.deepEqual(
      archive.map((book) => [book.url, book.pages, book.source]),
      [
        [pdf(1), null, 'BrickDB'],
        [pdf(2), 20, 'BrickDB'],
      ],
    )
    assert.deepEqual(missing, [])
    assert.equal(
      instructionState({
        set: { ...inventory, books: archive },
        book: 0,
        page: 113,
      }).page,
      113,
    )
    assert.equal(
      instructionState({
        set: { ...inventory, books: archive },
        book: 1,
        page: 113,
      }).page,
      20,
    )
    const [designer] = await discoverBooks('910045-1', signal)
    assert.equal(designer.pages, 431)
    assert.equal(designer.source, 'BrickLink')
    assert.equal(
      safeBook('https://bdpinstructions.download.bricklink.info/other.pdf'),
      null,
    )
  } finally {
    globalThis.fetch = original
  }
})

test('instruction previews map verified book pages and never frame official LEGO PDFs', async () => {
  const { discoverBooks, instructionPagePreview } = await import('../src/sets/instruction-sources.js')
  const signal = new AbortController().signal
  const [ford] = await discoverBooks('42223-1', signal)
  for (const [page, file] of [[1, '001.jpg'], [34, '034.jpg'], [184, '184.jpg']]) {
    const preview = instructionPagePreview('42223-1', ford.url, page)
    assert.equal(preview.image, `https://lego.brickinstructions.com/instructions/42000/42223/${file}`)
    assert.equal(preview.source, 'https://lego.brickinstructions.com/lego_instructions/set/42223')
  }
  const [first, second] = await discoverBooks('42215-1', signal)
  assert.match(instructionPagePreview('42215-1', first.url, 292).image, /\/292\.jpg$/)
  assert.match(instructionPagePreview('42215-1', second.url, 1).image, /\/293\.jpg$/)
  assert.equal(instructionPagePreview('42223-1', ford.url, 185), null)
  assert.equal(instructionPagePreview('42223-1', first.url, 1), null)
  assert.equal(instructionPagePreview('100-1', ford.url, 1), null)
  const designer = 'https://bdpinstructions.download.bricklink.info/910037.pdf'
  assert.equal(instructionPagePreview('910037-1', designer, 3).frame, `${designer}#page=3&view=FitH`)
})

test('Ford parts are tied to their verified book and normalized page locations', async () => {
  const { instructionPartRegions } = await import('../src/sets/instruction-parts.js')
  const [ford] = await (await import('../src/sets/instruction-sources.js'))
    .discoverBooks('42223-1', new AbortController().signal)
  const { instructionPagePreview } = await import('../src/sets/instruction-sources.js')
  const display = instructionPagePreview('42223-1', ford.url, 34)
  const regions = await instructionPartRegions('42223-1', display.pdfId, 34)
  assert.equal(regions.length, 6)
  assert.deepEqual(regions.map((region) => region.slice(4)), [
    ['3705', '4'], ['32034', '15'], ['32056', '0'],
    ['61332', '0'], ['32034', '15'], ['18651', '0'],
  ])
  for (const [left, top, width, height] of regions) {
    assert.ok(left >= 0 && width > 0 && left + width <= 10000)
    assert.ok(top >= 0 && height > 0 && top + height <= 10000)
  }
  assert.deepEqual(await instructionPartRegions('42223-1', display.pdfId, 1), [])
  assert.deepEqual(await instructionPartRegions('42223-1', 'wrong', 34), [])
  assert.deepEqual(await instructionPartRegions('42215-1', display.pdfId, 34), [])
})
