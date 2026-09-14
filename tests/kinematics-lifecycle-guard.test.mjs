import test from 'node:test'
import assert from 'node:assert/strict'
import { guardKinematicsRuntime, KINEMATICS_LIFECYCLE_GUARD_VERSION } from '../kinematics/lifecycle-guard-v1.js'

test('Kinematics lifecycle guard wraps a frozen runtime without Proxy invariant errors', async () => {
  let active = false
  let exits = 0
  const core = Object.freeze({
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
    reset:() => 'reset-ok',
  })

  const guarded = guardKinematicsRuntime(core)
  assert.equal(Object.isFrozen(core), true)
  assert.equal(Object.isFrozen(guarded), true)
  assert.notEqual(guarded, core)
  assert.equal(guarded.version, 'fake-core')
  assert.equal(guarded.reset(), 'reset-ok')
  assert.equal(guarded.lifecycleGuardVersion, KINEMATICS_LIFECYCLE_GUARD_VERSION)
  await assert.rejects(guarded.enter(), /analysis exploded/)
  assert.equal(active, false)
  assert.equal(exits, 1)
  assert.equal(guarded.lastRollback().reason, 'enter-failed')
})

test('Kinematics lifecycle guard gives legacy runtime a mutable V4 facade and restores frozen authority', async () => {
  const before = globalThis.BrickLabConnectorV4
  let active = false
  let runtimeTarget = null
  const frozenV4 = Object.freeze({
    marker:'authoritative',
    updateEditor:() => 'real-update',
    projectConnections:() => [],
  })
  globalThis.BrickLabConnectorV4 = frozenV4

  const core = Object.freeze({
    async enter() {
      active = true
      runtimeTarget = globalThis.BrickLabConnectorV4
      assert.equal(Object.isFrozen(runtimeTarget), false, 'legacy V4 Proxy target must be mutable')
      globalThis.BrickLabConnectorV4 = new Proxy(runtimeTarget, {
        get(target, property, receiver) {
          if (property === 'updateEditor') return () => 'suppressed-update'
          return Reflect.get(target, property, receiver)
        },
      })
      assert.equal(globalThis.BrickLabConnectorV4.updateEditor(), 'suppressed-update')
      return core
    },
    exit() {
      active = false
      globalThis.BrickLabConnectorV4 = runtimeTarget
      return core
    },
    active:() => active,
  })

  try {
    const guarded = guardKinematicsRuntime(core)
    await guarded.enter()
    assert.equal(guarded.active(), true)
    guarded.exit({ restore:true })
    assert.equal(guarded.active(), false)
    assert.strictEqual(globalThis.BrickLabConnectorV4, frozenV4)
    assert.equal(globalThis.BrickLabConnectorV4.updateEditor(), 'real-update')
  } finally {
    globalThis.BrickLabConnectorV4 = before
  }
})

test('Kinematics lifecycle guard cleans a stale enter that completes after guarded exit', async () => {
  let active = false
  let exits = 0
  let resume
  const gate = new Promise(resolve => { resume = resolve })
  const core = Object.freeze({
    async enter() {
      active = true
      await gate
      active = true
      return core
    },
    exit() {
      exits += 1
      active = false
      return core
    },
    active:() => active,
  })

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
  const core = Object.freeze({
    async enter() { active = true; return core },
    exit() { exits += 1; active = false; return core },
    active:() => active,
  })

  const guarded = guardKinematicsRuntime(core)
  await guarded.enter()
  assert.equal(guarded.active(), true)
  assert.equal(exits, 0)
  assert.equal(guarded.lastRollback(), null)
  guarded.exit({ restore:true })
  assert.equal(guarded.active(), false)
  assert.equal(exits, 1)
})
