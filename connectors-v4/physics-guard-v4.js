import { PhysicsSession } from '../physics.js'
import { analyzeDrivetrain } from '../drivetrain.js'
import { buildPhysicsPlanV4, drivetrainSemanticLinksV4, PHYSICS_POLICY_VERSION_V4 } from './physics-policy-v4.js'
import { hardenPhysicsPlanV4, PHYSICS_PLAN_SAFETY_VERSION_V4 } from './physics-plan-safety-v4.js'
import { installConnectorPhysicsV4, PHYSICS_ADAPTER_VERSION_V4 } from './physics-adapter-v4.js'

export const PHYSICS_GUARD_VERSION_V4 = 'connector-physics-guard-v4.5.0'
export const PHYSICS_GUARD_ERROR_CODE_V4 = 'BRICKLAB_CONNECTOR_V4_PHYSICS_NOT_CERTIFIED'

const marker = Symbol.for('bricklab.connectorV4.physicsGuard.v4.5')
let lastPlan = null
let lastFailure = null

function rawRuntime() { return globalThis.BrickLabConnectorV4 ?? null }
function runtimeReady(v4) { return v4?.mode === 'hybrid-pilot' && v4?.selfTest?.pass === true }

function releasedConnectionIds(session) {
  return new Set((session?.connectorV4Physics?.releaseEvents ?? []).flatMap(event => event.connectionIds ?? []))
}

function rebuildDrivetrainSemanticsV4(session, records) {
  const links = drivetrainSemanticLinksV4(records, releasedConnectionIds(session))
  const previouslyBridged = Boolean(session.connectorV4Drivetrain?.enabled)
  if (!links.length && !previouslyBridged) return null

  const semanticConnections = [...session.connections, ...links]
  session.drivetrain = analyzeDrivetrain(session.objects, semanticConnections)
  session.buildGearCouplers?.()
  session.buildShaftMonitors?.()
  session.buildWheelMonitors?.()
  session.removeTelemetry?.()
  session.mountTelemetry?.()
  session.connectorV4Drivetrain = {
    enabled:true,
    policyVersion:PHYSICS_POLICY_VERSION_V4,
    activeLinks:links.length,
    connectionIds:links.map(link => link.metadata.v4ConnectionId),
    released:[...releasedConnectionIds(session)],
  }
  return session.connectorV4Drivetrain
}

function fail(reason, blockers = [], cause = null) {
  const details = blockers.map(blocker => ({
    connectionId:blocker.connectionId || null,
    family:blocker.family || null,
    reason:blocker.reason || 'not-certified',
  }))
  const error = new Error(`Connector V4 physics blocked: ${reason}${details.length ? ` (${details.length} connection${details.length===1?'':'s'})` : ''}`)
  error.code = PHYSICS_GUARD_ERROR_CODE_V4
  if (cause) error.cause = cause
  error.connectorV4 = { guardVersion:PHYSICS_GUARD_VERSION_V4, safetyVersion:PHYSICS_PLAN_SAFETY_VERSION_V4, reason, blockers:details }
  lastFailure = error.connectorV4
  window.dispatchEvent(new CustomEvent('bricklab:connectorv4physicsblocked', { detail:{
    guardVersion:PHYSICS_GUARD_VERSION_V4,
    safetyVersion:PHYSICS_PLAN_SAFETY_VERSION_V4,
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
    // Diagnostics must describe this invocation, not the previous project's plan.
    lastPlan = null
    const v4 = rawRuntime()
    const initialV4Records = v4?.projectConnections?.() ?? []
    if (initialV4Records.length && !runtimeReady(v4)) fail('runtime-self-test-or-mode-not-safe')

    let plan = null
    let liveV4Records = initialV4Records
    if (runtimeReady(v4) && initialV4Records.length) {
      try {
        await v4.hydrateObjects?.(objects)
        v4.reconcileGraph?.(objects, { persist:false })
        liveV4Records = v4.projectConnections()
        const proposed = buildPhysicsPlanV4({ objects, connections:liveV4Records, getConnector:(partId,endpointId)=>v4.getConnector(partId,endpointId) })
        plan = hardenPhysicsPlanV4(proposed)
        lastPlan = plan
      } catch (error) {
        fail('preflight-error', [], error)
      }
      if (!plan.pass) fail('uncertified-connections', plan.blockers)
    }

    window.dispatchEvent(new CustomEvent('bricklab:connectorv4physicsstarting', {detail:{
      guardVersion:PHYSICS_GUARD_VERSION_V4,
      safetyVersion:PHYSICS_PLAN_SAFETY_VERSION_V4,
      connections:liveV4Records.length,
      plannedJoints:plan?.joints?.length ?? 0,
    }}))

    let session
    try {
      session = await originalCreate(objects, connections, ...rest)
      if (plan?.joints?.length) {
        session.rebuildConnectorV4Drivetrain = () => rebuildDrivetrainSemanticsV4(session, liveV4Records)
        installConnectorPhysicsV4(session, plan, v4)
        rebuildDrivetrainSemanticsV4(session, liveV4Records)
      }
      lastFailure = null
      return session
    } catch (error) {
      try { session?.dispose?.() } catch {}
      if (error?.code === PHYSICS_GUARD_ERROR_CODE_V4) throw error
      if (plan?.joints?.length) fail('v4-session-integration-error', [{connectionId:null,family:null,reason:String(error?.message || error)}], error)
      throw error
    }
  }
  Object.defineProperty(PhysicsSession.create, '__bricklabOwner', {
    value:PHYSICS_GUARD_VERSION_V4,
    enumerable:false,
    configurable:false,
    writable:false,
  })

  Object.defineProperty(PhysicsSession, marker, {
    value:true,
    enumerable:false,
    configurable:false,
    writable:false,
  })
}

globalThis.BrickLabConnectorV4PhysicsGuard = Object.freeze({
  version:PHYSICS_GUARD_VERSION_V4,
  safetyVersion:PHYSICS_PLAN_SAFETY_VERSION_V4,
  policyVersion:PHYSICS_POLICY_VERSION_V4,
  adapterVersion:PHYSICS_ADAPTER_VERSION_V4,
  errorCode:PHYSICS_GUARD_ERROR_CODE_V4,
  active:true,
  createOwner:PhysicsSession.create?.__bricklabOwner ?? null,
  lastPlan(){ return lastPlan },
  lastFailure(){ return lastFailure },
})
