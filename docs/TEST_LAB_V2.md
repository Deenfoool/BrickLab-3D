# TEST Lab 2.0

Status: **IMPLEMENTED — browser smoke pending**

TEST Lab 2.0 implements roadmap item 8 without replacing the existing HILL / PULL / OBST / DYNO presets or the fixed-step Physics v2 runtime.

## Preserved trusted presets

The four existing deterministic scenarios remain first-class presets:

- HILL — Hill Climb 22°;
- PULL — Pull / Torque Bench;
- OBST — Obstacle Course;
- DYNO — Dyno Bench.

They keep their existing best-result keys and continue to run at locked `1×` test time.

## Test Designer

The new `LAB` control opens a scene-test profile editor. A profile is independent of the current vehicle/project and can compose these modules:

- configurable incline;
- step / threshold;
- articulation blocks;
- cross-bump obstacle;
- bridge / ramp;
- surface zone (`concrete`, `asphalt`, `dirt`, `gravel`, `mud`, `ice`);
- progressive towing load;
- dyno brake;
- finish checkpoint.

Profiles are normalized before use. Dimensions, angles, loads, durations and torque are clamped to conservative production limits. Unknown module types are rejected rather than reaching the physics runtime.

Custom profiles are stored in `bricklab.test.profiles.v2` and therefore remain independent from `.bricklab` project files.

## Physics ownership

`testlab/runtime-v2.js` is an additive scenario layer over the established `PhysicsSession`:

- it does not create a second Rapier world;
- it adds only static test-world colliders/visuals to the active Physics v2 session;
- tire surface zones reuse the existing Physics v2 tyre-force model;
- towing load and dyno brake are applied through the established fixed-step session;
- success/failure uses physics time and chassis progress, never wall-clock time.

The normal BUILD / SIMULATE ownership and Connector V4 physics guard remain unchanged.

## Run history and comparison

Completed runs are stored as compact summaries in `bricklab.test.runs.v2`, capped at 24 records. Each run records:

- project name;
- test profile and result metric;
- PASS / STALLED status;
- elapsed physics time;
- peak pull force;
- peak motor/dyno power;
- top speed;
- max observed RPM;
- average wheel slip;
- peak wheel load;
- a compact down-sampled trace for speed/RPM/power/slip/load.

Running the same profile twice enables a `Latest vs previous` comparison. The UI reports signed percentage deltas and overlays the two speed traces against physics time.

## Acceptance / browser smoke

Before promotion to COMPLETE, verify in production browser:

1. HILL / PULL / OBST / DYNO still start and finish exactly as before.
2. Create a custom profile with at least three geometry modules and a finish checkpoint.
3. Create a mixed-surface profile and confirm the active tyre surface changes by Z zone.
4. Run a towing profile and confirm force ramps by physics time.
5. Run a custom dyno profile and confirm brake load/peak power complete at the configured duration.
6. Save, reload and rerun a custom profile without opening any project.
7. Run the same profile twice and verify comparison deltas plus the speed overlay.
8. Confirm changing project does not delete test profiles or run history.
9. Confirm BUILD, SIMULATE, Connector V4, Design Doctor and Kinematics initialize normally afterward.

## Deferred from roadmap item 8

Suspension-travel traces are recorded only when a suspension telemetry source exposes a stable travel metric. TEST Lab 2.0 does not invent one from mesh motion. Additional arbitrary repeated modules and richer multi-run chart selection can be layered on this profile schema without changing saved projects or Physics v2 ownership.
