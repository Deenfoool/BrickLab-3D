import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const text = path => readFile(new URL(path, root), 'utf8')

test('LDraw visual prototype no longer waits for recursive legacy connector inference', async () => {
  const source = await text('ldraw/runtime-v3.js')
  const modelLoad = source.indexOf('const model = await loader.loadAsync')
  const cachePublish = source.indexOf('resolvedPrototypeCache.set(normalized, payload)')
  const legacyStart = source.indexOf('void startLegacyInference(normalized, text, offset, metadata, payload)')
  assert.ok(modelLoad >= 0, 'runtime loads the visual model directly')
  assert.ok(cachePublish > modelLoad, 'visual prototype is published after model load')
  assert.ok(legacyStart > cachePublish, 'recursive legacy inference starts only after reusable visual publication')
  assert.doesNotMatch(source,/Promise\.all\(\[\s*loader\.loadAsync[\s\S]{0,180}inferFeatures/,'legacy inference must not re-enter the visual critical path')
})

test('LDraw runtime exposes a direct reusable prototype preload API', async () => {
  const source = await text('ldraw/runtime-v3.js')
  assert.match(source,/export async function preloadLDrawPrototype/)
  assert.match(source,/preload:\s*preloadLDrawPrototype/)
  assert.match(source,/isPrepared:\s*isLDrawPrototypeReady/)
  assert.match(source,/resolvedPrototypeCache\.has\(normalizeFile\(file\)\)/)
})

test('legacy connector completion updates definitions asynchronously without delaying V4 visual readiness', async () => {
  const source = await text('ldraw/runtime-v3.js')
  assert.match(source,/payload\.legacyReady = inferFeatures/)
  assert.match(source,/bricklab:ldrawlegacyready/)
  const visualEvent = source.indexOf("bricklab:ldrawloaded")
  const explanation = source.indexOf('does not need to wait for the legacy primitive inference promise')
  assert.ok(explanation >= 0 && visualEvent > explanation, 'visual-ready event documents Shadow/V4 independence from legacy inference')
})

test('predictive loader consumes direct prototype preload before instantiating its temporary V4 root', async () => {
  const source = await text('ldraw/fast-loader-v1.js')
  const direct = source.indexOf('await runtime.preload(normalized)')
  const rootCreate = source.indexOf('root = def.create(def.defaultColor)', direct)
  assert.ok(direct >= 0 && rootCreate > direct, 'network/model preload happens before temporary root creation')
  assert.match(source,/directPrototypePreloads/)
})
