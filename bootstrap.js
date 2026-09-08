// Ordered production bootstrap for the no-build GitHub Pages runtime.
// BUILD: PARTS-3 · upgraded Technic geometry + expanded mechanical catalog + Vehicle Drive v2.
// All root module URLs are versioned once by the import map in index.html.

// Diagnostics must exist before any runtime/app module can fail.
await import('./physics-error-ui.js')
await import('./runtime-extensions.js')
await import('./app.js')
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
await import('./i18n-runtime-patch.js')
await import('./i18n-physics-v2.js')
await import('./i18n-physics-v2-extra.js')

const { assertPhysicsRuntimeContract } = await import('./physics-ownership-v1.js')
assertPhysicsRuntimeContract()
window.__bricklabRuntimeReady = true
