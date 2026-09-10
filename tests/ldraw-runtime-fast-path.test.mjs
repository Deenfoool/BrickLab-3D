import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const text = path => readFile(new URL(path, root), 'utf8')

test('LDraw visual prototype no longer waits for recursive legacy connector inference', async () => {
  const source = await text('ldraw/runtime-v3.js')
  const modelLoad = source.indexOf('const modelTask = loader.loadAsync')
  const cachePublish = source.indexOf('resolvedPrototypeCache.set(normalized, payload)')
  const legacyStart = source.indexOf('void startLegacyInference(normalized, text, offset, metadata, payload)')
  assert.ok(modelLoad >= 0, 'runtime starts visual model loading directly')
  assert.ok(cachePublish > modelLoad, 'visual prototype is published after model load')
  assert.ok(legacyStart > cachePublish, 'recursive legacy inference starts only after reusable visual publication')
  assert.doesNotMatch(source,/Promise\.all\(\[\s*loader\.loadAsync[\s\S]{0,180}inferFeatures/,'legacy inference must not re-enter the visual critical path')
})

test('cold LDraw geometry and top-level metadata requests overlap instead of serializing', async () => {
  const source = await text('ldraw/runtime-v3.js')
  const textTask = source.indexOf('const textTask = fetchLDrawText(normalized)')
  const loaderTask = source.indexOf('const loaderTask = getLoader()')
  const modelTask = source.indexOf('const modelTask = loader.loadAsync')
  const join = source.indexOf('const [model, text] = await Promise.all([modelTask, textTask])')
  assert.ok(textTask >= 0 && loaderTask > textTask,'metadata and loader work start immediately')
  assert.ok(modelTask > loaderTask,'geometry begins as soon as shared loader becomes ready')
  assert.ok(join > modelTask,'geometry and metadata are joined only after both were started')
  assert.doesNotMatch(source,/const \[loader, text\] = await Promise\.all\(\[getLoader\(\), fetchLDrawText\(normalized\)\]\)/,'metadata must not delay starting geometry')
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
  const legacyStart = source.indexOf('void startLegacyInference(normalized, text, offset, metadata, payload)')
  assert.ok(legacyStart >= 0 && visualEvent > legacyStart,'visual-ready path remains independent from awaiting legacy inference')
  assert.doesNotMatch(source,/await\s+startLegacyInference\(/,'legacy connector scan must stay off the visual critical path')
})

test('predictive loader consumes direct prototype preload before instantiating its temporary V4 root', async () => {
  const source = await text('ldraw/fast-loader-v1.js')
  const direct = source.indexOf('await runtime.preload(normalized)')
  const rootCreate = source.indexOf('root = def.create(def.defaultColor)', direct)
  assert.ok(direct >= 0 && rootCreate > direct, 'network/model preload happens before temporary root creation')
  assert.match(source,/directPrototypePreloads/)
})
