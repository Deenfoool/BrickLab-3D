import { PhysicsSession } from './physics.js'

const RAPIER_SOURCES = [
  'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.20.0/dist/rapier.mjs',
  'https://esm.sh/@dimforge/rapier3d-compat@0.20.0?bundle',
  'https://cdn.skypack.dev/@dimforge/rapier3d-compat@0.20.0',
]

let rapierPromise = null
let selectedSource = null

function describeError(error) {
  if (!error) return 'Unknown error'
  return String(error?.message || error)
}

function report(stage, error, extra = {}) {
  const detail = {
    stage,
    buildStage: error?.bricklabStage || window.__bricklabPhysicsStage || null,
    message: describeError(error),
    stack: String(error?.stack || ''),
    source: selectedSource,
    time: new Date().toISOString(),
    ...extra,
  }
  window.__bricklabPhysicsLastError = detail
  window.dispatchEvent(new CustomEvent('bricklab:physicserror', { detail }))
  console.error(`[BrickLab Physics] ${stage}${detail.buildStage ? ` [${detail.buildStage}]` : ''}:`, error, detail)
}

async function importRapier(source) {
  const module = await import(source)
  const RAPIER = module?.default ?? module
  if (!RAPIER || typeof RAPIER.init !== 'function') {
    throw new Error('Rapier module loaded but init() is missing')
  }
  await RAPIER.init()
  if (!RAPIER.World || !RAPIER.RigidBodyDesc || !RAPIER.ColliderDesc || !RAPIER.JointData) {
    throw new Error('Rapier initialized but required 3D API is incomplete')
  }
  return RAPIER
}

async function loadRapierResilient() {
  if (!rapierPromise) {
    rapierPromise = (async () => {
      const failures = []
      for (const source of RAPIER_SOURCES) {
        try {
          selectedSource = source
          const RAPIER = await importRapier(source)
          window.__bricklabRapierSource = source
          window.__bricklabPhysicsLastError = null
          console.info('[BrickLab Physics] Rapier ready:', source)
          return RAPIER
        } catch (error) {
          failures.push(`${source}: ${describeError(error)}`)
          console.warn('[BrickLab Physics] Rapier source failed:', source, error)
        }
      }
      throw new Error(`All Rapier sources failed. ${failures.join(' | ')}`)
    })().catch(error => {
      rapierPromise = null
      selectedSource = null
      throw error
    })
  }
  return rapierPromise
}

PhysicsSession.create = async function createPhysicsSession(objects, connections) {
  let RAPIER
  window.__bricklabPhysicsStage = 'rapier-load'
  try {
    RAPIER = await loadRapierResilient()
  } catch (error) {
    report('rapier-load', error)
    throw new Error(`Rapier load failed: ${describeError(error)}`, { cause: error })
  }

  const scenario = window.__bricklabNextScenario || 'flat'
  window.__bricklabNextScenario = null

  let session
  try {
    window.__bricklabPhysicsStage = 'session-constructor'
    session = new PhysicsSession(RAPIER, objects, connections, scenario)
    window.__bricklabPhysicsStage = 'build'
    session.build()
    window.__bricklabPhysicsStage = 'ready'
    window.__bricklabPhysicsLastError = null
    return session
  } catch (error) {
    const failedStage = error?.bricklabStage || window.__bricklabPhysicsStage || 'session-build'
    try { session?.dispose?.() } catch {}
    report('session-build', error, {
      buildStage: failedStage,
      scenario,
      parts: objects?.length ?? 0,
      connections: connections?.length ?? 0,
    })
    throw new Error(`Physics build failed [${failedStage}]: ${describeError(error)}`, { cause: error })
  }
}

export function resetRapierLoader() {
  rapierPromise = null
  selectedSource = null
}
