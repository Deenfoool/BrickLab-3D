import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const text = path => readFile(new URL(path, root), 'utf8')

test('predictive LDraw loader starts before app and never blocks normal fallback', async () => {
  const bootstrap = await text('bootstrap.js')
  const preload = bootstrap.indexOf("await import('./ldraw/fast-loader-v1.js')")
  const app = bootstrap.indexOf("await import('./app.js')")
  assert.ok(preload >= 0, 'fast loader is wired into production bootstrap')
  assert.ok(app > preload, 'project/intent warming starts before app/project instantiation')
  assert.match(bootstrap,/Predictive fast loader unavailable; using normal on-demand loading/)
})

test('shared Three.js cache is enabled before any LDraw runtime can start loading', async () => {
  const [bootstrap,boost] = await Promise.all([text('bootstrap.js'),text('ldraw/cache-boost-v1.js')])
  const boostImport = bootstrap.indexOf("await import('./ldraw/cache-boost-v1.js')")
  const ldrawBootstrap = bootstrap.indexOf("await import('./ldraw/bootstrap-v1.js')")
  const preload = bootstrap.indexOf("await import('./ldraw/fast-loader-v1.js')")
  assert.ok(boostImport >= 0 && boostImport < ldrawBootstrap && ldrawBootstrap < preload,'cache boost loads before LDraw registration/preload')
  assert.match(boost,/THREE\.Cache\.enabled = true/,'Three.js FileLoader cache is enabled')
  assert.match(boost,/THREE\.Cache\.clear\(\)/,'cache remains explicitly clearable for diagnostics')
})

test('atlas-backed catalog only preloads full geometry on explicit placement intent', async () => {
  const source = await text('ldraw/fast-loader-v1.js')
  assert.doesNotMatch(source,/new IntersectionObserver/,'visible cards must not trigger full LDraw geometry loads')
  assert.doesNotMatch(source,/pointerover/,'hover must not trigger full LDraw geometry loads')
  assert.doesNotMatch(source,/focusin/,'keyboard focus must not trigger speculative geometry loads')
  assert.doesNotMatch(source,/bricklab\.ldraw\.recents\.v3/,'recent catalog history no longer cold-loads geometry')
  assert.doesNotMatch(source,/bricklab\.ldraw\.favorites\.v3/,'favorites no longer cold-load geometry')
  assert.match(source,/closest\?\.\('\[data-add\]'\)/,'+ Add starts critical preload')
  assert.match(source,/addEventListener\('dblclick'/,'double-click placement starts critical preload')
  assert.match(source,/startRegisteredWarmup\(\)/,'already registered project parts are still warmed before restore')
})

test('critical requests can bypass a saturated background queue while background work stays bounded', async () => {
  const source = await text('ldraw/fast-loader-v1.js')
  assert.match(source,/criticalConcurrency = concurrency \+ 1/)
  assert.match(source,/task\.priority >= 300 \? criticalConcurrency : concurrency/)
  assert.match(source,/backgroundStarted >= backgroundLimit/)
  assert.match(source,/navigator\.deviceMemory/,'warm budget adapts to device memory')
  assert.match(source,/connection\?\.saveData/,'data-saver disables speculative network work')
})

test('geometry workers release after prototype readiness while Connector V4 warms separately', async () => {
  const source = await text('ldraw/fast-loader-v1.js')
  const visualReady = source.indexOf('await waitForVisual(def, root)')
  const detachedV4 = source.indexOf('void startConnectorWarm(normalized, def, root)')
  assert.ok(visualReady >= 0 && detachedV4 > visualReady)
  assert.doesNotMatch(source,/await\s+startConnectorWarm\(normalized, def, root\)/,'V4 network work must not hold the geometry worker')
  assert.match(source,/disposeWarmRoot\(root\)/,'temporary preview materials are cleaned up')
})
