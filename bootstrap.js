// Ordered production bootstrap for the no-build GitHub Pages runtime.
// BUILD: PARTS-6 · molded realism + interactive main-menu hero v2.
// All root production modules are versioned once by the import map in index.html.

// Diagnostics and the complete part registry must exist before the menu creates its
// real Three.js hero assembly from production part factories.
await import('./physics-error-ui.js')
await import('./runtime-extensions.js')

let menuResult = { action: 'continue', snapshot: null }
try {
  const { showMainMenu } = await import('./menu/main-menu-v2.js?v=main-menu-20260910-v2')
  menuResult = await showMainMenu()
} catch (error) {
  // The menu is presentation-only. A menu/WebGL failure must never prevent the editor
  // from starting, especially on old/mobile GPUs.
  console.warn('[BrickLab] Main menu unavailable; opening editor directly.', error)
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

const { assertPhysicsRuntimeContract } = await import('./physics-ownership-v1.js')
assertPhysicsRuntimeContract()
window.__bricklabRuntimeReady = true
