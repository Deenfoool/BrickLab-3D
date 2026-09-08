# Physics stability — PHYSICS-6

PHYSICS-6 keeps the RUNTIME-5 drivetrain stability work and fixes the SI/editor unit boundary used by rigid bodies and joints.

## PHYSICS-6: stud ↔ metre boundary

BrickLab edits mechanisms in **studs**, while Rapier runs in SI units:

```text
1 stud = 0.008 m
```

Two transforms must therefore always cross an explicit unit boundary:

```text
Editor/connector position (stud) -> Rapier body/joint (m) : * 0.008
Rapier body translation (m)      -> Three.js editor (stud): / 0.008
```

Before PHYSICS-6, `colliders-v2.js` correctly converted rigid-body translations and collider dimensions to metres, but two inherited paths in `physics.js` still used editor units directly:

1. `bodyLocalPoint()` passed connector anchors such as a motor output at `1.75 stud` to Rapier as if the value were `1.75 m`. The correct anchor is `0.014 m`.
2. `syncObjects()` copied Rapier translations in metres directly back into Three.js transforms expressed in studs. A body at `2.5 stud` (`0.02 m`) could therefore be rendered around `0.02 stud` on the first physics sync.

This mismatch was especially visible on assemblies such as:

```text
motor -> axle coupler -> axle -> wheel
```

Separate drivetrain bodies appeared to jump apart when SIMULATE started, while Reset restored the original BUILD snapshot and made the jump look like a reset-induced rotation.

PHYSICS-6 makes `colliders-v2.js` the explicit SI boundary owner:

- all Rapier rigid-body translations are metres;
- all collider dimensions/offsets are metres;
- all joint anchors are metres;
- all Three.js/editor object transforms are studs;
- Rapier translations are divided by `studMeters` before syncing back to the editor scene.

Runtime diagnostics expose the boundary contract through:

```js
window.__bricklabPhysicsDiagnostics().units
```

Expected values include `studMeters: 0.008`, `jointAnchors: "meters"`, `rapierTranslations: "meters"`, and `editorTransforms: "studs"`.

## RUNTIME-5 root causes fixed

### 1. Gear coupling ignored angular inertia

The previous semantic gear/gearbox/differential solver generated torque from an RPM error multiplied by a fixed gain. On very light shafts/gears this could apply far more angular impulse than needed during one fixed microstep, overshoot the target ratio, then reverse on the next step. The oscillation injected energy and could produce runaway shaft RPM and vehicle speed.

RUNTIME-5 solves the coupling from the actual inverse angular inertia of both Rapier rigid bodies and the current fixed `dt`.

For a generic relation:

```text
wB = factor * wA
```

with torque `lambda` applied on B and the reaction torque applied on A, the solver computes the angular impulse required to remove the ratio error in one microstep, then limits that torque only by the real shaft/coupling torque capacities and efficiency.

This prevents overshoot while preserving the existing finite-torque / overload model.

The open differential uses the same inertia-aware idea for its carrier and both outputs.

### 2. Wheel rotation was counted twice in slip

The old tire model used `velocityAtPoint(contact)`, which already contains the rigid body's `omega × r` velocity, and also calculated `omega * radius` separately. That double-counted wheel rotation in the longitudinal slip calculation.

RUNTIME-5 now uses:

- wheel-center velocity for vehicle longitudinal/lateral speed;
- contact-point velocity for actual ground slip;
- `omega * radius` only once for rim telemetry/normalization.

### 3. Tire force could overshoot zero slip in one tick

Longitudinal and lateral grip remain limited by surface friction and load sensitivity, but are now also limited by the physical impulse required to remove the current contact slip over the current microstep:

```text
F_correction <= |v_slip| / (effectiveInverseMass * dt)
```

`effectiveInverseMass` includes both linear mass and angular inertia about the contact point. This is not a speed cap: it prevents a tire force from crossing through zero slip and injecting energy in the opposite direction.

Longitudinal and lateral forces are also projected into a friction ellipse so combined grip cannot exceed the surface limit in two axes at once.

## Numerical diagnostics

After every Rapier microstep, `validatePhysicsState()` checks translations and linear/angular velocities for `NaN`/`Infinity`. Finite values are never clamped. The runtime records:

```js
window.BrickLabPhysicsStability.diagnostics()
```

including peak linear speed, peak angular RPM and any numerical fault.

The standard diagnostics also include:

```js
window.__bricklabPhysicsDiagnostics()
window.__bricklabTimeDebug()
```

## Regression suite

`npm run test:physics` runs Time Scale and stability tests.

The stability suite covers:

- tiny-rotor gear ratios with 1:1, reverse, 3:1 and reverse 3:1;
- no large ratio overshoot from one inertia-aware coupling step;
- wheel contact slip with an impulse-limited tire force;
- a complete 120 RPM `powertrain-bench.bricklab` run;
- rejection of the previously observed explosive class of failures (>20 m/s body speed or >10,000 RPM angular speed in the regression bench);
- finite Rapier body transforms and velocities.

These bounds exist only in tests. Production physics does not clamp bodies to them.

## Time Scale

The RUNTIME-4 fixed-step Time Scale remains authoritative:

```text
0.5× -> half simulated time per real second
1×   -> real-time
2×   -> double simulated time
3×   -> triple simulated time
TEST -> forced 1×
```

The drivetrain, motor controller, suspension and tire solver all receive the same fixed microstep `dt`, so changing render FPS or Time Scale does not change the physical trajectory at the same simulation time.
