# Kinematics Mode V1

Status: **IMPLEMENTED (V1) — browser smoke pending**  
Roadmap: `docs/ROADMAP_NEXT.md` → item 6  
Activation: `kinematics/activation-v1.js`  
Runtime: `kinematics/runtime-v1.js`  
Solver: `kinematics/solver-v1.js`

## Purpose

KINEMATICS sits conceptually between BUILD and SIMULATE:

```text
BUILD → KINEMATICS → SIMULATE → TEST
```

It previews intended mechanical motion without starting Rapier. Gravity, mass, impact, tyre contact and collision impulses are intentionally absent. Every pose is temporary and the saved construction is restored when the mode exits.

## V1 user flow

1. Build a connected mechanism in BUILD.
2. Optionally select the part that should be the preferred driver.
3. Press **KINEMATICS / КИНЕМАТИКА** in the top mode bar.
4. BrickLab hydrates current Connector V4 endpoints and creates a read-only kinematic analysis from:
   - Connector V4 graph;
   - Connector V4 Physics Policy constraints;
   - existing drivetrain shaft/gear analysis;
   - V4 drivetrain semantic links.
5. Choose a driver from the Kinematics panel.
6. Move the rotation and/or axial-travel controls.
7. Exit Kinematics to restore the exact BUILD pose.

## Supported deterministic drivers

### Shaft / gear trains

The existing drivetrain analyzer supplies shaft groups and physical/semantic gear meshes. The selected driver shaft receives ratio `1`; rotation propagates breadth-first through gear/transmission links using their existing `ratioAB / ratioBA` values.

A contradictory closed ratio loop is reported as locked rather than forced into an arbitrary pose.

Differential branches are intentionally not auto-solved in V1 because one input does not uniquely determine two free outputs. They are reported as under-constrained.

### Connector V4 joints

Physics Policy V4 is reused to identify certified joint semantics. V1 exposes direct controls for:

- `revolute` → angular control;
- `prismatic` → axial control;
- `cylindrical` → angular + axial controls.

Fixed V4 joints are used to collect the rigid subassembly that must move with a driven joint side. If an alternate fixed path connects both sides of the driven joint, Kinematics reports the mechanism as locked instead of tearing the assembly apart.

Spherical joints are counted in the DOF summary but are not given an arbitrary one-axis driver in V1.

## DOF analysis

KINEMATICS counts `free` and `limited` degrees of freedom directly from the certified V4 constraint plan. It does not infer DOF from visual appearance.

Example panel output:

```text
Mechanism DOF  2
Shafts         3
Gear links     2
```

Uncertified V4 relationships remain visible as blockers and are excluded from direct joint driving.

## Project safety

KINEMATICS never calls `PhysicsSession`, Rapier or SIMULATE.

Before entering, it captures every live object pose plus the current read-only project snapshot. While active:

- BUILD editing controls are disabled;
- part-catalog placement is disabled;
- save/export/new/import shortcuts are blocked;
- temporary motion never enters undo/history or local storage;
- Connector V4's per-frame BUILD reconcile hook is suppressed so temporary poses cannot invalidate/persistently remove real graph connections.

On exit:

1. every original transform is restored;
2. the authoritative Connector V4 global is restored;
3. the original graph is reconciled again at the restored BUILD pose with `persist:false`;
4. normal BUILD UI resumes.

This keeps entering/leaving Kinematics non-destructive.

## Mode integration

The top-bar KINEMATICS button is mounted by a lightweight activation shell after the editor contract is ready. The heavy runtime is lazy-loaded only on first entry.

The existing app currently owns BUILD/SIMULATE/TEST internally. V1 therefore uses a compatibility mode shell rather than rewriting `app.js`: visually and through the Architecture API, KINEMATICS is the active mode; BUILD mutation paths are capture-blocked while temporary motion is active. Clicking BUILD/SIMULATE/TEST exits Kinematics first and then hands control back to the existing app mode owner.

A later Architecture Consolidation pass can move this compatibility shell behind a first-class editor mode adapter without changing solver semantics.

## Evidence-gated behavior

V1 deliberately does not guess:

- rack-and-pinion motion without reliable rack semantic metadata;
- suspension/steering linkage relations that are not represented by certified V4 joints;
- differential output split without an additional driver/load constraint;
- spherical-joint orientation from one arbitrary axis;
- collision clearance (that belongs to SIMULATE/Design Doctor evidence).

## Regression coverage

`tests/kinematics-mode.test.mjs` covers:

- certified DOF counting;
- deterministic gear-ratio propagation;
- contradictory gear-loop detection;
- differential under-constraint;
- revolute/prismatic/cylindrical control shapes;
- lazy mode activation;
- no Rapier / PhysicsSession path;
- temporary V4 reconcile suppression;
- project save/history protection;
- fresh bootstrap cache generation.

## Acceptance state

The implementation satisfies the V1 architecture for deterministic non-physics motion, but the roadmap item remains **browser smoke pending** until the production GitHub Pages runtime has visibly demonstrated:

1. KINEMATICS appears between BUILD and SIMULATE;
2. entering the mode does not start physics;
3. a shaft/gear train responds to the angle control with correct direction/ratio;
4. a certified revolute/prismatic/cylindrical joint moves deterministically;
5. exiting restores the exact BUILD pose and graph.
