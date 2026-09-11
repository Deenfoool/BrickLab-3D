export const ARCHITECTURE_CONSOLIDATION_VERSION = 'architecture-consolidation-v1.0.0'
export const ARCHITECTURE_CONSOLIDATION_STATUS = 'complete'

const REQUIRED_PART_METHODS = ['list', 'get', 'mechanical', 'physical', 'connectors', 'capabilities', 'instantiate']
const REQUIRED_EDITOR_METHODS = ['objects', 'selection', 'primarySelection', 'objectById', 'projectState', 'history']
const REQUIRED_PROJECT_METHODS = ['current', 'save', 'createNew', 'requestImport', 'exportProject']

function methodIssues(target, methods, prefix) {
  return methods
    .filter(name => typeof target?.[name] !== 'function')
    .map(name => `${prefix}.${name} unavailable`)
}

export function architectureContractReport(subsystems = globalThis.BrickLabSubsystems) {
  const issues = []
  const status = subsystems?.status?.() ?? null
  const authority = subsystems?.connectivity?.authority ?? null
  const guard = subsystems?.physics?.guard?.() ?? null

  if (!subsystems) issues.push('BrickLabSubsystems unavailable')
  if (!status?.editor) issues.push('Editor contract not bound')
  if (!status?.projects) issues.push('Projects contract not bound')
  if (!status?.connectorBuild) issues.push('BUILD connectivity owner unavailable')
  if (!status?.connectorSimulate) issues.push('SIMULATE connector guard unavailable')

  if (authority?.build !== 'connector-v4-with-legacy-bridge') {
    issues.push('BUILD authority is not Connector V4 with the compatibility bridge')
  }
  if (authority?.simulate !== 'connector-v4-physics-guard') {
    issues.push('SIMULATE authority is not the Connector V4 physics guard')
  }

  if (!guard?.active) issues.push('Connector V4 physics guard is not active')
  if (!guard?.createOwner) issues.push('PhysicsSession.create has no certified guard owner')

  issues.push(...methodIssues(subsystems?.parts, REQUIRED_PART_METHODS, 'parts'))
  issues.push(...methodIssues(subsystems?.editor, REQUIRED_EDITOR_METHODS, 'editor'))
  issues.push(...methodIssues(subsystems?.projects, REQUIRED_PROJECT_METHODS, 'projects'))
  if (typeof subsystems?.physics?.createSession !== 'function') issues.push('physics.createSession unavailable')
  if (typeof subsystems?.mechanics?.metadata !== 'function') issues.push('mechanics.metadata unavailable')
  if (typeof subsystems?.connectivity?.build?.reconcile !== 'function') issues.push('connectivity.build.reconcile unavailable')
  if (typeof subsystems?.connectivity?.build?.records !== 'function') issues.push('connectivity.build.records unavailable')

  return Object.freeze({
    version:ARCHITECTURE_CONSOLIDATION_VERSION,
    milestoneStatus:ARCHITECTURE_CONSOLIDATION_STATUS,
    pass:issues.length === 0,
    subsystemVersion:subsystems?.version ?? null,
    status:status ? Object.freeze({ ...status }) : null,
    authority:authority ? Object.freeze({ ...authority }) : null,
    guard:guard ? Object.freeze({ ...guard }) : null,
    issues:Object.freeze(issues),
  })
}

export function assertArchitectureContract(subsystems = globalThis.BrickLabSubsystems) {
  const report = architectureContractReport(subsystems)
  if (!report.pass) {
    const error = new Error(`BrickLab architecture contract failed: ${report.issues.join('; ')}`)
    error.code = 'BRICKLAB_ARCHITECTURE_CONTRACT_FAILED'
    error.report = report
    throw error
  }
  return report
}

export const BrickLabArchitectureConsolidation = Object.freeze({
  version:ARCHITECTURE_CONSOLIDATION_VERSION,
  status:ARCHITECTURE_CONSOLIDATION_STATUS,
  report:architectureContractReport,
  assert:assertArchitectureContract,
})

globalThis.BrickLabArchitectureConsolidation = BrickLabArchitectureConsolidation
