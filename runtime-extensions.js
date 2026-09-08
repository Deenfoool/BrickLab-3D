// BrickLab production mechanics and rendering extensions.
// BUILD: VEHICLE-1 · centralized microstep pipeline + Ackermann steering + brakes.
// All module URLs are versioned by the import map in index.html.

await import('./three-cycle-guard.js')
await import('./multi-transform-patch.js')
await import('./render-quality.js')
await import('./basic-parts-pack.js')
await import('./technic-parts-pack-v2.js')
await import('./lab-parts.js')
await import('./vehicle-parts-v1.js')

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
await import('./collider-clearance-v3.js')
await import('./connector-physics-v3.js')
// Recover visually aligned axle ↔ axle-hole interfaces before connector-physics builds bodies.
await import('./connector-mechanical-recovery-v4.js')
// One revolute constraint per rigid-body pair and zero-error shared anchors.
await import('./joint-stability-v4.js')
await import('./powertrain-physics-v2.js')

// Stable drivetrain/tire solver first; wrappers below decorate this implementation.
await import('./physics-stability-v3.js')
await import('./drivetrain-stress-v2.js')
await import('./surface-v2.js')
await import('./suspension-v2.js')
// Vehicle System v1 provides a fallback virtual steering model for ordinary wheel layouts.
// Physical Steering v1 upgrades this to actual Rapier hinge motors when Steering Base +
// Steering Knuckle parts are present.
await import('./vehicle-system-v1.js')
await import('./physical-steering-v1.js')
await import('./vehicle-performance-v1.js')
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
// simulation-time-v5 schedules fixed steps; physics-pipeline-v1 owns microstep subsystem order.
