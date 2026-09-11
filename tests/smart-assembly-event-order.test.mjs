import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Smart Assembly starts as soon as the editor contract is bound and uses one fresh cache generation', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const activation = await readFile(new URL('../guidance/smart-assembly-activation-v1.js', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../guidance/smart-assembly-runtime-v1.js', import.meta.url), 'utf8')
  const groups = await readFile(new URL('../editor-groups-v1.js', import.meta.url), 'utf8')

  const adapter = bootstrap.indexOf("./architecture/editor-adapter-v1.js?v=architecture-20260911-v1")
  const activationImport = bootstrap.indexOf("./guidance/smart-assembly-activation-v1.js?v=smart-assembly-20260912-v1")
  const performance = bootstrap.indexOf("./performance/runtime-v1.js?v=performance-20260911-v1")
  const optionalUi = bootstrap.indexOf("./parts5/gear-mesh-ui-v1.js?v=parts-5-20260909-visual-v2")
  const runtimeReady = bootstrap.indexOf('window.__bricklabRuntimeReady = true')

  assert.ok(adapter >= 0)
  assert.ok(activationImport > adapter, 'guidance starts only after the editor adapter is bound')
  assert.ok(activationImport < performance, 'guidance must not be gated by the optional performance engine')
  assert.ok(activationImport < optionalUi, 'guidance must start before later optional UI modules')
  assert.ok(activationImport < runtimeReady, 'full runtimeReady must not gate Smart Assembly startup')
  assert.match(bootstrap, /void startSmartAssembly\(\)/, 'guidance startup must be non-blocking')
  assert.doesNotMatch(bootstrap, /requestIdleCallback/, 'Smart Assembly startup must not wait for browser idle time')

  const bootstrapUrls = index.match(/bootstrap\.js\?v=smart-assembly-20260912-v1/g) ?? []
  assert.equal(bootstrapUrls.length, 2, 'import map and module script must both use the same fresh bootstrap generation')
  assert.match(index, /"\.\/editor-groups-v1\.js": "\.\/editor-groups-v1\.js\?v=editor-selection-20260911-v1"/)

  assert.match(activation, /smart-assembly-runtime-v1\.js\?v=smart-assembly-20260911-v6/)
  assert.match(runtime, /assembly-compatibility-v1\.js\?v=smart-assembly-20260911-v6/)
  assert.match(groups, /bricklab:editorselectionchange/)
  assert.match(runtime, /bricklab:editorselectionchange/)
  assert.doesNotMatch(groups, /new Error\(\)\.stack|directCallerIsApp/, 'selection identity must not depend on browser stack formatting')
  assert.doesNotMatch(activation, /smart-assembly-diagnostic-v1/, 'temporary SA DIAG must stay out of production activation')
})
