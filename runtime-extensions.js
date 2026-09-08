// BrickLab production mechanics and rendering extensions.
// BUILD: PHYSICS-7 · clearance-aware colliders + SI boundary + Connector System v3.
// All module URLs are versioned by the import map in index.html.

await import('./three-cycle-guard.js')
await import('./multi-transform-patch.js')
await import('./render-quality.js')
await import('./basic-parts-pack.js')
await import('./technic-parts-pack-v2.js')
await import('./lab-parts.js')

// Connector System v3 owns compatibility, project migration, validation and physics graph integrity.
// The legacy app still imports ./connections.js and ./snapping.js; index.html aliases those
// specifiers to the authoritative v3 modules for backwards-compatible call sites.
await import('./connector-project-migration-v3.js')
await import('./connector-import-v3.js')
await import('./connector-validation-v3.js')

await import('./physical-parts.js')
await import('./suspension-patch.js')
await import('./differential-patch.js')
await import('./sensors-patch.js')
await import('./part-visual-v3.js')
await import('./physics-v2.js')
// SI boundary owner: joint anchors and Rapier->editor transform sync.
await import('./colliders-v2.js')
// Replace the old one-box-per-part collider builder with clearance-aware profiles.
// This must load after colliders-v2 so PHYSICS-6 unit fixes remain authoritative.
await import('./collider-clearance-v3.js')
await import('./connector-physics-v3.js')
// Recover visually aligned axle ↔ axle-hole interfaces before the authoritative
// connector-physics build sanitizes the graph and creates rigid shaft components.
await import('./connector-mechanical-recovery-v4.js')
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
