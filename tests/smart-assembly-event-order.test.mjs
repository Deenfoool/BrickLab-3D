import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Smart Assembly evaluates after catalog click has selected the inserted part', async () => {
  const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const activation = await readFile(new URL('../guidance/smart-assembly-activation-v1.js', import.meta.url), 'utf8')
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8')

  const runtimeReady = bootstrap.indexOf('window.__bricklabRuntimeReady = true')
  const activationImport = bootstrap.indexOf("./guidance/smart-assembly-activation-v1.js?v=smart-assembly-20260911-v1")
  assert.ok(runtimeReady >= 0)
  assert.ok(activationImport > runtimeReady, 'guidance activation must remain after the established editor runtime is ready')
  assert.match(bootstrap, /setTimeout\?\.\(\(\) => void startSmartAssembly\(\), 0\)/)
  assert.doesNotMatch(bootstrap, /requestIdleCallback/, 'Smart Assembly startup must not wait indefinitely for browser idle time')

  assert.match(app, /button\.onclick = \(\) => addPart\(button\.dataset\.part\)/, 'catalog insertion is performed by the button click handler')
  assert.match(activation, /addEventListener\('click', handler, false\)/, 'activation observes the bubble-phase click after the catalog handler')
  assert.match(activation, /enqueue\(\(\) => globalThis\.BrickLabSmartAssembly\?\.evaluate\?\.\(\)\)/, 'evaluation is deferred until after click handlers complete')
  assert.match(activation, /smart-assembly-runtime-v1\.js\?v=smart-assembly-20260911-v3/, 'activation must request the fresh runtime generation')
})
