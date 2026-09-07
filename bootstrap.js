// Ordered production bootstrap for the no-build GitHub Pages runtime.
// BUILD: WELD-1 · Physics v2 structural weld fix.
const V = 'weld-1-20260908-0104'

// Diagnostics must exist before any runtime/app module can fail.
await import(`./physics-error-ui.js?v=${V}`)
await import(`./runtime-extensions.js?v=${V}`)
await import(`./app.js?v=${V}`)
await import(`./overlay-ui.js?v=${V}`)
await import(`./catalog-ui.js?v=${V}`)
await import(`./catalog-previews.js?v=${V}`)
await import(`./inspector-ui.js?v=${V}`)
await import(`./physical-inspector-v2.js?v=${V}`)
await import(`./testlab-v2.js?v=${V}`)
await import(`./powertrain-ui.js?v=${V}`)
await import(`./physics-v2-ui.js?v=${V}`)
await import(`./i18n.js?v=${V}`)
await import(`./i18n-runtime-patch.js?v=${V}`)
await import(`./i18n-physics-v2.js?v=${V}`)
await import(`./i18n-physics-v2-extra.js?v=${V}`)
