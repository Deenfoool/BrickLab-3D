// Ordered production bootstrap for the no-build GitHub Pages runtime.
// Mechanics extensions must finish registering before app.js restores a project.
await import('./runtime-extensions.js')
await import('./app.js')
await import('./overlay-ui.js')
await import('./catalog-ui.js')
await import('./testlab.js')
await import('./powertrain-ui.js')
