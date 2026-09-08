import { PhysicsSession } from './physics.js'
import { STEP_OWNER } from './simulation-time.js'
import { PHYSICS_PIPELINE_VERSION } from './physics-pipeline-v1.js'

export const PHYSICS_OWNERSHIP_VERSION = 'physics-ownership-v1'

const METHODS = [
  'build',
  'createCompoundBody',
  'createJoint',
  'step',
  'syncObjects',
  'resetCustomTorques',
  'applyMotorTorques',
  'updateSuspensionV2',
  'updateVehicleControlsV1',
  'applyGearCouplingTorques',
  'applyTireForcesV2',
  'applyScenarioForcesV2',
  'validatePhysicsState',
]

function methodInfo(name) {
  const fn = PhysicsSession.prototype[name]
  return {
    name,
    installed: typeof fn === 'function',
    owner: fn?.__bricklabOwner ?? fn?.name ?? null,
  }
}

export function getPhysicsOwnershipSnapshot() {
  return {
    version: PHYSICS_OWNERSHIP_VERSION,
    pipeline: globalThis.BrickLabPhysicsPipeline?.version ?? null,
    methods: METHODS.map(methodInfo),
  }
}

export function assertPhysicsRuntimeContract() {
  const failures = []
  if (PhysicsSession.prototype.step?.__bricklabOwner !== STEP_OWNER) {
    failures.push(`step owner: expected ${STEP_OWNER}, got ${PhysicsSession.prototype.step?.__bricklabOwner ?? 'unknown'}`)
  }
  if (globalThis.BrickLabPhysicsPipeline?.version !== PHYSICS_PIPELINE_VERSION) {
    failures.push(`pipeline: expected ${PHYSICS_PIPELINE_VERSION}, got ${globalThis.BrickLabPhysicsPipeline?.version ?? 'missing'}`)
  }
  const tireOwner = PhysicsSession.prototype.applyTireForcesV2?.__bricklabOwner ?? ''
  if (!String(tireOwner).startsWith('vehicle-system-v1')) {
    failures.push(`tire owner: expected vehicle-system-v1 outer layer, got ${tireOwner || 'unknown'}`)
  }
  if (typeof PhysicsSession.prototype.updateVehicleControlsV1 !== 'function') failures.push('vehicle control phase missing')

  const snapshot = getPhysicsOwnershipSnapshot()
  globalThis.__bricklabPhysicsOwnership = { ...snapshot, failures: [...failures] }
  if (failures.length) throw new Error(`Physics ownership contract failed: ${failures.join('; ')}`)
  return snapshot
}

globalThis.BrickLabPhysicsOwnership = {
  version: PHYSICS_OWNERSHIP_VERSION,
  snapshot: getPhysicsOwnershipSnapshot,
  assert: assertPhysicsRuntimeContract,
}
