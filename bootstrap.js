// Ordered production bootstrap for the no-build GitHub Pages runtime.
// BUILD: PARTS-6 · real preload stage + curated interactive main-menu hero v5.
// Root production modules are versioned by the import map in index.html.

let projectPreloader = null
try {
  const { createProjectPreloader } = await import('./menu/project-preloader-v4.js?v=hero-reducer-20260910-v1')
  projectPreloader = createProjectPreloader()
  await projectPreloader.preload()
} catch (error) {
  console.warn('[BrickLab] Project preloader unavailable; continuing with normal browser loading.', error)
}

// Diagnostics and the complete PARTS registry must execute before the menu creates
// its real Three.js drivetrain from the same factories used by BUILD mode.
try {
  projectPreloader?.stageProgress(.18, 'Подготовка диагностики')
  await import('./physics-error-ui.js')
  projectPreloader?.stageProgress(.42, 'Подготовка моделей деталей')
  await import('./runtime-extensions.js')
  projectPreloader?.stageProgress(.82, 'Сборка демонстрационной трансмиссии')
} catch (error) {
  await projectPreloader?.finish('Ошибка инициализации')
  throw error
}

let menuResult = { action: 'continue', snapshot: null }
let showMainMenu = null
try {
  ;({ showMainMenu } = await import('./menu/main-menu-v5.js?v=hero-reducer-20260910-v1'))
  projectPreloader?.stageProgress(1, 'Готово')
} catch (error) {
  console.warn('[BrickLab] Main menu module unavailable; opening editor directly.', error)
}

if (projectPreloader) await projectPreloader.finish('Готово')

if (showMainMenu) {
  try {
    menuResult = await showMainMenu()
  } catch (error) {
    // The menu is presentation-only. Menu/WebGL failure must never prevent the editor
    // from starting, especially on old/mobile GPUs.
    console.warn('[BrickLab] Main menu unavailable; opening editor directly.', error)
  }
}

// app.js currently restores the last local project during module evaluation. For a
// deliberate New/Open action, temporarily hide that snapshot while the editor boots,
// then put it back so "New project" never destroys the user's previous saved build.
const hiddenProjectEntries = []
if (menuResult.action === 'new' || menuResult.action === 'open') {
  for (const key of ['bricklab.project.v2', 'bricklab.project.v1']) {
    try {
      const value = localStorage.getItem(key)
      if (value != null) hiddenProjectEntries.push([key, value])
      localStorage.removeItem(key)
    } catch { /* storage may be unavailable */ }
  }
}

// Enable Three.js' shared in-memory FileLoader cache before any LDraw model starts
// loading. LDraw parts reuse many primitives/subparts, so later models can reuse the
// same resources without re-entering the network layer.
await import('./ldraw/cache-boost-v1.js')

// Register dynamic ldraw-* definitions before app.js restores a saved project. LDraw
// modules use canonical import-map specifiers so bootstrap/catalog/prefetch share one
// text/prototype cache instance.
await import('./ldraw/bootstrap-v1.js')

// Connector V4.2 owns structural snapping for LDraw parts. These unversioned
// specifiers are intentionally canonicalized by index.html's import map so every V4
// dependency is loaded from one cache generation.
globalThis.__bricklabConnectorV4StartMode = menuResult.action
await import('./connectors-v4/runtime-v4.js')

// Start predictive LDraw warming before the editor itself is evaluated. The loader
// works only in idle/hover/visibility time, deduplicates work and keeps V4 hydration
// on the same definitions that BUILD will later instantiate.
try {
  await import('./ldraw/fast-loader-v1.js')
} catch (error) {
  console.warn('[BrickLab LDraw] Predictive fast loader unavailable; using normal on-demand loading.', error)
}

// The guard creates V4 Rapier constraints only from a fresh physics policy plan. Any
// unsupported/ambiguous connection blocks SIMULATE rather than downgrading silently.
await import('./connectors-v4/physics-guard-v4.js')

// Architecture API v1 is a compatibility facade, not a new owner. It exposes stable
// subsystem contracts while BUILD remains owned by Connector V4/bridges and SIMULATE
// remains owned by the fail-closed Connector V4 physics guard.
await import('./architecture/runtime-v1.js?v=architecture-20260911-v1')

// app.js keeps selection state lexical. The editor-group layer installs a short-lived
// Set wrapper before app evaluation. The selectedObjects Set promotes itself when it
// first receives a real editor part and then publishes authoritative selection events.
globalThis.BrickLabEditorGroups?.armSelectionCapture?.()
try {
  await import('./app.js')
} finally {
  globalThis.BrickLabEditorGroups?.cancelSelectionCapture?.()
}
// Bind the current lexical editor state to the stable Architecture API only after
// app.js has created the scene, selection collection, history controls and V4 object source.
await import('./architecture/editor-adapter-v1.js?v=architecture-20260911-v1')

// Performance Engine V1 consumes the stable editor contract, builds scene/endpoint
// indexes progressively, and remains optional: SNAP falls back to the established
// full target scan until the indexes are ready or whenever membership becomes stale.
try {
  await import('./performance/runtime-v1.js?v=performance-20260911-v1')
  await import('./performance/ldraw-sync-v1.js?v=performance-20260911-v1')
} catch (error) {
  console.warn('[BrickLab Performance] Spatial performance engine unavailable; using compatibility scans.', error)
}

// Architecture Consolidation V1 is a production invariant now, not only documentation.
// The runtime is allowed to continue only if editor/projects are bound and BUILD/SIMULATE
// still resolve through Connector V4 and its fail-closed physics guard.
const { assertArchitectureContract } = await import('./architecture/contract-assert-v1.js?v=architecture-20260911-v1')
assertArchitectureContract()

// F9 toggles the V4 endpoint/axis overlay. It is removed synchronously before physics
// collider measurement so diagnostics can never affect collision bounds.
await import('./connectors-v4/debug-overlay-v4.js')

for (const [key, value] of hiddenProjectEntries) {
  try { localStorage.setItem(key, value) } catch { /* storage may be unavailable */ }
}
delete globalThis.__bricklabConnectorV4StartMode

// "Open another project" enters the real editor first, then invokes its existing file
// importer. This keeps import validation/migration in one authoritative code path.
if (menuResult.action === 'open') {
  requestAnimationFrame(() => document.querySelector('#importBtn')?.click())
}

await import('./parts5/gear-mesh-ui-v1.js?v=parts-5-20260909-visual-v2')
await import('./overlay-ui.js')
await import('./inspector-ui.js')
await import('./physical-inspector-v2.js')
await import('./mechanism-controls-ui.js')
await import('./vehicle-controls-ui-v1.js')
await import('./testlab-v2.js')
await import('./powertrain-ui.js')
await import('./physics-v2-ui.js')
await import('./i18n.js')
await import('./i18n-basic-parts-v1.js')
await import('./parts3/i18n-parts-3.js?v=parts-3-20260908-mechanical-v1')
await import('./parts3/parts-3-catalog-ui.js?v=parts-3-20260908-mechanical-v1')
await import('./parts4/i18n-parts-4.js?v=parts-4-20260908-driveline-v1')
await import('./parts4/catalog-parts-4.js?v=parts-4-20260908-driveline-v1')
await import('./i18n-runtime-patch.js')
await import('./i18n-physics-v2.js')
await import('./i18n-physics-v2-extra.js')
await import('./ldraw/catalog-v3.js')
await import('./ldraw/catalog-thumbnails-v1.js')
await import('./menu/project-menu-v1.js?v=project-menu-20260910-v1')

const { assertPhysicsRuntimeContract } = await import('./physics-ownership-v1.js')
assertPhysicsRuntimeContract()
window.__bricklabRuntimeReady = true

// Smart Assembly remains optional and starts only after the established editor/UI
// reaches runtimeReady. Any failure here must never block the editor itself.
const startSmartAssembly = async () => {
  try {
    await import('./guidance/smart-assembly-activation-v1.js?v=smart-assembly-20260911-v4')
  } catch (error) {
    console.warn('[BrickLab Smart Assembly] Assistant unavailable; editor continues without assembly suggestions.', error)
  }
}

if (typeof globalThis.setTimeout === 'function') {
  globalThis.setTimeout(() => void startSmartAssembly(), 0)
} else {
  void startSmartAssembly()
}
