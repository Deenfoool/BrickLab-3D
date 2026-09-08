// Ordered production bootstrap for the no-build GitHub Pages runtime.
// BUILD: RUNTIME-5 · stable drivetrain/tire physics + fixed-step Time Scale.
// All module URLs are versioned once by the import map in index.html.

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
await import('./testlab-v2.js')
await import('./powertrain-ui.js')
await import('./physics-v2-ui.js')
await import('./i18n.js')
await import('./i18n-basic-parts-v1.js')
await import('./i18n-runtime-patch.js')
await import('./i18n-physics-v2.js')
await import('./i18n-physics-v2-extra.js')

const { PhysicsSession } = await import('./physics.js')
const { STEP_OWNER } = await import('./simulation-time.js')
if (PhysicsSession.prototype.step.__bricklabOwner !== STEP_OWNER) {
  throw new Error('Physics runner was replaced during bootstrap')
}
window.__bricklabRuntimeReady = true
