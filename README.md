# BrickLab 3D

**BrickLab 3D** is a browser-based mechanical construction sandbox focused on how builds work, not just how they look.

The goal is to assemble brick/Technic-style mechanisms, simulate them, inspect telemetry, and test vehicles, gearboxes, suspensions and drivetrains in purpose-built scenarios.

## Current state

### Builder

- Three.js viewport with orbit camera, lighting, shadows and grid.
- About 19 procedural prototype parts including bricks, plates, Technic beams, Axle 3L / 5L / 7L, coupler, gears, wheel, Lab Motor, F/N/R Gearbox, Open Differential, Bearing Block and Suspension Arm.
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

Scale is intentionally out of the editor for now because arbitrary scaling would break connector spacing and mechanical dimensions.

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

The top bar now exposes:

- **F** — `+1.0` drive ratio;
- **N** — drivetrain coupling removed, output free;
- **R** — `-1.0` reverse ratio.

Changing F/N/R while physics is running restarts the simulation with the new drivetrain graph.

A wrench button next to the selector loads `examples/powertrain-bench.bricklab`, a ready-made motor → gearbox → bearing → wheel test fixture. The previous project gets its own backup and can be restored with the same button.

### Open Differential

The first `Open Differential` prototype has:

- one input;
- left and right half-shaft outputs;
- independent output shafts;
- prototype 50/50 torque budget split;
- 0.92 efficiency.

This is a useful first vehicle differential, but not yet the exact spider-gear equation for asymmetric wheel speed. See [`docs/POWERTRAIN.md`](docs/POWERTRAIN.md).

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

## Live telemetry

SIMULATE currently reports:

- motor RPM / load / torque / stall;
- target and actual shaft RPM;
- shaft torque capacity;
- transmission ratio;
- physical gear meshes;
- F/N/R gearbox state;
- Open Differential presence;
- whole-build speed and acceleration;
- wheel ground speed and slip;
- suspension arm travel;
- drivetrain conflicts.

## TEST — Hill Climb

The first physics test is **Hill Climb 22°**:

- visible Three.js ramp;
- matching Rapier collider;
- finish gate;
- progress and altitude;
- vehicle speed / acceleration;
- drivetrain load;
- `RUNNING`, `STALLED`, or `PASSED` result;
- run timer, retry and local best time.

The built-in **Demo** button loads a Starter Hill Climber while preserving the previous build for Restore.

## GitHub Pages

BrickLab uses a no-build Pages deployment:

1. browser-ready HTML/CSS/JS lives in the repository root;
2. Three.js is loaded as pinned ES modules;
3. Lucide is loaded as a pinned browser bundle;
4. Rapier is lazy-loaded only when physics starts;
5. `.nojekyll` is present;
6. `.github/workflows/pages.yml` publishes the repository root directly.

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

## Architecture

```text
UI / Builder
    ↓
Part definitions + lab-parts extension
    ↓
Connector metadata
    ↓
Snap + orientation engine
    ↓
Persistent connection graph
    ↓
Shaft graph + gears + gearbox + differential
    ↓
Finite-torque Rapier physics
    ↓
Suspension / RPM / load / speed / slip telemetry
    ↓
TEST scenarios
```

Documentation:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/PROJECT_FORMAT.md`](docs/PROJECT_FORMAT.md)
- [`docs/PHYSICS.md`](docs/PHYSICS.md)
- [`docs/POWERTRAIN.md`](docs/POWERTRAIN.md)
- [`docs/SUSPENSION.md`](docs/SUSPENSION.md)

## Next

- exact open-differential wheel-speed constraint;
- selectable multi-ratio gearbox beyond F/N/R;
- placeable RPM / torque sensors and time-series graphs;
- linear shock / spring part;
- contact-aware tyre grip;
- explicit part mass and collider metadata;
- Obstacle Course, Pull/Torque Bench and Gearbox Bench challenges;
- curated LDraw geometry adapter.

## Trademark / LDraw note

BrickLab 3D is an independent project and is not affiliated with or endorsed by the LEGO Group. LDraw assets must be redistributed only with their applicable license terms and attribution.
