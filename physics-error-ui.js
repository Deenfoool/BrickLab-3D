const BUILD_ID = 'PARTS-6'
const BUILD_TAG = 'parts-6-20260910-connector-v4-physics-v4'
window.__bricklabBuildId = BUILD_ID
window.__bricklabBuildTag = BUILD_TAG

function isRussian() {
  return document.documentElement.lang === 'ru' || localStorage.getItem('bricklab.ui.language.v1') === 'ru'
}

function shortMessage(value, limit = 150) {
  const text = String(value || 'Unknown error').replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function showPhysicsError(detail = {}) {
  setTimeout(() => {
    const toast = document.getElementById('toast')
    const simState = document.getElementById('simState')
    if (!toast) return

    const ru = isRussian()
    const loadFailure = detail.stage === 'rapier-load'
    const buildStage = detail.buildStage ? ` [${detail.buildStage}]` : ''
    const prefix = loadFailure
      ? (ru ? 'RAPIER: не удалось загрузить движок' : 'RAPIER: engine load failed')
      : (ru ? `PHYSICS${buildStage}: ошибка сборки мира` : `PHYSICS${buildStage}: world build failed`)
    const message = `${prefix} · ${shortMessage(detail.message)}`

    toast.textContent = message
    toast.classList.add('show')
    if (simState) simState.textContent = loadFailure
      ? (ru ? 'Rapier не загрузился' : 'Rapier failed to load')
      : `${ru ? 'Ошибка Physics v2' : 'Physics v2 build error'}${buildStage}`

    clearTimeout(window.__bricklabPhysicsErrorToastTimer)
    window.__bricklabPhysicsErrorToastTimer = setTimeout(() => toast.classList.remove('show'), 12000)
  }, 0)
}

function connectorV4Reason(reason, ru) {
  const reasons = {
    'ball-socket-angular-envelope-not-implemented': ru ? 'для ball/socket ещё нет доказанной модели угловых ограничений' : 'ball/socket angular envelope is not implemented yet',
    'hinge-angular-envelope-not-proven': ru ? 'для этого шарнира не подтверждены угловые пределы' : 'angular limits are not proven for this hinge',
    'generic-revolute-angular-envelope-not-proven': ru ? 'для этого вращательного соединения не подтверждены угловые пределы' : 'angular limits are not proven for this revolute interface',
    'captured-clip-angular-envelope-not-proven': ru ? 'для этого clip/bar не подтверждён диапазон вращения' : 'the rotation envelope is not proven for this clip/bar interface',
    'generic-group-requires-explicit-physics-override': ru ? 'этому специальному соединению нужен явный физический профиль' : 'this special connector requires an explicit physics profile',
    'locking-hinge-detent-policy-not-proven': ru ? 'для click/locking hinge не подтверждены detent-углы и усилие' : 'click/locking hinge detents are not certified',
  }
  return reasons[reason] || shortMessage(reason || (ru ? 'физика соединения не сертифицирована' : 'connector physics is not certified'), 110)
}

function showConnectorV4Blocked(detail = {}) {
  // The V4 guard dispatches synchronously and startSimulation then enters its generic
  // catch path. Defer this message one task so the precise connector explanation wins.
  setTimeout(() => {
    const toast = document.getElementById('toast')
    const simState = document.getElementById('simState')
    const status = document.getElementById('statusText')
    if (!toast) return
    const ru = isRussian()
    const blockers = Array.isArray(detail.blockers) ? detail.blockers : []
    const first = blockers[0] ?? {}
    const family = first.family ? ` · ${first.family}` : ''
    const extra = blockers.length > 1 ? (ru ? ` · ещё ${blockers.length - 1}` : ` · +${blockers.length - 1} more`) : ''
    const reason = connectorV4Reason(first.reason || detail.reason, ru)
    toast.textContent = `${ru ? 'Connector V4: симуляция заблокирована' : 'Connector V4: simulation blocked'}${family} · ${reason}${extra}`
    toast.classList.add('show')
    if (simState) simState.textContent = ru ? 'Connector V4 · нужен физический профиль' : 'Connector V4 · physics profile required'
    if (status) status.textContent = ru ? 'SIMULATE · Connector V4 fail-closed' : 'SIMULATE · Connector V4 fail-closed'
    clearTimeout(window.__bricklabPhysicsErrorToastTimer)
    window.__bricklabPhysicsErrorToastTimer = setTimeout(() => toast.classList.remove('show'), 14000)
  }, 0)
}

function installBuildStamp() {
  const actions = document.querySelector('.top-actions')
  if (!actions) {
    requestAnimationFrame(installBuildStamp)
    return
  }
  if (document.getElementById('bricklabBuildStamp')) return
  const badge = document.createElement('span')
  badge.id = 'bricklabBuildStamp'
  badge.textContent = BUILD_ID
  badge.title = `BrickLab ${BUILD_TAG} · high-fidelity wheels/driveline · Connector V4 fail-closed physics · PARTS-4 mechanics preserved`
  Object.assign(badge.style, {
    display: 'inline-flex',
    alignItems: 'center',
    height: '24px',
    padding: '0 7px',
    border: '1px solid #2f4a3a',
    borderRadius: '6px',
    background: '#152019',
    color: '#74e6a6',
    fontSize: '8px',
    fontWeight: '800',
    letterSpacing: '.08em',
    whiteSpace: 'nowrap',
  })
  actions.insertBefore(badge, actions.firstChild)
}

window.addEventListener('bricklab:physicserror', event => showPhysicsError(event.detail))
window.addEventListener('bricklab:connectorv4physicsblocked', event => showConnectorV4Blocked(event.detail))
window.addEventListener('DOMContentLoaded', installBuildStamp, { once: true })
installBuildStamp()

window.__bricklabPhysicsDiagnostics = () => ({
  buildId: BUILD_ID,
  buildTag: BUILD_TAG,
  buildStage: window.__bricklabPhysicsStage ?? null,
  units: window.BrickLabPhysicsUnits ?? null,
  colliders: window.BrickLabColliderModel ?? null,
  jointStability: window.__bricklabJointStability ?? null,
  autoWeld: window.__bricklabLastAutoWeldStats ?? null,
  mechanicalRecovery: window.__bricklabMechanicalRecovery ?? null,
  controls: window.BrickLabControls?.getRuntimeEntries?.() ?? [],
  vehicle: window.BrickLabVehicle?.getState?.() ?? null,
  vehicleDrive: window.BrickLabVehicleDrive?.getState?.() ?? null,
  vehiclePerformance: window.BrickLabVehiclePerformance?.get?.() ?? null,
  parts3: window.__bricklabParts3Diagnostics ?? window.BrickLabParts3 ?? null,
  parts4: {
    driveline: window.BrickLabParts4Driveline ?? null,
    physics: window.BrickLabParts4Physics ?? null,
    steeringSuspension: window.BrickLabParts4SteeringSuspension ?? null,
    linearMechanisms: window.BrickLabParts4LinearMechanisms?.getState?.() ?? window.__bricklabParts4LinearMechanisms ?? null,
    catalog: window.BrickLabParts4Catalog ?? null,
  },
  parts5: {
    visuals: window.BrickLabParts5Visuals ?? null,
    refinement: window.BrickLabParts5Refinement ?? null,
    drivelineRefinement: window.BrickLabParts5DrivelineVisuals ?? null,
    structuralRefinement: window.BrickLabParts5StructuralVisuals ?? null,
    detailRefinement: window.BrickLabParts5DetailRefinement ?? null,
    gearMeshCandidate: window.__bricklabGearMeshCandidate ?? null,
    lastGearMeshSnap: window.__bricklabLastGearMeshSnap ?? null,
    gearMeshUI: window.BrickLabParts5GearMeshUI ?? null,
  },
  parts6: {
    realism: window.BrickLabParts6Realism ?? null,
    precision: window.BrickLabParts6Precision ?? null,
    mechanicalRealism: window.BrickLabParts6MechanicalRealism ?? null,
    nominalDimensions: window.BrickLabParts6NominalDimensions ?? null,
    heroMechanicalFidelity: window.BrickLabParts6HeroMechanicalFidelity ?? null,
    fineMechanicalDetail: window.BrickLabParts6FineMechanicalDetail ?? null,
    coreMoldedFidelity: window.BrickLabParts6CoreMoldedFidelity ?? null,
    structuralShellFidelity: window.BrickLabParts6StructuralShellFidelity ?? null,
    crossAxleFidelity: window.BrickLabParts6CrossAxleFidelity ?? null,
    suspensionArmFidelity: window.BrickLabParts6SuspensionArmFidelity ?? null,
    steeringCarrierFidelity: window.BrickLabParts6SteeringCarrierFidelity ?? null,
    steeringCarrierPortDedup: window.BrickLabParts6SteeringCarrierPortDedup ?? null,
    bentLiftarmFidelity: window.BrickLabParts6BentLiftarmFidelity ?? null,
    heroMicroDetail: window.BrickLabParts6HeroMicroDetail ?? null,
    connectorFidelity: window.BrickLabParts6ConnectorFidelity ?? null,
    interfaceFit: window.BrickLabParts6InterfaceFit ?? null,
    interfacePhysicsSafety: window.BrickLabParts6InterfacePhysicsSafety ?? null,
    shaftHardwareFidelity: window.BrickLabParts6ShaftHardwareFidelity ?? null,
    shockFidelity: window.BrickLabParts6ShockFidelity ?? null,
    rackGearFidelity: window.BrickLabParts6RackGearFidelity ?? null,
  },
  pipeline: window.BrickLabPhysicsPipeline ?? null,
  ownership: window.BrickLabPhysicsOwnership?.snapshot?.() ?? window.__bricklabPhysicsOwnership ?? null,
  requestedTimeScale: window.__bricklabRequestedTimeScale ?? 1,
  appliedTimeScale: window.BrickLabSimulationTime?.getApplied?.() ?? 1,
  timeIntegrator: window.__bricklabTimeIntegrator ?? 'simulation-time-authoritative-v5',
  realElapsed: window.__bricklabPhysicsSession?.realElapsedTime ?? 0,
  simElapsed: window.__bricklabPhysicsSession?.actualSimulationElapsed ?? window.__bricklabPhysicsSession?.simulationTime ?? 0,
  nominalSteps: window.__bricklabPhysicsSession?.lastPhysicsSteps ?? 0,
  stability: window.BrickLabPhysicsStability?.diagnostics?.() ?? null,
  connectorSystem: {
    version: window.BrickLabConnectors?.version ?? window.BrickLabConnectorDiagnostics?.version ?? null,
    catalog: window.BrickLabConnectorDiagnostics ?? null,
    migratedStoredProjects: window.BrickLabProjectConnectors?.migratedStoredProjects ?? 0,
    lastNormalization: window.BrickLabProjectConnectors?.lastNormalization ?? null,
  },
  connectorV4: {
    runtime: window.BrickLabConnectorV4?.stats?.() ?? null,
    physicsGuard: window.BrickLabConnectorV4PhysicsGuard ? {
      version: window.BrickLabConnectorV4PhysicsGuard.version,
      safetyVersion: window.BrickLabConnectorV4PhysicsGuard.safetyVersion ?? null,
      policyVersion: window.BrickLabConnectorV4PhysicsGuard.policyVersion,
      adapterVersion: window.BrickLabConnectorV4PhysicsGuard.adapterVersion,
      lastPlan: window.BrickLabConnectorV4PhysicsGuard.lastPlan?.() ?? null,
      lastFailure: window.BrickLabConnectorV4PhysicsGuard.lastFailure?.() ?? null,
    } : null,
    session: window.__bricklabPhysicsSession?.connectorV4Physics ?? null,
    drivetrain: window.__bricklabPhysicsSession?.connectorV4Drivetrain ?? null,
  },
  visualQuality: window.BrickLabVisualQuality ?? null,
  lastError: window.__bricklabPhysicsLastError ?? null,
  rapierSource: window.__bricklabRapierSource ?? null,
})
