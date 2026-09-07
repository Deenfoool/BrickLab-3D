# BrickLab suspension prototype

The first suspension implementation uses a spring-loaded revolute pivot rather than a linear shock absorber.

## Suspension Arm 5L

`Suspension Arm 5L` is a lab/prototype part registered by `lab-parts.js`.

It has:

- an integrated male `pivot` pin at one end;
- four normal `pin-hole` attachment points along the arm;
- `suspensionArm` mechanics metadata.

The pivot snaps directly into a compatible Technic hole, creating the normal BrickLab `hinge` graph edge. No extra pin body is required.

## Physics

`suspension-patch.js` extends `PhysicsSession.createJoint()` only for a hinge whose endpoint is the arm's designated pivot.

The joint is still a Rapier revolute joint, but it also receives:

```text
configureMotorPosition(restAngle, stiffness, damping)
```

Current prototype values:

```text
rest angle:  0 rad
stiffness:   7.5
 damping:    1.25
travel:      ±55°
```

Rapier's joint motor acts as a PD spring: stiffness pulls the arm toward its rest angle and damping resists relative angular velocity.

Ordinary hinges are unaffected and remain free-spinning.

## Telemetry

When one or more spring-loaded arms exist, SIMULATE adds a `SUSPENSION` telemetry section showing:

- arm number;
- approximate angular travel from the starting pose;
- spring stiffness;
- warning color near the travel limit.

The first travel reading is derived from the arm's world-quaternion change. Because the joint itself constrains motion to one axis, this is sufficient for the prototype, but later versions should calculate a signed joint coordinate directly from the physics layer.

## Current limitations

- This is torsion-spring suspension, not a telescoping shock.
- No bump stop/rebound stop force curve beyond the joint angle limits.
- No progressive spring rate.
- No anti-roll bar.
- No damper temperature/fade.
- No suspension-specific mass or unsprung-mass model yet.

A later linear shock part can use a prismatic joint or explicit spring/damper force once the vehicle chassis architecture is mature.
