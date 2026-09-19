import { PhysicsSession } from './physics.js'
import { STEP_OWNER } from './simulation-time.js'
import { PHYSICS_PIPELINE_VERSION } from './physics-pipeline-v1.js'

export const PHYSICS_OWNERSHIP_VERSION = 'physics-ownership-v7'
const VEHICLE_OWNER = 'vehicle-system-v1'
const DRIVE_OWNER = 'vehicle-drive-v2'

const METHODS = [
  'build',
  'createCompoundBody',
  'step',
  'syncObjects',
  'resetCustomTorques',
  'buildChassisMonitor',
  'updateVehicleControlsV1',
  'updateVehicleDriveV2',
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
    create: {
      installed: typeof PhysicsSession.create === 'function',
      owner: PhysicsSession.create?.__bricklabOwner ?? PhysicsSession.create?.name ?? null,
      expected: globalThis.BrickLabMechanicsNextPhysicsOwner?.version ?? null,
    },
    methods: METHODS.map(methodInfo),
  }
}

export function assertPhysicsRuntimeContract() {
  const failures = []
  const expectedCreateOwner = globalThis.BrickLabMechanicsNextPhysicsOwner?.version ?? null
  if (expectedCreateOwner && PhysicsSession.create?.__bricklabOwner !== expectedCreateOwner) {
    failures.push(`create owner: expected ${expectedCreateOwner}, got ${PhysicsSession.create?.__bricklabOwner ?? PhysicsSession.create?.name ?? 'unknown'}`)
  }
  if (PhysicsSession.prototype.step?.__bricklabOwner !== STEP_OWNER) {
    failures.push(`step owner: expected ${STEP_OWNER}, got ${PhysicsSession.prototype.step?.__bricklabOwner ?? 'unknown'}`)
  }
  if (globalThis.BrickLabPhysicsPipeline?.version !== PHYSICS_PIPELINE_VERSION) {
    failures.push(`pipeline: expected ${PHYSICS_PIPELINE_VERSION}, got ${globalThis.BrickLabPhysicsPipeline?.version ?? 'missing'}`)
  }
  for(const name of ['createJoint','applyMotorTorques','applyGearCouplingTorques','updateSuspensionV2','initializeParts4LinearMechanisms','initializeSuspensionJointsV1']){
    if(PhysicsSession.prototype[name]?.__mechanicsNextBypass===true){
      failures.push(`retired legacy writer re-entered production: ${name}`)
    }
  }
  const tireOwner = PhysicsSession.prototype.applyTireForcesV2?.__bricklabOwner ?? ''
  if (!String(tireOwner).startsWith(VEHICLE_OWNER)) {
    failures.push(`tire owner: expected ${VEHICLE_OWNER} outer layer, got ${tireOwner || 'unknown'}`)
  }
  if (!String(PhysicsSession.prototype.updateVehicleControlsV1?.__bricklabOwner ?? '').startsWith(VEHICLE_OWNER)) {
    failures.push(`steering input owner: expected ${VEHICLE_OWNER}, got ${PhysicsSession.prototype.updateVehicleControlsV1?.__bricklabOwner ?? 'missing'}`)
  }
  if (PhysicsSession.prototype.buildChassisMonitor?.__bricklabOwner !== VEHICLE_OWNER) {
    failures.push(`vehicle topology owner: expected ${VEHICLE_OWNER}, got ${PhysicsSession.prototype.buildChassisMonitor?.__bricklabOwner ?? 'missing'}`)
  }
  if (PhysicsSession.prototype.updateVehicleDriveV2?.__bricklabOwner !== DRIVE_OWNER) {
    failures.push(`drive owner: expected ${DRIVE_OWNER}, got ${PhysicsSession.prototype.updateVehicleDriveV2?.__bricklabOwner ?? 'missing'}`)
  }
  if (typeof PhysicsSession.prototype.updateVehiclePerformanceV1 !== 'function') failures.push('vehicle performance phase missing')

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
