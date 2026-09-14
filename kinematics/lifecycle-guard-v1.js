export const KINEMATICS_LIFECYCLE_GUARD_VERSION = 'kinematics-lifecycle-guard-v1.0.1'

const guardedMarker = Symbol.for('bricklab.kinematics.lifecycle-guard.v1')

function frozenFacade(core, overrides) {
  const facade = {}
  for (const key of Reflect.ownKeys(core)) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) continue
    const descriptor = Object.getOwnPropertyDescriptor(core, key)
    Object.defineProperty(facade, key, {
      value:core[key],
      enumerable:descriptor?.enumerable ?? true,
      writable:false,
      configurable:false,
    })
  }
  for (const key of Reflect.ownKeys(overrides)) {
    Object.defineProperty(facade, key, {
      value:overrides[key],
      enumerable:typeof key === 'string',
      writable:false,
      configurable:false,
    })
  }
  return Object.freeze(facade)
}

export function guardKinematicsRuntime(core) {
  if (!core || typeof core.enter !== 'function' || typeof core.exit !== 'function' || typeof core.active !== 'function') {
    throw new TypeError('Kinematics lifecycle guard requires enter/exit/active runtime methods')
  }
  if (core[guardedMarker]) return core

  let epoch = 0
  let entering = false
  let lastRollback = null
  let guarded = null

  function rollback(reason, error = null) {
    let rollbackError = null
    try {
      core.exit({ restore:true })
    } catch (cause) {
      rollbackError = cause
      console.error?.('[BrickLab Kinematics] Editor rollback failed', cause)
    }
    lastRollback = {
      reason,
      error:error ? String(error?.message || error) : null,
      rollbackError:rollbackError ? String(rollbackError?.message || rollbackError) : null,
    }
    if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
      globalThis.dispatchEvent(new CustomEvent('bricklab:kinematicsrollback', {
        detail:{ version:KINEMATICS_LIFECYCLE_GUARD_VERSION, ...lastRollback },
      }))
    }
  }

  async function enter(...args) {
    if (entering) return guarded
    const token = ++epoch
    entering = true
    try {
      await core.enter(...args)
      if (token !== epoch && core.active()) rollback('stale-enter-completed-after-exit')
      return guarded
    } catch (error) {
      rollback('enter-failed', error)
      throw error
    } finally {
      if (token === epoch) entering = false
    }
  }

  function exit(options = { restore:true }) {
    epoch += 1
    entering = false
    core.exit(options)
    return guarded
  }

  guarded = frozenFacade(core, {
    [guardedMarker]:true,
    enter,
    exit,
    lifecycleGuardVersion:KINEMATICS_LIFECYCLE_GUARD_VERSION,
    lastRollback:() => lastRollback,
  })
  return guarded
}
