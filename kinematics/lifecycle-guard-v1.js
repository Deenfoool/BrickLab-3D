export const KINEMATICS_LIFECYCLE_GUARD_VERSION = 'kinematics-lifecycle-guard-v1.1.0'

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

function mutableFacade(source) {
  const facade = {}
  for (const key of Reflect.ownKeys(source ?? {})) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key)
    Object.defineProperty(facade, key, {
      value:source[key],
      enumerable:descriptor?.enumerable ?? true,
      writable:true,
      configurable:true,
    })
  }
  return facade
}

function cloneRecords(records) {
  if (!Array.isArray(records)) return []
  if (typeof structuredClone === 'function') return structuredClone(records)
  return JSON.parse(JSON.stringify(records))
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
  let originalV4Global = null
  let compatibleV4Global = null
  let connectionSnapshot = null
  let restoreConnectionsOnExit = true
  let lastConnectionRestoreError = null

  function connectorAuthority() {
    return originalV4Global ?? globalThis.BrickLabConnectorV4 ?? null
  }

  function captureConnectionSnapshot() {
    const runtime = connectorAuthority()
    connectionSnapshot = typeof runtime?.projectConnections === 'function'
      ? cloneRecords(runtime.projectConnections())
      : null
    lastConnectionRestoreError = null
  }

  function restoreConnectionSnapshot() {
    if (!restoreConnectionsOnExit || !Array.isArray(connectionSnapshot)) return false
    const runtime = connectorAuthority()
    if (typeof runtime?.restoreConnections !== 'function') return false
    try {
      runtime.restoreConnections(cloneRecords(connectionSnapshot), { replace:true })
      lastConnectionRestoreError = null
      return true
    } catch (error) {
      lastConnectionRestoreError = String(error?.message || error)
      console.error?.('[BrickLab Kinematics] Could not restore Connector V4 graph after preview', error)
      return false
    }
  }

  function clearConnectionSnapshot() {
    connectionSnapshot = null
    restoreConnectionsOnExit = true
  }

  function prepareConnectorV4Compatibility() {
    if (originalV4Global) return
    const current = globalThis.BrickLabConnectorV4
    if (!current || !Object.isFrozen(current)) return
    originalV4Global = current
    compatibleV4Global = mutableFacade(current)
    globalThis.BrickLabConnectorV4 = compatibleV4Global
  }

  function restoreConnectorV4Compatibility() {
    if (!originalV4Global) return
    // The legacy Kinematics runtime restores the exact object it saw on entry. Only
    // swap the authoritative frozen API back once that temporary facade is visible.
    if (globalThis.BrickLabConnectorV4 === compatibleV4Global || !core.active()) {
      globalThis.BrickLabConnectorV4 = originalV4Global
      originalV4Global = null
      compatibleV4Global = null
    }
  }

  function finalizeSession({ restoreConnections = true } = {}) {
    restoreConnectionsOnExit = restoreConnections
    restoreConnectionSnapshot()
    clearConnectionSnapshot()
    restoreConnectorV4Compatibility()
  }

  function rollback(reason, error = null) {
    let rollbackError = null
    restoreConnectionsOnExit = true
    try {
      core.exit({ restore:true })
    } catch (cause) {
      rollbackError = cause
      console.error?.('[BrickLab Kinematics] Editor rollback failed', cause)
    } finally {
      finalizeSession({ restoreConnections:true })
    }
    lastRollback = {
      reason,
      error:error ? String(error?.message || error) : null,
      rollbackError:rollbackError ? String(rollbackError?.message || rollbackError) : null,
      connectionRestoreError:lastConnectionRestoreError,
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
    restoreConnectionsOnExit = true
    prepareConnectorV4Compatibility()
    captureConnectionSnapshot()
    try {
      await core.enter(...args)
      if (token !== epoch && core.active()) rollback('stale-enter-completed-after-exit')
      return guarded
    } catch (error) {
      rollback('enter-failed', error)
      throw error
    } finally {
      if (token === epoch) entering = false
      if (!core.active() && connectionSnapshot) finalizeSession({ restoreConnections:true })
      else if (!core.active()) restoreConnectorV4Compatibility()
    }
  }

  function exit(options = { restore:true }) {
    epoch += 1
    entering = false
    restoreConnectionsOnExit = options?.restore !== false
    try {
      core.exit(options)
    } finally {
      finalizeSession({ restoreConnections:restoreConnectionsOnExit })
    }
    return guarded
  }

  function legacyExit() {
    // Mode-button/Escape/Tab exits happen inside the legacy runtime and bypass the
    // guarded facade. Kinematics is a preview: restore the entry graph transaction
    // before handing control back to BUILD/SIMULATE.
    finalizeSession({ restoreConnections:restoreConnectionsOnExit })
  }

  guarded = frozenFacade(core, {
    [guardedMarker]:true,
    enter,
    exit,
    lifecycleGuardVersion:KINEMATICS_LIFECYCLE_GUARD_VERSION,
    lastRollback:() => lastRollback,
    lastConnectionRestoreError:() => lastConnectionRestoreError,
  })

  globalThis.addEventListener?.('bricklab:kinematicsexit', legacyExit)
  return guarded
}
