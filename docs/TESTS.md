# BrickLab TEST Lab

TEST reuses the same non-destructive Rapier session as SIMULATE but adds a scenario-specific environment, scoring and local best result.

The selected scenario is stored in `localStorage` under `bricklab.test.scenario.v1`.

## HILL — Hill Climb 22°

Goal: reach the finish gate as fast as possible.

The scenario adds:

- an 18-unit ramp at 22°;
- a matching static Rapier collider;
- high-friction surface;
- finish gate;
- progress and altitude telemetry.

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

The current pull force is also included in exported telemetry CSV files.

## OBST — Obstacle Course

Goal: cross a compact suspension/clearance course as quickly as possible.

Physical obstacles:

1. low entry threshold;
2. staggered left/right articulation blocks;
3. high cross bump;
4. short two-ramp bridge;
5. finish gate.

The course is intended to expose:

- insufficient ground clearance;
- weak wheel contact;
- excessive wheel slip;
- unstable chassis geometry;
- insufficient suspension travel.

Score: lowest completed time. Best result is stored locally.

## Transmission changes during TEST

Changing F/N/R while a TEST is active restarts the currently selected scenario. This ensures the drivetrain graph and semantic gearbox couplings are rebuilt before the next run.

## Retry and records

Each scenario has a Retry action in the TEST telemetry card. Records are independent:

- Hill Climb best time;
- Pull Bench best sustained force;
- Obstacle Course best time.

Records live only in browser `localStorage` and are not uploaded.

## Runtime extension order

Scenario physics extensions are registered from `runtime-extensions.js` before `app.js` is evaluated. `bootstrap.js` then starts the editor and TEST controller in deterministic order.
