import { MECHANICS_NEXT_VERSION } from './core/model.js'
import { createOwnershipLedger } from './core/ownership.js'
import { createAssemblyGraph } from './topology/assembly-graph.js'
import { createKinematicSolver } from './solver/kinematic-solver.js'
import { assertLegacyReadOnly, snapshotLegacyV4 } from './adapters/legacy-v4-readonly.js'

export const MECHANICS_NEXT_RUNTIME_MODE = 'observe-only'

export function createMechanicsNextRuntime({
  globals = globalThis,
  legacyProvider = globals.BrickLabConnectorV4,
} = {}) {
  const ownership = createOwnershipLedger()
  const graph = createAssemblyGraph()
  const solver = createKinematicSolver()
  let legacySnapshot = snapshotLegacyV4(legacyProvider)

  const refreshLegacySnapshot = () => {
    legacySnapshot = snapshotLegacyV4(legacyProvider || globals.BrickLabConnectorV4)
    assertLegacyReadOnly(legacySnapshot)
    return legacySnapshot
  }

  const api = Object.freeze({
    version:MECHANICS_NEXT_VERSION,
    mode:MECHANICS_NEXT_RUNTIME_MODE,
    ownership,
    graph,
    solver,
    refreshLegacySnapshot,
    legacySnapshot:() => legacySnapshot,
    status() {
      return Object.freeze({
        version:MECHANICS_NEXT_VERSION,
        mode:MECHANICS_NEXT_RUNTIME_MODE,
        ownsProductionDomains:false,
        graphRevision:graph.revision,
        graphBodies:graph.size,
        solverRevision:solver.revision,
        legacyAvailable:legacySnapshot.available,
        legacySystemVersion:legacySnapshot.systemVersion,
        legacyConnections:legacySnapshot.connections.length,
        ownership:ownership.snapshot(),
      })
    },
  })

  const refresh = () => {
    try { refreshLegacySnapshot() }
    catch (error) { console.warn('[BrickLab Mechanics Next] Legacy observation refresh failed.', error) }
  }

  for (const eventName of [
    'bricklab:connectorv4runtime',
    'bricklab:connectorv4reconcile',
    'bricklab:connectorv4',
  ]) globals.addEventListener?.(eventName, refresh)

  globals.BrickLabMechanicsNext = api
  globals.dispatchEvent?.(new CustomEvent('bricklab:mechanicsnextready', {
    detail:api.status(),
  }))
  return api
}

const installed = globalThis.BrickLabMechanicsNext
export const BrickLabMechanicsNext = installed?.version === MECHANICS_NEXT_VERSION
  ? installed
  : createMechanicsNextRuntime()
