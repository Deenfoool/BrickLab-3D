// BrickLab production mechanics and rendering extensions.
// BUILD: PARTS-6 · high-fidelity molded-part realism pass on top of PARTS-5.
// Root module URLs are versioned by the import map in index.html; package submodules
// carry explicit cache tags because they live outside the root import-map inventory.

await import('./three-cycle-guard.js')
await import('./multi-transform-patch.js')
await import('./render-quality.js')
await import('./basic-parts-pack.js')
await import('./technic-parts-pack-v2.js')
await import('./lab-parts.js')
await import('./vehicle-parts-v1.js')
await import('./parts3/mechanical-parts-pack-v3.js?v=parts-3-20260908-mechanical-v1')
await import('./parts3/parts-3-extra-v1.js?v=parts-3-20260908-mechanical-v1')
await import('./parts3/parts-3-wheel-dimensions.js?v=parts-3-20260908-mechanical-v1')
await import('./parts3/parts-3-visual-normalize.js?v=parts-3-20260908-mechanical-v1')
await import('./parts3/parts-3-steering-upgrade.js?v=parts-3-20260908-mechanical-v1')
await import('./parts4/mechanical-driveline-v1.js?v=parts-4-20260908-driveline-v1')
await import('./parts4/steering-suspension-v1.js?v=parts-4-20260908-driveline-v1')
// Semantic gearbox housings need explicit free-spinning shaft ports. Install this
// metadata before connector validation and before the physics graph is built.
await import('./parts4/semantic-bearing-upgrade-v1.js?v=parts-4-20260908-driveline-v1')

// Connector System v3 owns compatibility, project migration, validation and physics graph integrity.
await import('./connector-project-migration-v3.js')
await import('./connector-import-v3.js')
await import('./connector-validation-v3.js')

await import('./physical-parts.js')
// Shared defaults are installed first, then package-specific physical metadata.
await import('./parts3/parts-3-physics.js?v=parts-3-20260908-mechanical-v1')
await import('./parts3/parts-3-diagnostics.js?v=parts-3-20260908-mechanical-v1')
await import('./parts4/parts-4-physics.js?v=parts-4-20260908-driveline-v1')
await import('./suspension-patch.js')
await import('./differential-patch.js')
await import('./sensors-patch.js')
await import('./part-visual-v3.js')
// part-visual-v3 predates the expanded wheel ids; restore matte rubber semantics
// after its material tuning wrapper has been installed.
await import('./parts3/parts-3-wheel-materials.js?v=parts-3-20260908-mechanical-v1')
// PARTS-5 establishes canonical geometry metrics and the first high-quality visual
// families. PARTS-6 is intentionally loaded last and only replaces visual factories;
// connector positions, drivetrain semantics and authoritative physics stay unchanged.
await import('./parts5/visual-overhaul-v1.js?v=parts-5-20260909-visual-v2')
await import('./parts5/visual-refinement-v2.js?v=parts-5-20260909-visual-v2')
await import('./parts5/driveline-refinement-v2.js?v=parts-5-20260909-visual-v2')
await import('./parts5/structural-refinement-v2.js?v=parts-5-20260909-visual-v2')
await import('./parts5/detail-refinement-v3.js?v=parts-5-20260909-visual-v2')
await import('./parts6/realism-refinement-v1.js?v=parts-6-20260909-realism-v1')
await import('./parts6/precision-refinement-v2.js?v=parts-6-20260909-realism-v1')
await import('./parts6/mechanical-realism-v1.js?v=parts-6-20260909-realism-v1')
// Nominal dimensions are the last geometry owner for core pin/axle/hole/gear families.
await import('./parts6/nominal-dimension-fidelity-v1.js?v=parts-6-20260909-realism-v1')
// Connector fidelity wraps the final factories and adds visible semantic ports.
await import('./parts6/connector-fidelity-v1.js?v=parts-6-20260909-realism-v1')
await import('./parts6/interface-fit-refinement-v2.js?v=parts-6-20260909-realism-v1')
await import('./parts6/interface-physics-safety-v1.js?v=parts-6-20260909-realism-v1')
// Rack teeth use the same module/pressure angle as the spur gear family. This is
// the final steering-rack visual owner and intentionally leaves rack mechanics intact.
await import('./parts6/rack-gear-fidelity-v1.js?v=parts-6-20260909-realism-v1')
await import('./physics-v2.js')
await import('./colliders-v2.js')
await import('./collider-clearance-v3.js')
await import('./connector-physics-v3.js')
await import('./connector-mechanical-recovery-v4.js')
// joint-stability-v4.js is retained as the stable import path; it now exports
// joint-stability-v5 and owns stabilized revolute, spherical and prismatic joints.
await import('./joint-stability-v4.js')
await import('./powertrain-physics-v2.js')

await import('./physics-stability-v3.js')
await import('./drivetrain-stress-v2.js')
// This is intentionally outside the stress layer: it supplies the final ratio
// presented to the already inertia-aware, stress-limited drivetrain solver.
// CV remains constant-velocity; the universal joint gets Cardan phase variation.
await import('./parts4/articulated-driveline-physics-v1.js?v=parts-4-20260908-driveline-v1')
await import('./surface-v2.js')
await import('./suspension-v2.js')
await import('./vehicle-system-v1.js')
// Loaded after Vehicle System so a complete rack/tie-rod linkage becomes the
// steering actuator instead of fighting the direct steering-knuckle servos.
await import('./parts4/steering-suspension-physics-v1.js?v=parts-4-20260908-driveline-v1')
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
