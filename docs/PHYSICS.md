# BrickLab physics layer

See [Time Scale RUNTIME-4](TIME_SCALE.md) for runner ownership, clock diagnostics,
acceptance measurements and manual publication.

## Runtime

BrickLab is deployed without a bundler, so physics uses the Rapier 3D compatibility package and loads it lazily when a physics session starts.

Current pinned package:

`@dimforge/rapier3d-compat@0.20.0`

BUILD therefore stays lightweight and GitHub Pages still does not require an npm build step.

## Simulation pipeline

```text
BUILD project state
      ↓ snapshot
part instances + connection graph
      ↓
rigid-component analysis
      ├─ fixed stud/tube groups
      └─ rigid keyed axle groups
      ↓
Rapier world
      ├─ flat ground
      ├─ optional test-scenario colliders
      ├─ compound dynamic rigid bodies
      ├─ wheel / gear approximate colliders
      └─ hinge / bearing / motor revolute joints
      ↓
semantic drivetrain analysis
      ├─ shaft graph
      ├─ spur-gear mesh detection
      ├─ RPM propagation
      ├─ torque-capacity propagation
      └─ conflict detection
      ↓
finite motor torque + finite gear coupling torque
      ↓
world.step()
      ↓
Three.js transforms + live telemetry
```

Returning to BUILD restores the pre-simulation snapshot, so simulation never overwrites the saved construction.

## Connection semantics

- `fixed` — stud/tube; merged into one rigid component.
- `hinge` — pin/pin-hole; revolute joint.
- `bearing` — axle through a normal Technic hole; revolute joint, so the shaft can spin inside the chassis.
- `axle` — axle/axle-hole keyed connection; normally merged into the same rigid shaft.
- motor-output `axle` — remains a revolute joint between the motor housing and the driven shaft.

This separation is required for vehicles: wheel + axle + gear rotate together, while the axle remains free to rotate in chassis bearings.

## Rigid components

Before Rapier bodies are created, BrickLab merges:

1. all `fixed` links;
2. all non-motor keyed `axle` links.

Each resulting component becomes one dynamic Rapier rigid body with multiple colliders. This is considerably more stable than a long chain of fixed constraints.

## Collider approximation

Current shapes are intentionally simplified:

- ordinary parts → local bounding-box cuboids;
- wheels → cylinders with increased friction;
- gears → cylinders smaller than the pitch circle.

Gear teeth are semantic, not collision-driven. The smaller gear collider avoids a second physical contact constraint fighting the drivetrain coupling.

## Motor model

The Lab Motor has a no-load target of 120 RPM. Motor output is no longer an unlimited velocity controller.

Every physics step BrickLab reads the relative angular velocity of the motor housing and output shaft, then applies a finite torque pair through Rapier `addTorque()`.

The simplified torque-speed curve is:

```text
available torque = stall torque × |target speed - actual speed| / target speed
```

The value is clamped from 0 to the configured stall torque. The driven shaft receives the torque and the motor housing receives the equal/opposite reaction torque.

Default prototype values when a part does not explicitly override them:

```text
no-load speed:   120 RPM
stall torque:    5.5 BrickLab torque units
free current:    0.15 A estimated
stall current:   2.2 A estimated
```

**BrickLab torque units are not N·m yet.** The world scale, mass scale and motor constants must be calibrated before the UI can honestly display SI torque.

A motor is marked `STALL` when it remains close to zero RPM at high calculated load for a sustained interval.

## Gear torque transfer

Detected gear pairs now transfer finite torque instead of forcing the output body to a target angular velocity with `setAngvel()`.

For an ideal pair:

```text
RPM_B = -RPM_A × teeth_A / teeth_B
Torque_B ≈ Torque_A × teeth_B / teeth_A × efficiency
```

Current per-mesh prototype efficiency is approximately 92%.

Example:

```text
8T → 24T
speed:  120 → 40 RPM
moment: 1.0× → about 2.76× after mesh loss
```

A coupling controller measures the current shaft-speed error and applies limited opposite torques to both shaft bodies. This means drivetrain load can now feed back into actual RPM instead of every driven gear being kinematically forced to its theoretical speed.

This is still a simplified semantic gear constraint: there is no backlash, tooth elasticity or individual tooth contact.

## Gear pitch

The prototype Technic-style gear pitch uses:

```text
pitch radius = teeth / 16 stud
```

This keeps common pairs aligned to the BrickLab grid. For example:

- 8T + 24T → 2 stud center distance;
- 16T + 16T → 2 stud center distance.

## Live telemetry

SIMULATE now reports:

- motor actual RPM;
- motor load %;
- applied motor torque;
- estimated current;
- STALL state;
- shaft target RPM;
- shaft actual RPM from Rapier `angvel()`;
- shaft torque capacity and transmission ratio;
- detected gear meshes;
- body speed and acceleration;
- wheel ground speed;
- wheel rim speed;
- wheel slip %;
- drivetrain conflicts.

The actual shaft RPM is calculated by projecting the body's real angular-velocity vector onto the shaft axis.

## Hill Climb TEST

TEST now reuses the non-destructive physics runtime with a dedicated scenario instead of being only a decorative scene.

Current first scenario:

```text
Hill Climb 22°
ramp length: 18 BrickLab units
ramp width: 8 BrickLab units
finish gate near the top
```

The test creates both a visible Three.js ramp and a matching static Rapier collider.

The test panel tracks:

- chassis speed;
- acceleration;
- climb progress;
- gained altitude;
- drivetrain load;
- `RUNNING`, `STALLED`, or `PASSED` state.

The default ramp rises along world +Z so a conventional vehicle with X-axis wheel axles naturally faces the course.

## Bearings

Technic beam holes accept both pins and axles:

- pin + hole → `hinge`;
- axle + hole → `bearing`.

This lets a shaft be supported by the chassis without locking its rotation.

## Remaining physics work

1. Calibrate BrickLab mass/length/torque units and then expose real SI units where defensible.
2. Add differential semantics.
3. Add gearbox selector, clutch and neutral relationships.
4. Add spring/damper suspension.
5. Add explicit per-part collider/mass metadata.
6. Add contact-aware tyre grip instead of only inferred slip.
7. Add deterministic drivetrain and Hill Climb fixtures for regression testing.
8. Add more test scenarios: torque bench, obstacle course and gearbox bench.

## Design rule

Detailed gear-tooth collision is intentionally not the authoritative mechanical model. Browser simulation would become expensive and unstable, and mechanics would depend on render geometry. BrickLab keeps visible teeth as presentation and uses semantic drivetrain constraints for behaviour.
