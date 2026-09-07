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
rigid-component analysis
      ├─ fixed stud/tube groups
      └─ rigid keyed axle groups
      ↓
Rapier world
      ├─ ground collider
      ├─ compound dynamic rigid bodies
      ├─ wheel / gear specific approximate colliders
      ├─ hinge + bearing revolute joints
      └─ powered motor-output revolute joints
      ↓
semantic drivetrain analysis
      ├─ shaft graph
      ├─ automatic spur-gear mesh detection
      ├─ tooth-count RPM propagation
      └─ drivetrain conflict detection
      ↓
world.step()
      ↓
Three.js object transforms + drivetrain telemetry
```

Returning to BUILD restores the pre-simulation snapshot, so physics does not overwrite the saved construction.

## Connection semantics

BrickLab now separates a keyed axle connection from a bearing:

- `fixed` — stud/tube connection; members are merged into one compound rigid body.
- `hinge` — pin/pin-hole connection; translated to a revolute joint.
- `bearing` — axle through a normal beam hole; translated to a revolute joint so the axle can spin inside the chassis.
- `axle` — axle/axle-hole keyed connection; normally merged into one rigid shaft because it must transmit rotation.
- motor-output `axle` connection — remains a revolute joint and receives the Lab Motor velocity target.

This distinction is required for a usable vehicle drivetrain: a wheel and gear must rotate with their axle, while the same axle must remain free to rotate inside a beam bearing.

## Rigid components

Before the Rapier world is created, BrickLab builds compound groups from:

1. all `fixed` graph links;
2. all non-motor keyed `axle` links.

Every group becomes one Rapier rigid body with multiple colliders. This is more stable than connecting each brick, axle, wheel and gear with a chain of fixed constraints.

## Collider approximation

The current collision shapes are still intentionally simplified:

- ordinary parts use local bounding-box cuboids;
- wheels use cylindrical colliders with higher friction;
- gears use smaller cylinders inside the pitch circle because gear teeth are coupled semantically rather than through tooth-to-tooth collision.

The gear collider is deliberately smaller than the visible gear. Otherwise two visually meshed gears would also collide as overlapping cylinders and fight the drivetrain constraint.

## Motor model

`Lab Motor` currently exposes:

```js
mechanics: {
  motor: {
    connectorId: 'output',
    rpm: 120,
    direction: 1,
    damping: 1.0
  }
}
```

When its output is connected to an axle-hole, the resulting revolute joint uses Rapier motor velocity control.

The motor also has four bottom tube mounting points so it can be fixed to a plate/chassis instead of behaving as a free body.

Torque limiting is not implemented yet. Current motor behaviour is velocity-target based.

## Bearings

Technic beam holes now accept either pins or axles:

- pin + beam hole → `hinge`;
- axle + beam hole → `bearing`.

This allows a shaft to be mechanically supported by the chassis without locking its rotation.

## Drivetrain analysis

`drivetrain.js` derives a shaft graph from the placed model.

### Shaft grouping

All non-motor `axle ↔ axle-hole` links are unioned into one shaft. An `Axle Coupler` part has two axle-hole endpoints so the powered shaft can be extended from a motor to longer axles, gears and wheels.

### Automatic gear meshing

Two spur gears are considered meshed when:

- they belong to different shafts;
- their axes are parallel;
- their faces are close on the axial direction;
- the center distance is close to the sum of their pitch radii.

For gear A driving gear B:

```text
RPM_B = -RPM_A × teeth_A / teeth_B
```

The sign is corrected for opposite shaft-axis orientation.

Example:

```text
Motor / Gear 8T: +120 RPM
        ↓
Gear 24T:        -40 RPM
```

### Gear coupling preview

Motor-driven shafts are controlled by the actual motorized revolute joint. Shafts driven only through detected gear meshes receive angular-velocity targets before each Rapier step.

This is currently a kinematic drivetrain preview, not a full torque-conserving gear constraint. It gives correct target RPM and direction and lets wheels/gears visibly respond, but it does not yet calculate tooth force, backlash, motor stall or torque transfer.

## Telemetry

SIMULATE now mounts a drivetrain panel showing:

- number of detected motors;
- driven shaft count;
- automatic gear-mesh count;
- target RPM per powered shaft;
- ratio relative to the motor;
- tooth-count ratios for detected gear pairs;
- drivetrain conflicts when multiple paths imply incompatible RPM.

## Next physics work

1. Add torque limits / motor stall behaviour.
2. Measure actual shaft RPM from Rapier bodies and compare it with target RPM.
3. Add wheel-ground slip telemetry.
4. Add differential semantics.
5. Add gearbox selector / clutch relationships.
6. Add spring and damper suspension.
7. Move more collision shapes into explicit per-part collider metadata.
8. Add deterministic drivetrain test fixtures.

## Current limitation

The semantic gear layer intentionally does not use detailed tooth collision. Real tooth-to-tooth collision would be expensive, unstable at browser simulation rates and unnecessarily dependent on render geometry. BrickLab treats visible teeth as presentation and the drivetrain graph as the authoritative mechanical model.
