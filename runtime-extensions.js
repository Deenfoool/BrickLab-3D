// BrickLab production mechanics and rendering extensions.
// BUILD: CATALOG-3 · expanded Technic library + asset-browser catalog.
// All module URLs are versioned once by the import map in index.html.

await import('./three-cycle-guard.js')
await import('./multi-transform-patch.js')
await import('./render-quality.js')
await import('./basic-parts-pack.js')
await import('./technic-parts-pack-v2.js')
await import('./lab-parts.js')
await import('./physical-parts.js')
await import('./suspension-patch.js')
await import('./differential-patch.js')
await import('./sensors-patch.js')
await import('./part-visual-v3.js')
await import('./physics-v2.js')
await import('./colliders-v2.js')
await import('./structural-auto-weld-v2.js')
await import('./powertrain-physics-v2.js')
// Must load before stress/surface wrappers so they decorate the stabilized solvers.
await import('./physics-stability-v3.js')
await import('./drivetrain-stress-v2.js')
await import('./surface-v2.js')
await import('./suspension-v2.js')
await import('./mechanism-controls-core.js')
await import('./physics-v2-telemetry.js')
await import('./dyno-v2.js')
await import('./surface-telemetry-v2.js')
await import('./physics-debug-v2.js')
await import('./test-world-visuals-v2.js')
await import('./physics-stage-diagnostics.js')
await import('./rapier-loader-v2.js')
// Runtime UI + command-RPM motor controller.
await import('./simulation-runtime-v2.js')
// PhysicsSession owns its clock directly; extensions must not replace step.
