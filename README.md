# BrickLab 3D

**BrickLab 3D** is a browser-based mechanical construction sandbox focused on how builds work, not just how they look.

The goal is to assemble brick/Technic-style mechanisms, simulate them, inspect telemetry, and test vehicles, gearboxes, suspensions and drivetrains in purpose-built scenarios.

## Current state

### Builder

- Three.js viewport with orbit camera, lighting, shadows and grid.
- 20+ procedural prototype parts including bricks, plates, Technic beams, Axle 3L / 5L / 7L, coupler, gears, wheel, Lab Motor, F/N/R Gearbox, Open Differential, Bearing Block, Suspension Arm and placeable sensors.
- Move / rotate gizmos with optional grid snapping and 90° rotation snapping.
- Mechanical connector metadata for `stud`, `tube`, `pin`, `pin-hole`, `axle`, and `axle-hole`.
- Automatic compatible connector snapping and axis orientation.
- Beam holes accept pins as hinges and axles as bearings.
- Free connectors are blue, occupied connectors orange, saved graph connections green.
- Perspective / orthographic camera modes and front / side / top views.
- World / local transform axes.

### UI and editing

- Lucide icons.
- In-app shortcut palette on `?`.
- Hotkeys use physical keyboard codes, so the main commands continue working with Cyrillic and Latvian layouts.
- `Shift+Click` multi-selection and `Ctrl/Cmd+A` select-all.
- Logical grouping / ungrouping.
- Undo / redo history.
- Browser autosave.
- `.bricklab` v2 export/import with persisted mechanical connections.
- Compatibility migration for legacy Lab Motor mount connector IDs.

Scale is intentionally out of the editor because arbitrary scaling would break connector spacing and mechanical dimensions.

## Connection graph

Persistent graph edge kinds:

- `fixed` — rigid stud/tube attachment;
- `hinge` — free revolute pin connection;
- `bearing` — axle supported by a normal Technic hole while remaining free to rotate;
- `axle` — keyed axle/axle-hole coupling that transmits rotation.

Already-used connector endpoints cannot be consumed a second time.

## Physics

`SIMULATE` is backed by Rapier 3D:

- gravity and ground collision;
- compound rigid bodies for fixed brick groups and rigid keyed shafts;
- revolute hinge / bearing joints;
- higher-friction wheel colliders;
- semantic gear interaction rather than unstable tooth collision;
- non-destructive simulation reset back to BUILD state.

### Finite motor torque

The Lab Motor uses a simplified finite-torque model instead of an unlimited velocity lock.

Prototype values:

```text
no-load speed: 120 RPM
stall torque:  5.5 BrickLab torque units
```

Load can pull actual RPM below target RPM and eventually produce a real `STALL` state. Reaction torque is applied back into the motor housing.

Motor telemetry includes RPM, load %, torque, estimated current, and stall state.

Torque is still shown in internal BrickLab units (`T`), not N·m.

## Drivetrain

`drivetrain.js` derives a semantic shaft graph from the construction:

- rigid axle groups become shafts;
- Lab Motor seeds powered shafts;
- nearby coplanar spur gears are detected automatically;
- tooth count determines ratio and direction;
- RPM and available torque propagate through multiple stages;
- incompatible loops become drivetrain conflicts.

Gear pitch is aligned to the editor grid:

```text
pitch radius = teeth / 16 stud
```

So 8T + 24T and 16T + 16T both sit at exactly 2 stud center distance.

### F/N/R Gearbox

The `F/N/R Gearbox` has separate input and output shafts and is not merged into one rigid axle component.

The top bar exposes:

- **F** — `+1.0` drive ratio;
- **N** — drivetrain coupling removed, output free;
- **R** — `-1.0` reverse ratio.

Changing F/N/R during SIMULATE or any active TEST rebuilds the current physics session with the new transmission state.

A wrench button next to the selector loads `examples/powertrain-bench.bricklab`, a ready-made motor → gearbox → bearing → wheel test fixture. The previous project gets its own backup and can be restored with the same button.

### Open Differential

The `Open Differential` has one input and independent left/right half-shaft outputs.

The physics extension constrains the average half-shaft speed relative to carrier/input speed while leaving left-right RPM difference free, matching the useful open-differential relationship:

```text
ω_left + ω_right = 2 × ω_carrier
```

The prototype currently uses a 50/50 torque budget and 0.92 efficiency. Telemetry exposes left RPM, right RPM and ΔRPM.

See [`docs/POWERTRAIN.md`](docs/POWERTRAIN.md).

## Suspension

`Suspension Arm 5L` is the first spring-loaded vehicle suspension part.

Its integrated pivot pin snaps directly into a Technic hole. That normal `hinge` is upgraded at simulation time to a Rapier revolute joint using a PD spring:

```text
rest angle: 0
stiffness:  7.5
damping:    1.25
travel:     ±55°
```

SIMULATE shows approximate arm travel and highlights movement near the joint limit.

This is torsion-spring control-arm suspension, not yet a telescoping linear shock. See [`docs/SUSPENSION.md`](docs/SUSPENSION.md).

## Sensors and telemetry

Placeable lab sensors:

- `RPM Sensor` — reads actual shaft angular velocity from Rapier;
- `Torque Sensor` — reports the current semantic shaft torque estimate.

Live telemetry reports:

- motor RPM / load / torque / stall;
- target and actual shaft RPM;
- shaft torque capacity;
- transmission ratio;
- physical gear meshes;
- F/N/R state;
- Open Differential left/right RPM;
- whole-build speed and acceleration;
- wheel ground speed and slip;
- suspension arm travel;
- drivetrain conflicts;
- live RPM + body-speed history graph.

The telemetry panel also exports **CSV**. Recorded samples include simulation time, scenario, test result state, body speed/acceleration, RPM, motor load, motor torque, Pull Bench force and any installed sensor channels.

See [`docs/SENSORS.md`](docs/SENSORS.md).

## TEST Lab

The TEST selector now has three physical scenarios:

### HILL — Hill Climb 22°

- visible Three.js ramp + matching Rapier collider;
- finish gate;
- progress and altitude;
- drivetrain load;
- `RUNNING`, `STALLED`, or `PASSED`;
- retry and local **best time**.

### PULL — Pull / Torque Bench

- continuously increasing reverse load on the chassis;
- finite motor torque and stall determine the result;
- current force displayed in BrickLab force units (`F`);
- retry and local **best sustained load**.

### OBST — Obstacle Course

- physical entry threshold;
- staggered articulation blocks;
- high cross bump;
- short two-ramp bridge;
- finish gate;
- retry and local **best time**.

This course is intended to expose poor ground clearance, unstable chassis layouts and suspension-travel limitations.

The built-in **Demo** button loads a Starter Hill Climber while preserving the previous build for Restore.

## GitHub Pages

BrickLab uses a no-build Pages deployment.

Production runtime now enters through a deterministic module chain:

```text
index.html
   ↓
bootstrap.js
   ↓
runtime-extensions.js
   ├─ lab parts
   ├─ suspension
   ├─ differential
   ├─ sensors
   ├─ pull test
   └─ obstacle test
   ↓
app.js
   ↓
testlab.js + powertrain-ui.js
```

This guarantees that catalog additions and PhysicsSession extensions are registered before project restore and before the first simulation.

Three.js and Lucide remain pinned browser dependencies; Rapier is lazy-loaded only when physics starts. `.github/workflows/pages.yml` publishes the repository root directly without npm/Vite build requirements.

Expected URL:

`https://deenfoool.github.io/BrickLab-3D/`

## Keyboard controls

| Action | Shortcut |
| --- | --- |
| Move | `M` |
| Rotate | `R` |
| Quick move | `G` |
| Delete | `X` / `Delete` / `Backspace` |
| Duplicate | `Ctrl/Cmd + D` |
| Undo | `Ctrl/Cmd + Z` |
| Redo | `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` |
| Clear selection | `Esc` |
| Focus selection | `F` |
| Frame whole build | `Home` |
| Front / side / top | `1` / `2` / `3` |
| Perspective / orthographic | `5` |
| Local / world axes | `Q` |
| Connector snapping | `Shift + S` |
| Grid snapping | `Shift + G` |
| Reset rotation | `Alt + R` |
| Reset position | `Alt + G` |
| Select all | `Ctrl/Cmd + A` |
| Multi-select | `Shift + Click` |
| Group selected | `Ctrl/Cmd + G` |
| Ungroup | `Ctrl/Cmd + Shift + G` |
| Connector points | `C` |
| Connection graph | `L` |
| Disconnect selected | `D` |
| Mechanics properties | `I` |
| Rotate selected ±90° | `[` / `]` |
| Play / pause simulation | `Space` |
| Reset simulation | `Shift + Space` |
| BUILD ↔ SIMULATE | `Tab` |
| Save | `Ctrl/Cmd + S` |
| Export `.bricklab` | `Ctrl/Cmd + Shift + S` |
| Import `.bricklab` | `Ctrl/Cmd + O` |
| New project | `Ctrl/Cmd + N` |
| Shortcut palette | `?` |

Mouse: left click selects, `Shift+Click` toggles multi-selection, right mouse orbits, wheel zooms.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/PROJECT_FORMAT.md`](docs/PROJECT_FORMAT.md)
- [`docs/PHYSICS.md`](docs/PHYSICS.md)
- [`docs/POWERTRAIN.md`](docs/POWERTRAIN.md)
- [`docs/SUSPENSION.md`](docs/SUSPENSION.md)
- [`docs/SENSORS.md`](docs/SENSORS.md)

## Next

- selectable multi-ratio gearbox beyond F/N/R;
- linear shock / spring part;
- contact-aware tyre grip;
- explicit part mass and collider metadata;
- Gearbox Bench / dynamometer challenge;
- calibrated physical units;
- curated LDraw geometry adapter.

## Trademark / LDraw note

BrickLab 3D is an independent project and is not affiliated with or endorsed by the LEGO Group. LDraw assets must be redistributed only with their applicable license terms and attribution.
