// BrickLab production mechanics and rendering extensions.
// BUILD: RUNTIME-3 · physical-dt time scale + command-RPM motor physics.
const V = 'runtime-3-20260908-0848'

await import(`./three-cycle-guard.js?v=${V}`)
await import(`./multi-transform-patch.js?v=${V}`)
await import(`./render-quality.js?v=${V}`)
await import(`./basic-parts-pack.js?v=${V}`)
await import(`./lab-parts.js?v=${V}`)
await import(`./physical-parts.js?v=${V}`)
await import(`./suspension-patch.js?v=${V}`)
await import(`./differential-patch.js?v=${V}`)
await import(`./sensors-patch.js?v=${V}`)
await import(`./part-visual-v3.js?v=${V}`)
await import(`./physics-v2.js?v=${V}`)
await import(`./colliders-v2.js?v=${V}`)
await import(`./structural-auto-weld-v2.js?v=${V}`)
await import(`./powertrain-physics-v2.js?v=${V}`)
await import(`./drivetrain-stress-v2.js?v=${V}`)
await import(`./surface-v2.js?v=${V}`)
await import(`./suspension-v2.js?v=${V}`)
await import(`./mechanism-controls-core.js?v=${V}`)
await import(`./physics-v2-telemetry.js?v=${V}`)
await import(`./dyno-v2.js?v=${V}`)
await import(`./surface-telemetry-v2.js?v=${V}`)
await import(`./physics-debug-v2.js?v=${V}`)
await import(`./test-world-visuals-v2.js?v=${V}`)
await import(`./physics-stage-diagnostics.js?v=${V}`)
await import(`./rapier-loader-v2.js?v=${V}`)
// Runtime UI + command-RPM motor controller.
await import(`./simulation-runtime-v2.js?v=${V}`)
// ABSOLUTELY LAST: authoritative physical-time integrator owns PhysicsSession.step().
await import(`./simulation-time-authoritative-v3.js?v=${V}`)
