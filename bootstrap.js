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

await import('./app.js')

for (const [key, value] of hiddenProjectEntries) {
  try { localStorage.setItem(key, value) } catch { /* storage may be unavailable */ }
}

// "Open another project" enters the real editor first, then invokes its existing file
// importer. This keeps import validation/migration in one authoritative code path.
if (menuResult.action === 'open') {
  requestAnimationFrame(() => document.querySelector('#importBtn')?.click())
}

await import('./parts5/gear-mesh-ui-v1.js?v=parts-5-20260909-visual-v2')
await import('./overlay-ui.js')
await import('./catalog-ui.js')
await import('./catalog-previews.js')
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
await import('./ldraw/catalog-v1.js?v=ldraw-20260910-v1')
await import('./menu/project-menu-v1.js?v=project-menu-20260910-v1')

const { assertPhysicsRuntimeContract } = await import('./physics-ownership-v1.js')
assertPhysicsRuntimeContract()
window.__bricklabRuntimeReady = true
