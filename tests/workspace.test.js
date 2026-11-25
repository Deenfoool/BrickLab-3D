import test from 'node:test'
import assert from 'node:assert/strict'
import { readWorkspace } from '../src/editor/workspace.js'

test('workspace defaults keep the build library and a single dock open', () => {
  const value = readWorkspace(null)
  assert.equal(value.floating, false)
  assert.equal(value.pin, true)
  assert.equal(value.modes.build.library, true)
  assert.equal(value.modes.build.right, 'scene-parts')
  assert.equal(value.modes.kinematics.right, 'inspector')
  assert.equal(value.modes.testDrive.right, '')
  assert.equal(value.modes.paint.library, false)
})

test('instruction projects have a default instruction dock and independent floating panels', () => {
  const value = readWorkspace(null, true)
  assert.equal(value.modes.build.right, 'instruction')
  assert.deepEqual(value.modes.build.floatRight, ['inspector','scene-parts','instruction'])
  const ordinary = readWorkspace(JSON.stringify(value), false)
  assert.equal(ordinary.modes.build.right, 'scene-parts')
  assert.ok(!ordinary.modes.build.floatRight.includes('instruction'))
})

test('workspace settings survive a round trip independently for each mode', () => {
  const value = readWorkspace(null)
  value.floating = true
  value.pin = false
  value.modes.build.library = false
  value.modes.kinematics.right = ''
  value.modes.build.floatRight = ['inspector']
  value.leftWidth = 355
  assert.deepEqual(readWorkspace(JSON.stringify(value)), value)
})

test('invalid browser preferences are sanitized without blocking editor startup', () => {
  assert.deepEqual(readWorkspace('{malformed'), readWorkspace(null))
  const result = readWorkspace(JSON.stringify({
    leftWidth: 100000, rightWidth: 1, floating: 'true', pin: 'false',
    modes: { build: { library: 'no', right: 'bogus', floatRight: ['bogus', 'inspector', 'inspector'] } },
  }))
  assert.equal(result.leftWidth, 420)
  assert.equal(result.rightWidth, 220)
  assert.equal(result.floating, false)
  assert.equal(result.pin, true)
  assert.equal(result.modes.build.library, true)
  assert.equal(result.modes.build.right, 'scene-parts')
  assert.deepEqual(result.modes.build.floatRight, ['inspector'])
})
