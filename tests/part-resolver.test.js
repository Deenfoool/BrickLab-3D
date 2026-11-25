import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePart, resolveInventoryPart, enrichInventory, normalizeDocumentDesigns, loadPartIndex } from '../src/catalog/part-resolver.js?v=catalog-engine-1'
import { mapInventory, inventoryUsage, auditInventory } from '../src/sets/data.js'

test('66906 uses the existing 6628 model with the original inventory number and colour', () => {
  const model = { design: '6628', color: '#aaaaaa' }
  const catalog = { '6628': model }
  const row = { partNum: '66906', elementId: '6360104', colorId: '4', color: '#c91a09', quantity: 1, ldraw: [] }
  const [mapped] = mapInventory([row], catalog)
  assert.equal(mapped.design, '6628')
  assert.equal(mapped.model, model)
  assert.equal(mapped.partNum, '66906')
  assert.equal(mapped.color, '#c91a09')
  assert.equal(inventoryUsage([mapped], [{ design: '6628', color: '#c91a09' }])[0].used, 1)
  assert.equal(resolvePart('66906.dat', catalog).design, '6628')
})

test('direct IDs win, catalog aliases work and incompatible or ambiguous replacements are not guessed', () => {
  const catalog = { a: { aliases: ['both', 'old'] }, b: { aliases: ['both'] }, 'old-real': {} }
  assert.equal(resolvePart('old', catalog).design, 'a')
  assert.equal(resolvePart('old-real', catalog).status, 'exact')
  assert.equal(resolvePart('both', catalog).status, 'ambiguous')
  assert.equal(resolvePart('a1', catalog).status, 'missing')
  assert.equal(resolvePart('__proto__', catalog).status, 'missing')
  assert.equal(resolveInventoryPart({ partNum: 'absent', ldraw: ['a', 'b'] }, catalog).status, 'ambiguous')
  assert.equal(resolveInventoryPart({ partNum: 'absent', ldraw: ['old'] }, catalog).design, 'a')
})

test('an exact element lookup enriches only an unresolved row with matching part and colour', async () => {
  const catalog = { a: {} }
  const rows = [{ partNum: 'external', colorId: '4', elementId: '1234567', ldraw: [] },
    { partNum: 'external', colorId: '5', elementId: '1234568', ldraw: [] }]
  const found = await enrichInventory(rows, catalog, { lookup: async () => ({ partNum: 'external', colorId: '4', ldraw: ['a'] }) })
  assert.equal(resolveInventoryPart(found[0], catalog).design, 'a')
  assert.equal(resolveInventoryPart(found[1], catalog).status, 'missing')
  assert.deepEqual(rows[0].ldraw, [])
})

test('saved documents keep part IDs, poses and connections and only normalize known aliases', () => {
  const catalog = { '6628': {}, a: {} }
  const source = { parts: [{ id: 'pin', design: '66906', position: [1, 2, 3], rotation: [0, 0, 0, 1] }, { id: 'missing', design: 'unknown' }],
    connections: [{ shaft: { part: 'pin', port: 'pin' }, socket: { part: 'missing', port: 'hole' } }] }
  const result = normalizeDocumentDesigns(source, catalog)
  assert.equal(result.parts[0].design, '6628')
  assert.equal(result.parts[0].id, 'pin')
  assert.deepEqual(result.parts[0].position, source.parts[0].position)
  assert.equal(result.parts[1].design, 'unknown')
  assert.equal(result.connections, source.connections)
  assert.equal(source.parts[0].design, '66906')
})

test('automatic index loads once and retains last valid snapshot after an invalid response', async () => {
  const catalog = { a: {} }
  let count = 0
  const fetcher = async () => { count++; return Response.json({ schema: 1, aliases: { official: 'a' } }) }
  await Promise.all([loadPartIndex({ fetcher, now: 100 }), loadPartIndex({ fetcher, now: 100 })])
  assert.equal(count, 1)
  assert.equal(resolvePart('official', catalog).design, 'a')
  await loadPartIndex({ fetcher: async () => Response.json({ schema: 1, aliases: { '../bad': 'a' } }), now: 1_000_000 })
  assert.equal(resolvePart('official', catalog).design, 'a')
})

test('coverage counts quantities, ignores spares and distinguishes uncertain replacements', () => {
  const rows = mapInventory([{partNum:'66906', quantity:3},{partNum:'6628',quantity:4},{partNum:'x',quantity:2,ldraw:['6628','a']},{partNum:'missing',quantity:5},{partNum:'6628',quantity:8,spare:true}], {'6628':{},a:{}})
  assert.deepEqual(auditInventory(rows), {exact:4,alias:3,external:0,ambiguous:2,missing:5})
})
