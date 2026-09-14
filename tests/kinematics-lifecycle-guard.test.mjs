import test from 'node:test'
import assert from 'node:assert/strict'
import { guardKinematicsRuntime, KINEMATICS_LIFECYCLE_GUARD_VERSION } from '../kinematics/lifecycle-guard-v1.js'

test('Kinematics lifecycle guard restores BUILD when enter throws after taking editor ownership', async () => {
  let active = false
  let exits = 0
  const core = {
    version:'fake-core',
    async enter() {
      active = true
      throw new Error('analysis exploded')
    },
    exit(options) {
      exits += 1
      assert.deepEqual(options, { restore:true })
      active = false
      return core
    },
    active:() => active,
  }

  const guarded = guardKinematicsRuntime(core)
  assert.equal(guarded.lifecycleGuardVersion, KINEMATICS_LIFECYCLE_GUARD_VERSION)
  await assert.rejects(guarded.enter(), /analysis exploded/)
  assert.equal(active, false)
  assert.equal(exits, 1)
  assert.equal(guarded.lastRollback().reason, 'enter-failed')
})

test('Kinematics lifecycle guard cleans a stale enter that completes after guarded exit', async () => {
  let active = false
  let exits = 0
  let resume
  const gate = new Promise(resolve => { resume = resolve })
  const core = {
    async enter() {
      active = true
      await gate
      // Reproduce a badly behaved late startup that tries to regain mode ownership.
      active = true
      return core
    },
    exit() {
      exits += 1
      active = false
      return core
    },
    active:() => active,
  }

  const guarded = guardKinematicsRuntime(core)
  const pending = guarded.enter()
  guarded.exit({ restore:true })
  assert.equal(active, false)
  resume()
  await pending

  assert.equal(active, false)
  assert.equal(exits, 2, 'stale completion must trigger one final rollback')
  assert.equal(guarded.lastRollback().reason, 'stale-enter-completed-after-exit')
})

test('Kinematics lifecycle guard leaves a successful active session alone', async () => {
  let active = false
  let exits = 0
  const core = {
    async enter() { active = true; return core },
    exit() { exits += 1; active = false; return core },
    active:() => active,
  }

  const guarded = guardKinematicsRuntime(core)
  await guarded.enter()
  assert.equal(guarded.active(), true)
  assert.equal(exits, 0)
  assert.equal(guarded.lastRollback(), null)
  guarded.exit({ restore:true })
  assert.equal(guarded.active(), false)
  assert.equal(exits, 1)
})
