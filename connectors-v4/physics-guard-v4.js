import { PhysicsSession } from '../physics.js'

export const PHYSICS_GUARD_VERSION_V4 = 'connector-physics-guard-v4.1.0'
export const PHYSICS_GUARD_ERROR_CODE_V4 = 'BRICKLAB_CONNECTOR_V4_PHYSICS_NOT_CERTIFIED'

const marker = Symbol.for('bricklab.connectorV4.physicsGuard.v4.1')

function runtime() {
  const value = globalThis.BrickLabConnectorV4
  return value?.mode === 'hybrid-pilot' && value?.selfTest?.pass ? value : null
}

function summarize(blockers) {
  return (blockers ?? []).map(connection => ({
    id:connection.id,
    family:connection.activation?.family || connection.metadata?.activation?.family || null,
    a:{ instanceId:connection.a?.instanceId || null, partId:connection.a?.partId || null, endpointId:connection.a?.endpointId || null },
    b:{ instanceId:connection.b?.instanceId || null, partId:connection.b?.partId || null, endpointId:connection.b?.endpointId || null },
    physicsReady:Boolean(connection.physicsReady),
    physicsReason:connection.activation?.physicsReason || connection.metadata?.activation?.physicsReason || 'not-certified',
  }))
}

if (!PhysicsSession[marker]) {
  const originalCreate = PhysicsSession.create.bind(PhysicsSession)

  PhysicsSession.create = async function createWithConnectorV4PhysicsGuard(objects, connections, ...rest) {
    const v4 = runtime()
    if (v4) {
      let blockers
      try {
        blockers = v4.physicsBlockers(objects)
      } catch (error) {
        const guarded = new Error(`Connector V4 physics preflight failed: ${String(error?.message || error)}`)
        guarded.code = PHYSICS_GUARD_ERROR_CODE_V4
        guarded.cause = error
        guarded.connectorV4 = { guardVersion:PHYSICS_GUARD_VERSION_V4, reason:'preflight-error' }
        window.dispatchEvent(new CustomEvent('bricklab:connectorv4physicsblocked', {
          detail:{ guardVersion:PHYSICS_GUARD_VERSION_V4, count:1, reason:'preflight-error', error:String(error?.message || error), blockers:[] },
        }))
        throw guarded
      }

      if (blockers.length) {
        const details = summarize(blockers)
        const error = new Error(`Connector V4 has ${blockers.length} connection${blockers.length === 1 ? '' : 's'} without certified physics behavior.`)
        error.code = PHYSICS_GUARD_ERROR_CODE_V4
        error.connectorV4 = {
          guardVersion:PHYSICS_GUARD_VERSION_V4,
          reason:'uncertified-connections',
          blockers:details,
        }
        window.dispatchEvent(new CustomEvent('bricklab:connectorv4physicsblocked', {
          detail:{ guardVersion:PHYSICS_GUARD_VERSION_V4, count:blockers.length, reason:'uncertified-connections', blockers:details },
        }))
        throw error
      }
    }

    return originalCreate(objects, connections, ...rest)
  }

  Object.defineProperty(PhysicsSession, marker, {
    value:true,
    enumerable:false,
    configurable:false,
    writable:false,
  })
}

globalThis.BrickLabConnectorV4PhysicsGuard = Object.freeze({
  version:PHYSICS_GUARD_VERSION_V4,
  errorCode:PHYSICS_GUARD_ERROR_CODE_V4,
  active:true,
})
