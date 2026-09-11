import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Smart Assembly uses authoritative selection and one fresh cache generation', async () => {
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const activation = await readFile(new URL('../guidance/smart-assembly-activation-v1.js', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../guidance/smart-assembly-runtime-v1.js', import.meta.url), 'utf8')
  const groups = await readFile(new URL('../editor-groups-v1.js', import.meta.url), 'utf8')

  const runtimeReady = bootstrap.indexOf('window.__bricklabRuntimeReady = true')
  const activationImport = bootstrap.indexOf("./guidance/smart-assembly-activation-v1.js?v=smart-assembly-20260911-v4")
  assert.ok(runtimeReady >= 0)
  assert.ok(activationImport > runtimeReady, 'guidance activation must remain after the established editor runtime is ready')
  assert.match(bootstrap, /setTimeout\(\(\) => void startSmartAssembly\(\), 0\)/)
  assert.doesNotMatch(bootstrap, /requestIdleCallback/, 'Smart Assembly startup must not wait for browser idle time')

  const bootstrapUrls = index.match(/bootstrap\.js\?v=smart-assembly-20260911-v7/g) ?? []
  assert.equal(bootstrapUrls.length, 2, 'import map and module script must both use the same fresh bootstrap generation')
  assert.match(index, /"\.\/editor-groups-v1\.js": "\.\/editor-groups-v1\.js\?v=editor-selection-20260911-v1"/)

  assert.match(activation, /smart-assembly-runtime-v1\.js\?v=smart-assembly-20260911-v6/)
  assert.match(runtime, /assembly-compatibility-v1\.js\?v=smart-assembly-20260911-v6/)
  assert.match(groups, /bricklab:editorselectionchange/)
  assert.match(runtime, /bricklab:editorselectionchange/)
  assert.doesNotMatch(groups, /new Error\(\)\.stack|directCallerIsApp/, 'selection identity must not depend on browser stack formatting')
  assert.doesNotMatch(activation, /smart-assembly-diagnostic-v1/, 'temporary SA DIAG must be removed after root-cause repair')
})
