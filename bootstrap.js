// Ordered production bootstrap for the no-build GitHub Pages runtime.
// Runtime/editor modules keep their internal English state tokens; i18n is the final presentation layer.
await import('./runtime-extensions.js')
await import('./app.js')
await import('./overlay-ui.js')
await import('./catalog-ui.js')
await import('./catalog-previews.js')
await import('./inspector-ui.js')
await import('./testlab-v2.js')
await import('./powertrain-ui.js')
await import('./physics-v2-ui.js')
await import('./i18n.js')
await import('./i18n-runtime-patch.js')
await import('./i18n-physics-v2.js')
