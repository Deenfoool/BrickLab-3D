import { PhysicsSession } from '../physics.js'
import { buildPhysicsPlanV4, PHYSICS_POLICY_VERSION_V4 } from './physics-policy-v4.js'
import { installConnectorPhysicsV4, PHYSICS_ADAPTER_VERSION_V4 } from './physics-adapter-v4.js'

export const PHYSICS_GUARD_VERSION_V4 = 'connector-physics-guard-v4.2.0'
export const PHYSICS_GUARD_ERROR_CODE_V4 = 'BRICKLAB_CONNECTOR_V4_PHYSICS_NOT_CERTIFIED'

const marker = Symbol.for('bricklab.connectorV4.physicsGuard.v4.2')
let lastPlan = null
let lastFailure = null

function rawRuntime() { return globalThis.BrickLabConnectorV4 ?? null }
function runtimeReady(v4) { return v4?.mode === 'hybrid-pilot' && v4?.selfTest?.pass === true }

function fail(reason, blockers = [], cause = null) {
  const details = blockers.map(blocker => ({
    connectionId:blocker.connectionId || null,
    family:blocker.family || null,
    reason:blocker.reason || 'not-certified',
  }))
  const error = new Error(`Connector V4 physics blocked: ${reason}${details.length ? ` (${details.length} connection${details.length===1?'':'s'})` : ''}`)
  error.code = PHYSICS_GUARD_ERROR_CODE_V4
  if (cause) error.cause = cause
  error.connectorV4 = { guardVersion:PHYSICS_GUARD_VERSION_V4, reason, blockers:details }
  lastFailure = error.connectorV4
  window.dispatchEvent(new CustomEvent('bricklab:connectorv4physicsblocked', { detail:{
    guardVersion:PHYSICS_GUARD_VERSION_V4,
    policyVersion:PHYSICS_POLICY_VERSION_V4,
    adapterVersion:PHYSICS_ADAPTER_VERSION_V4,
    count:details.length || 1,
    reason,
    blockers:details,
    error:cause ? String(cause?.message || cause) : null,
  }}))
  throw error
}

if (!PhysicsSession[marker]) {
  const originalCreate = PhysicsSession.create.bind(PhysicsSession)

  PhysicsSession.create = async function createWithCertifiedConnectorV4Physics(objects, connections, ...rest) {
    const v4 = rawRuntime()
    const v4Records = v4?.projectConnections?.() ?? []
    if (v4Records.length && !runtimeReady(v4)) fail('runtime-self-test-or-mode-not-safe')

    let plan = null
    if (runtimeReady(v4) && v4Records.length) {
      try {
        await v4.hydrateObjects?.(objects)
        v4.reconcileGraph?.(objects, { persist:false })
        const records = v4.projectConnections()
        plan = buildPhysicsPlanV4({ objects, connections:records, getConnector:(partId,endpointId)=>v4.getConnector(partId,endpointId) })
        lastPlan = plan
      } catch (error) {
        fail('preflight-error', [], error)
      }
      if (!plan.pass) fail('uncertified-connections', plan.blockers)
    }

    let session
    try {
      session = await originalCreate(objects, connections, ...rest)
      if (plan?.joints?.length) installConnectorPhysicsV4(session, plan, v4)
      lastFailure = null
      return session
    } catch (error) {
      try { session?.dispose?.() } catch {}
      if (error?.code === PHYSICS_GUARD_ERROR_CODE_V4) throw error
      if (plan?.joints?.length) fail('rapier-adapter-error', [{connectionId:null,family:null,reason:String(error?.message || error)}], error)
      throw error
    }
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
  policyVersion:PHYSICS_POLICY_VERSION_V4,
  adapterVersion:PHYSICS_ADAPTER_VERSION_V4,
  errorCode:PHYSICS_GUARD_ERROR_CODE_V4,
  active:true,
  lastPlan(){ return lastPlan },
  lastFailure(){ return lastFailure },
})
