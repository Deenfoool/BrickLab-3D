# BrickLab physics layer

## Runtime

BrickLab is deployed without a bundler, so physics uses the Rapier 3D compatibility package. It is loaded lazily only when the user enters `SIMULATE`.

Current pinned package:

`@dimforge/rapier3d-compat@0.20.0`

This keeps initial BUILD startup lighter and avoids making GitHub Pages depend on an npm build step.

## Current simulation pipeline

```text
BUILD project state
      ↓ snapshot
part instances + connection graph
      ↓
Rapier world
      ├─ ground collider
      ├─ dynamic rigid body per part
      ├─ approximate cuboid collider per part
      └─ graph edges → joints
      ↓
world.step()
      ↓
Three.js object transforms
```

Returning to BUILD restores the pre-simulation snapshot, so physics does not overwrite the saved construction.

## Collider approximation

For the first physics iteration BrickLab calculates a local bounding box around each procedural part and attaches a cuboid collider with matching dimensions and local center.

This is deliberately an approximation. It is good enough for gravity, rough collisions and joint prototyping, but it is not suitable for accurate gear teeth, holes, tyre contact or interlocking geometry.

Future part definitions should contain dedicated collider metadata.

## Graph → joint mapping

Current mapping:

- `fixed` → `RAPIER.JointData.fixed`
- `hinge` → `RAPIER.JointData.revolute`
- `axle` → `RAPIER.JointData.revolute`

Fixed joints preserve the relative orientation that existed when simulation started.

Hinge and axle joints currently use connector anchors and the connector axis. This needs broader orientation testing before it should be considered mechanically final.

## Error handling

Joint creation is isolated per connection. If one experimental joint cannot be constructed, BrickLab records it as skipped and continues the rest of the simulation rather than aborting the entire world.

The SIMULATE status reports:

- rigid body count;
- joint count;
- skipped joint count when non-zero.

## Next physics work

1. Add explicit collider metadata to `PartDefinition`.
2. Merge components connected entirely by `fixed` edges into compound rigid bodies instead of many bodies with fixed joints.
3. Validate local joint axes/frames across all 90° part orientations.
4. Add wheel-specific colliders and friction.
5. Add motor configuration (`rpm`, torque, direction).
6. Drive axle joints with motors where appropriate.
7. Add spring/damper suspension joints.
8. Add simulation telemetry and deterministic reset tests.

## Why fixed components should eventually be merged

For a brick stack, a compound rigid body with multiple colliders is generally a better physics representation than many rigid bodies tied together by fixed constraints. The explicit BrickLab connection graph lets us calculate these fixed components before creating the Rapier world.
