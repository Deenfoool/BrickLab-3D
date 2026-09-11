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
    console.warn('[BrickLab] Main menu unavailable; opening editor directly.', error)
  }
}

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

await import('./ldraw/cache-boost-v1.js')
await import('./ldraw/bootstrap-v1.js')

globalThis.__bricklabConnectorV4StartMode = menuResult.action
await import('./connectors-v4/runtime-v4.js')

try {
  await import('./ldraw/fast-loader-v1.js')
} catch (error) {
  console.warn('[BrickLab LDraw] Predictive fast loader unavailable; using normal on-demand loading.', error)
}

await import('./connectors-v4/physics-guard-v4.js')
await import('./architecture/runtime-v1.js?v=architecture-20260911-v1')

globalThis.BrickLabEditorGroups?.armSelectionCapture?.()
try {
  await import('./app.js')
} finally {
  globalThis.BrickLabEditorGroups?.cancelSelectionCapture?.()
}
await import('./architecture/editor-adapter-v1.js?v=architecture-20260911-v1')

// Performance Engine V1 consumes the stable editor contract, builds scene/endpoint
// indexes progressively, and remains optional: SNAP falls back to the established
// full target scan until the indexes are ready or whenever membership becomes stale.
try {
  await import('./performance/runtime-v1.js?v=performance-20260911-v1')
} catch (error) {
  console.warn('[BrickLab Performance] Spatial performance engine unavailable; using compatibility scans.', error)
}

const { assertArchitectureContract } = await import('./architecture/contract-assert-v1.js?v=architecture-20260911-v1')
assertArchitectureContract()

await import('./connectors-v4/debug-overlay-v4.js')

for (const [key, value] of hiddenProjectEntries) {
  try { localStorage.setItem(key, value) } catch { /* storage may be unavailable */ }
}
delete globalThis.__bricklabConnectorV4StartMode

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
