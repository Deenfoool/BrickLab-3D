// BrickLab production mechanics and rendering extensions.
// BUILD: PARTS-3 · upgraded Technic geometry + mechanical expansion + Vehicle Drive v2.
// Root module URLs are versioned by the import map in index.html; PARTS-3 submodules
// carry an explicit cache tag because they live outside the root import-map inventory.

await import('./three-cycle-guard.js')
await import('./multi-transform-patch.js')
await import('./render-quality.js')
await import('./basic-parts-pack.js')
await import('./technic-parts-pack-v2.js')
await import('./lab-parts.js')
await import('./vehicle-parts-v1.js')
await import('./parts3/mechanical-parts-pack-v3.js?v=parts-3-20260908-mechanical-v1')
await import('./parts3/parts-3-extra-v1.js?v=parts-3-20260908-mechanical-v1')
await import('./parts3/parts-3-visual-normalize.js?v=parts-3-20260908-mechanical-v1')
await import('./parts3/parts-3-steering-upgrade.js?v=parts-3-20260908-mechanical-v1')

// Connector System v3 owns compatibility, project migration, validation and physics graph integrity.
await import('./connector-project-migration-v3.js')
await import('./connector-import-v3.js')
await import('./connector-validation-v3.js')

await import('./physical-parts.js')
// physical-parts owns the shared defaults. PARTS-3 applies explicit mass/collision
// metadata for its new inventory after those defaults have been installed.
await import('./parts3/parts-3-physics.js?v=parts-3-20260908-mechanical-v1')
await import('./parts3/parts-3-diagnostics.js?v=parts-3-20260908-mechanical-v1')
await import('./suspension-patch.js')
await import('./differential-patch.js')
await import('./sensors-patch.js')
await import('./part-visual-v3.js')
// part-visual-v3 predates the expanded wheel ids; restore matte rubber semantics
// after its material tuning wrapper has been installed.
await import('./parts3/parts-3-wheel-materials.js?v=parts-3-20260908-mechanical-v1')
await import('./physics-v2.js')
await import('./colliders-v2.js')
await import('./collider-clearance-v3.js')
await import('./connector-physics-v3.js')
await import('./connector-mechanical-recovery-v4.js')
await import('./joint-stability-v4.js')
await import('./powertrain-physics-v2.js')

await import('./physics-stability-v3.js')
await import('./drivetrain-stress-v2.js')
await import('./surface-v2.js')
await import('./suspension-v2.js')
await import('./vehicle-system-v1.js')
await import('./vehicle-performance-v1.js')

// Mechanism controls own motor/transmission runtime state. Vehicle Drive v2 consumes
// that API from the fixed-step pipeline instead of commanding motors from requestAnimationFrame.
await import('./mechanism-controls-core.js')
await import('./vehicle-drive-v2.js')

await import('./physics-v2-telemetry.js')
await import('./dyno-v2.js')
await import('./surface-telemetry-v2.js')
await import('./physics-debug-v2.js')
await import('./test-world-visuals-v2.js')
await import('./physics-stage-diagnostics.js')
await import('./rapier-loader-v2.js')
await import('./simulation-runtime-v2.js')
