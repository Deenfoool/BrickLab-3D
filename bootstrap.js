// Ordered production bootstrap for the no-build GitHub Pages runtime.
// Mechanics/render extensions and localization register before app.js restores a project.
await import('./runtime-extensions.js')
await import('./i18n.js')
await import('./app.js')
await import('./overlay-ui.js')
await import('./catalog-ui.js')
await import('./catalog-previews.js')
await import('./inspector-ui.js')
await import('./testlab.js')
await import('./powertrain-ui.js')
