# BrickLab 3D

**BrickLab 3D** is a browser-based mechanical construction sandbox for building brick/Technic-style vehicles, drivetrains and mechanisms, then testing how they actually behave.

Core loop: **build → simulate → test → inspect telemetry → modify → test again**.

[**Open BrickLab 3D**](https://deenfoool.github.io/BrickLab-3D/)

![BrickLab 3D interface](portfolio/cover.png)

## Current state

### Builder

- Three.js scene with improved lighting, shadows and procedural part geometry.
- **80 prototype parts** covering bricks/plates, studded Technic bricks, full and thin liftarms, bent beams, axles, pins/connectors, spur gears, multiple wheel sizes, Lab Motor, F/N/R Gearbox, Open Differential, Bearing Block, Suspension Arm and sensors.
- **LDraw Parts Library integration:** a remote on-demand parts browser can search LDraw Design IDs, load real `.dat` geometry lazily, register selected pieces in the normal BrickLab catalog and preserve them through local saves and `.bricklab` import/export.
- LDraw primitive analysis currently recognises common stud/tube, Technic pin-hole and axle-hole connection features and converts them to BrickLab connectors.
- New Parts asset browser: default grid view, category chips with counts, Favorites, Recent parts, full-text/tag/ID search, `Ctrl/Cmd + K` search focus and persistent list/grid preference.
- Catalog-wide realistic molded-part visual pass: refined ABS/metal/rubber materials, Technic hole liners, axle detail bands, gear-face detail, power-unit fasteners, wheel sidewall/tread detail and studio PBR lighting.
- Decorative visual meshes are excluded from Physics v2 collider bounds, so visual detail does not change simulation geometry.
- Connector types: `stud`, `tube`, `pin`, `pin-hole`, `axle`, `axle-hole`.
- Connector System v3: strict snapping, keyed axles, multi-contact stud/tube links, graph validation, legacy migration and physics-side mechanical recovery.
- Undo/redo, autosave, `.bricklab` v2 import/export, multi-select and logical grouping.
- Floating Parts / Properties windows with drag, resize, List/Grid, collapsible inspector sections, Focus Scene and mobile drawers.
- RU / EN interface switch.
- Higher-resolution real 3D part previews in the catalog with contact shadow presentation.
- In-project `Esc` menu centralises Project, Settings, Physics, Audio and remappable Controls.

Scale is intentionally unavailable: arbitrary scaling would break mechanical dimensions and connector pitch.

## LDraw Parts Library

BrickLab does not vendor the full LDraw library into this repository. The runtime uses a version-controlled mirror and loads only the files required by parts the user actually selects.

The LDraw browser is available from the Parts panel. LDraw-backed pieces use IDs such as `ldraw-3001`, survive local saves and `.bricklab` import/export, and progressively gain BrickLab capabilities:

```text
visual → snap → mechanical
```

`visual` means real LDraw geometry can be built, coloured and saved. `snap` means standard LDraw primitives were recognised as BrickLab connectors. `mechanical` additionally requires explicit BrickLab drivetrain metadata such as gear teeth, shaft behaviour, wheel radius, steering or motor properties.

See [`docs/LDRAW.md`](docs/LDRAW.md) for the runtime architecture and current connector-inference rules.

## Physics v2

Rapier 3D runs a separate SI-scale physical world while the editor remains stud-based:

```text
1 stud = 0.008 m
mass    = kg
force   = N
torque  = N·m
speed   = m/s
power   = W
```

Physics v2 includes:

- explicit PHYSICS-6 stud↔metre boundary for bodies, colliders, joint anchors and render sync;
- per-part prototype masses and material/collision classes;
- inertia derived from collider mass/shape;
- weighted center of mass and approximate front/rear + left/right weight distribution;
- fixed physics timestep independent of render FPS;
- FAST 60 Hz / BALANCED 120 Hz / ACCURATE 180 Hz presets;
- CCD on Balanced/Accurate;
- self-collision OFF / MECHANICAL / FULL;
- corrected transformed colliders for rotated wheels/gears;
- physical hinge/bearing joints;
- finite motor torque and reaction torque;
- inertia-aware gear/gearbox/differential torque transfer that cannot overshoot light shafts by one microstep;
- wheel contact, normal load, slip ratio and slip angle without double-counting wheel rotation;
- load-sensitive longitudinal/lateral grip with impulse correction and a combined friction ellipse;
- rolling resistance and approximate weight transfer;
- surface presets: concrete, asphalt, dirt, gravel, mud and ice;
- suspension compression/rebound damping, bump stop and simple anti-roll coupling;
- finite-state validation after every Rapier microstep without runtime speed clamps.

Physics settings are available from **Esc → Settings → Physics**. `F8` toggles Physics Debug by default and can be remapped from **Esc → Controls**.

See [`docs/PHYSICS_V2.md`](docs/PHYSICS_V2.md) and [`docs/PHYSICS_STABILITY.md`](docs/PHYSICS_STABILITY.md).

## Motor and drivetrain

Prototype Lab Motor:

```text
no-load speed: 120 RPM
stall torque:  0.045 N·m
voltage:       9 V
```

Telemetry includes actual RPM, load, torque, current, mechanical/electrical power, efficiency and stall state.

`drivetrain.js` derives semantic shafts and relationships from the construction. It supports:

- automatic spur gear mesh detection;
- multi-stage RPM/torque propagation;
- F/N/R gearbox;
- open differential with independent left/right RPM;
- drivetrain conflict detection;
- requested/transmitted torque and loss accounting.

Gear pitch stays aligned to the editor grid:

```text
pitch radius = teeth / 16 stud
```

## TEST Lab

Physics v2 TEST uses a deterministic protocol:

```text
RESET → SETTLE 0.5 s → 3 → 2 → 1 → RUN
```

Motor drive is disabled until RUN. Scoring uses fixed physics time rather than render/wall-clock time.

### HILL

22° physical hill climb. Mass, COM, gearing, tyre grip, weight transfer and available torque determine the result. Best score: **lowest time**.

### PULL

Increasing reverse load measured in Newtons. Best score: **highest sustained force**.

### OBST

Threshold, articulation blocks, cross bump and bridge ramps test ground clearance, wheel contact and suspension travel. Best score: **lowest time**.

### DYNO

A dynamometer brake loads the drivetrain and records RPM, N·m, W, current and efficiency. Best score: **peak power**.

## Telemetry and CSV

Live telemetry reports:

- build mass and COM;
- body speed/acceleration;
- motor RPM/load/torque/current/power/efficiency;
- target/actual shaft RPM and torque capacity;
- gearbox/differential state;
- wheel ground speed, contact, normal load, slip ratio and slip angle;
- longitudinal/lateral tyre force;
- suspension state;
- input/output/loss energy view;
- Dyno curves.

Placeable `RPM Sensor` and `Torque Sensor` remain available.

CSV exports Physics v2 SI traces: fixed physics time, TEST phase/status, quality/surface, mass, speed, acceleration, RPM, torque, power, current, efficiency, Pull force, Dyno power, sensor channels and per-wheel contact/load/slip/forces.

## Physics Debug

The default `F8` binding shows:

- approximate collider bounds;
- COM marker;
- tyre contact points;
- contact normals;
- tyre force arrows;
- chassis velocity vector;
- suspension axes.

All non-system editor bindings can be changed from **Esc → Controls**. `Esc` itself remains reserved for the project menu.

## Production runtime

BrickLab is a no-build static site:

```text
index.html
  ↓
bootstrap.js
  ↓
runtime-extensions.js
  ├─ basic + expanded Technic part packs
  ├─ physical part DB
  ├─ realistic catalog-wide visuals
  ├─ Physics v2 + explicit stud↔metre boundary
  ├─ Connector System v3 + mechanical recovery
  ├─ corrected colliders
  ├─ inertia-aware drivetrain stability
  ├─ impulse-limited surface / tyre solver
  ├─ suspension v2
  ├─ SI telemetry / Dyno
  └─ physics debug + TEST visuals
  ↓
ldraw/bootstrap-v1.js
  ├─ restores dynamic ldraw-* definitions
  └─ prepares .bricklab imports containing LDraw parts
  ↓
app.js + workspace UI + TEST controller + i18n
  ↓
ldraw/catalog-v1.js
  ├─ remote LDraw index
  ├─ lazy DAT metadata / geometry
  └─ primitive → BrickLab connector inference
```

Expected GitHub Pages URL:

`https://deenfoool.github.io/BrickLab-3D/`

## Controls

Press `Esc` inside a project and open **Controls** to see or change the active bindings. BrickLab detects conflicts, can replace or clear individual bindings, and can restore the defaults.

Default bindings include:

| Action | Shortcut |
| --- | --- |
| Open / close project menu | `Esc` (fixed) |
| Move / Rotate | `M` / `R` |
| Delete | `Delete` |
| Duplicate | `Ctrl/Cmd + D` |
| Undo / Redo | `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` |
| Focus selection / frame all | `F` / `Home` |
| Front / side / top | `1` / `2` / `3` |
| Perspective / orthographic | `5` |
| Local / world axes | `Q` |
| Connector / grid snap | `Shift + S` / `Shift + G` |
| Select all | `Ctrl/Cmd + A` |
| Group / ungroup | `Ctrl/Cmd + G` / `Ctrl/Cmd + Shift + G` |
| Connector points / graph | `C` / `L` |
| Disconnect | `D` |
| Play / pause / reset physics | `Space` / `Shift + Space` |
| BUILD ↔ SIMULATE | `Tab` |
| Catalog search | `Ctrl/Cmd + K` |
| Physics Debug | `F8` |
| Save / export / import | `Ctrl/Cmd + S` / `Ctrl/Cmd + Shift + S` / `Ctrl/Cmd + O` |

## Documentation

- [`docs/LDRAW.md`](docs/LDRAW.md)
- [`docs/PHYSICS_V2.md`](docs/PHYSICS_V2.md)
- [`docs/PHYSICS_STABILITY.md`](docs/PHYSICS_STABILITY.md)
- [`docs/CONNECTORS.md`](docs/CONNECTORS.md)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/PROJECT_FORMAT.md`](docs/PROJECT_FORMAT.md)
- [`docs/POWERTRAIN.md`](docs/POWERTRAIN.md)
- [`docs/SUSPENSION.md`](docs/SUSPENSION.md)
- [`docs/SENSORS.md`](docs/SENSORS.md)
- [`docs/TESTS.md`](docs/TESTS.md)
- [`docs/WORKSPACE_UI.md`](docs/WORKSPACE_UI.md)
- [`docs/VISUAL_QUALITY.md`](docs/VISUAL_QUALITY.md)

## Current modelling limits

Physics v2 is designed for interactive browser simulation, not engineering FEA. Tyre contact is ray-based, drivetrain coupling is semantic rather than tooth-contact physics, flexible deformation is not simulated, and current part masses are prototype estimates. LDraw supplies visual geometry and some connection primitives, but advanced BrickLab mechanics still require explicit semantic metadata. The architecture keeps these values replaceable as BrickLab gains calibrated data.

## Trademark / LDraw note

BrickLab 3D is independent and is not affiliated with or endorsed by the LEGO Group.

Parts geometry provided by the LDraw Parts Library.
LDraw is an independent community project and is not affiliated with the LEGO Group.
