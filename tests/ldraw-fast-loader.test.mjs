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
  assert.ok(app > preload, 'predictive warming starts before app/project instantiation')
  assert.match(bootstrap,/Predictive fast loader unavailable; using normal on-demand loading/)
})

test('fast loader predicts visible, hovered, clicked, recent, favorite and saved-project parts', async () => {
  const source = await text('ldraw/fast-loader-v1.js')
  assert.match(source,/new IntersectionObserver/,'visible catalog cards are warmed')
  assert.match(source,/pointerover/,'hover warms the likely next part')
  assert.match(source,/pointerdown/,'click intent is promoted before the click handler')
  assert.match(source,/bricklab\.ldraw\.recents\.v3/,'recent parts are idle-warmed')
  assert.match(source,/bricklab\.ldraw\.favorites\.v3/,'favorites are idle-warmed')
  assert.match(source,/startRegisteredWarmup\(\)/,'saved-project definitions are warmed before restore')
  assert.match(source,/HOME_WARM/,'common LDraw parts are warmed in idle time')
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
