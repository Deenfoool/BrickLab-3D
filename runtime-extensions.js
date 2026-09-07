// BrickLab production mechanics and rendering extensions.
// BUILD: PV2-FIX3 · each extension is cache-busted so GitHub Pages/CDN cannot mix generations.
const V = 'pv2-fix3-20260908-0038'

await import(`./render-quality.js?v=${V}`)
await import(`./lab-parts.js?v=${V}`)
await import(`./physical-parts.js?v=${V}`)
await import(`./suspension-patch.js?v=${V}`)
await import(`./differential-patch.js?v=${V}`)
await import(`./sensors-patch.js?v=${V}`)
await import(`./physics-v2.js?v=${V}`)
await import(`./colliders-v2.js?v=${V}`)
await import(`./powertrain-physics-v2.js?v=${V}`)
await import(`./drivetrain-stress-v2.js?v=${V}`)
await import(`./surface-v2.js?v=${V}`)
await import(`./suspension-v2.js?v=${V}`)
await import(`./physics-v2-telemetry.js?v=${V}`)
await import(`./dyno-v2.js?v=${V}`)
await import(`./surface-telemetry-v2.js?v=${V}`)
await import(`./physics-debug-v2.js?v=${V}`)
await import(`./test-world-visuals-v2.js?v=${V}`)
await import(`./rapier-loader-v2.js?v=${V}`)
