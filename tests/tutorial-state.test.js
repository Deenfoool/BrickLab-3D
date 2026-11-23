import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readTutorial, startTutorial, advanceTutorial, leaveTutorial, finishTutorial } from '../src/menu/tutorial-state.js'

test('tutorial progression, completion, and exit never touch saved builds', () => {
  const original = globalThis.localStorage
  const data = new Map([['bricklab.projects.v1', 'saved-user-projects']])
  globalThis.localStorage = {
    getItem(key) { return data.get(key) ?? null },
    setItem(key, value) { data.set(key, String(value)) },
    removeItem(key) { data.delete(key) },
  }
  try {
    assert.equal(readTutorial().seen, false)
    startTutorial('practice-1', 'first')
    assert.deepEqual(readTutorial().active, { mode: 'first', projectId: 'practice-1', step: 0 })
    advanceTutorial('another-project', 4)
    assert.equal(readTutorial().active.step, 0, 'cannot advance the wrong project')
    advanceTutorial('practice-1', 3)
    assert.equal(readTutorial().active.step, 3)
    // Simulate a reload: readTutorial() must recover the active lesson.
    assert.deepEqual(readTutorial().active, { mode: 'first', projectId: 'practice-1', step: 3 })
    finishTutorial('practice-1')
    assert.equal(readTutorial().active, null)
    assert.ok(readTutorial().completed.includes('first'))
    startTutorial('practice-2', 'mechanics')
    leaveTutorial('practice-2')
    assert.equal(readTutorial().active, null)
    assert.equal(data.get('bricklab.projects.v1'), 'saved-user-projects')
  } finally {
    if (original === undefined) delete globalThis.localStorage
    else globalThis.localStorage = original
  }
})
