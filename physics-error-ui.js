const BUILD_ID = 'PARTS-6'
const BUILD_TAG = 'parts-6-20260909-realism-v1'
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
  badge.title = `BrickLab ${BUILD_TAG} · high-fidelity wheels/bevels/driveline · measured Technic-like interfaces · rack/pinion fidelity · PARTS-4 mechanics preserved`
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
    connectorFidelity: window.BrickLabParts6ConnectorFidelity ?? null,
    interfaceFit: window.BrickLabParts6InterfaceFit ?? null,
    interfacePhysicsSafety: window.BrickLabParts6InterfacePhysicsSafety ?? null,
    rackGearFidelity: window.BrickLabParts6RackGearFidelity ?? null,
  },
  pipeline: window.BrickLabPhysicsPipeline ?? null,
  ownership: window.BrickLabPhysicsOwnership?.snapshot?.() ?? window.__bricklabPhysicsOwnership ?? null,
  requestedTimeScale: window.__bricklabRequestedTimeScale ?? 1,
  appliedTimeScale: window.BrickLabSimulationTime?.getApplied?.() ?? 1,
  timeIntegrator: window.__bricklabTimeIntegrator ?? 'simulation-time-authoritative-v5',
  realElapsed: window.__bricklabPhysicsSession?.realElapsedTime ?? window.__bricklabPhysicsSession?.simulationTime ?? 0,
  simElapsed: window.__bricklabPhysicsSession?.actualSimulationElapsed ?? window.__bricklabPhysicsSession?.simulationTime ?? 0,
  nominalSteps: window.__bricklabPhysicsSession?.lastPhysicsSteps ?? 0,
  stability: window.BrickLabPhysicsStability?.diagnostics?.() ?? null,
  connectorSystem: {
    version: window.BrickLabConnectors?.version ?? window.BrickLabConnectorDiagnostics?.version ?? null,
    catalog: window.BrickLabConnectorDiagnostics ?? null,
    migratedStoredProjects: window.BrickLabProjectConnectors?.migratedStoredProjects ?? 0,
    lastNormalization: window.BrickLabProjectConnectors?.lastNormalization ?? null,
  },
  visualQuality: window.BrickLabVisualQuality ?? null,
  lastError: window.__bricklabPhysicsLastError ?? null,
  rapierSource: window.__bricklabRapierSource ?? null,
})
