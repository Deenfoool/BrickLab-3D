# BrickLab TEST Lab

TEST reuses the same non-destructive Rapier session as SIMULATE but adds a scenario-specific environment, scoring and local best result.

The selected scenario is stored in `localStorage` under `bricklab.test.scenario.v1`.

## HILL — Hill Climb 22°

Goal: reach the finish gate as fast as possible.

The scenario adds an 18-unit ramp at 22°, a matching static Rapier collider, high-friction surface, finish gate, progress and altitude telemetry.

Result states:

- `RUNNING` — vehicle is still attempting the climb;
- `STALLED` — low chassis speed persists while motor load is high;
- `PASSED` — chassis reaches the finish region.

Score: lowest completed time. Best result is stored locally.

## PULL — Pull / Torque Bench

Goal: sustain as much opposing force as possible before drivetrain stall.

The scenario applies a reverse force to the monitored chassis body. Load starts low and increases continuously until the configured maximum.

Prototype settings:

```text
start force: 1.5 F
maximum:    18.0 F
ramp rate:   1.35 F/s
```

`F` is an internal BrickLab force unit, not Newtons.

Score: highest force sustained before `STALLED`, or the maximum load when `PASSED`.

## OBST — Obstacle Course

Goal: cross a compact suspension/clearance course as quickly as possible.

Physical obstacles include a low threshold, staggered articulation blocks, high cross bump, short bridge ramps and a finish gate. The course exposes insufficient clearance, wheel contact, grip, chassis stability and suspension travel.

Score: lowest completed time.

## Transmission changes during TEST

Changing F/N/R while a TEST is active restarts the selected scenario. This ensures the drivetrain graph and semantic gearbox couplings are rebuilt before the next run.

## Retry and records

Each scenario has a Retry action in the TEST telemetry card. Records are independent and live only in browser `localStorage`; they are not uploaded.

## Automated Connector V4 acceptance

Connector System V4 has a dedicated Node/Rapier regression suite:

```bash
npm run test:connectors-v4
```

It covers:

- strict LDCad Shadow parsing and resolver behavior;
- pinned upstream fixtures and spec regressions;
- connector shape matching and placement;
- endpoint identity, interval occupancy and graph persistence;
- production snapping/connection bridges;
- live physics recertification rather than trusting persisted `physicsReady` flags;
- Rapier prismatic/cylindrical DOF masks;
- the axle/hole zero-impulse regression relevant to the historical 12L axle instability class;
- dynamic disengagement of open axial profiles;
- multi-stud aggregation into one rigid physics constraint;
- round rotational/sliding family activation;
- ball/socket and normal hinge policy;
- fail-closed locking hinge and generic-group policy;
- production import-map/cache-generation consistency.

The Connector V4 acceptance command also runs `tests/import-map-integrity.test.mjs`, because loading two incompatible connector generations in one browser page is considered a runtime correctness failure rather than only a deployment/cache issue.

## Runtime extension order

Scenario physics extensions are registered from `runtime-extensions.js` before `app.js` is evaluated. `bootstrap.js` initializes Connector V4 and its physics guard before the editor can start SIMULATE, then loads the debug/UI layers in deterministic order.
