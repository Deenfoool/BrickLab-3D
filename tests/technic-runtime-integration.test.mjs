import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('production runtime mounts the Technic semantic layer before editor mechanics are consumed', async () => {
  const architecture = await text('architecture/runtime-v1.js')
  assert.match(architecture, /technic\/runtime-v1\.js/)
})

test('Architecture and Connector V4 physics use the same Technic-aware drivetrain analyzer', async () => {
  const [architecture, guard, drivetrain] = await Promise.all([
    text('architecture/runtime-v1.js'),
    text('connectors-v4/physics-guard-v4.js'),
    text('technic/drivetrain-v1.js'),
  ])
  assert.match(architecture, /analyzeTechnicAwareDrivetrain/)
  assert.match(guard, /analyzeTechnicAwareDrivetrain/)
  assert.match(drivetrain, /connectorWorldFrameV4/)
  assert.match(drivetrain, /analyzeLegacyDrivetrain/)
  assert.match(drivetrain, /if \(!needsEnhancedAnalysis\(objects\)\) return base/)
})
