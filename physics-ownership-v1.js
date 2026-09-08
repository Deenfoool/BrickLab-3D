import { PhysicsSession } from './physics.js'
import { STEP_OWNER } from './simulation-time.js'
import { PHYSICS_PIPELINE_VERSION } from './physics-pipeline-v1.js'

export const PHYSICS_OWNERSHIP_VERSION = 'physics-ownership-v1'
const JOINT_OWNER = 'joint-stability-v4'
const VEHICLE_OWNER = 'vehicle-system-v1'

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
  'updateVehicleMetrics',
  'updateVehiclePerformanceV1',
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
  if (PhysicsSession.prototype.createJoint?.__bricklabOwner !== JOINT_OWNER) {
    failures.push(`joint owner: expected ${JOINT_OWNER}, got ${PhysicsSession.prototype.createJoint?.__bricklabOwner ?? 'unknown'}`)
  }

  const tireOwner = PhysicsSession.prototype.applyTireForcesV2?.__bricklabOwner ?? ''
  if (!String(tireOwner).startsWith(VEHICLE_OWNER)) {
    failures.push(`tire owner: expected ${VEHICLE_OWNER} outer layer, got ${tireOwner || 'unknown'}`)
  }
  if (PhysicsSession.prototype.updateVehicleControlsV1?.name !== 'updateVehicleControlsV1') {
    failures.push(`steering owner: expected unified ${VEHICLE_OWNER}, got ${PhysicsSession.prototype.updateVehicleControlsV1?.name || 'missing'}`)
  }
  if (typeof PhysicsSession.prototype.initializeSuspensionJointsV1 !== 'function') {
    failures.push('suspension registry consumer missing')
  }
  if (typeof PhysicsSession.prototype.updateVehiclePerformanceV1 !== 'function') {
    failures.push('vehicle performance phase missing')
  }

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
