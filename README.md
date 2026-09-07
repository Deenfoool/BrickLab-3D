# BrickLab 3D

**BrickLab 3D** is a browser-based mechanical construction sandbox focused on how builds work, not just how they look.

The goal is to let users assemble brick/Technic-style mechanisms, simulate them, inspect telemetry, and test vehicles, gearboxes, suspensions and engines in purpose-built scenarios.

## Current state

### Builder

- Three.js 3D viewport with orbit camera, lighting, shadows and grid.
- Searchable catalog with 14 procedural prototype parts.
- Bricks, plates, a studded Technic chassis brick, beams, axles, axle coupler, pin, gears, wheel and Lab Motor.
- Move / rotate gizmos with optional grid snapping and 90° rotation snapping.
- Mechanical connector metadata for `stud`, `tube`, `pin`, `pin-hole`, `axle`, and `axle-hole`.
- Compatible connector snapping with automatic axis orientation before attachment.
- Beam and Technic-brick holes accept pins as hinges and axles as rotational bearings.
- Free connector guides are blue, occupied connectors are orange, saved graph connections are green.
- Perspective and orthographic camera modes plus front / side / top views.
- World / local transform-space switching.

### UI and shortcuts

- Lucide icons are used for editor actions and controls.
- Shortcut labels are shown directly in the toolbar.
- `?` opens an in-app keyboard shortcut palette.
- Hotkeys use physical keyboard codes, so the main shortcuts continue working with Cyrillic and Latvian keyboard layouts.
- `Shift+Click` multi-selection and `Ctrl/Cmd+A` select-all.
- Logical grouping / ungrouping for selected parts.
- Connector snap, grid snap, connector-point visibility and connection-graph visibility can be toggled independently.

### Connection graph

- Explicit persistent graph edges with `fixed`, `hinge`, `bearing`, and `axle` kinds.
- `fixed`: stud/tube rigid attachment.
- `hinge`: pin through a normal Technic hole.
- `bearing`: axle through a normal Technic hole; the shaft is supported but can rotate.
- `axle`: keyed axle/axle-hole coupling that transmits rotation.
- Exclusive connector occupancy: an already-used connector cannot be snapped a second time.
- Moving a connected part breaks its existing links before a new connection is created.
- Inspector shows connector usage and links for the selected part.
- Manual **Disconnect all** action.
- Graph validation on import rejects missing or duplicate endpoints.

### Editing and projects

- Undo / redo history.
- Duplicate and delete shortcuts.
- Browser autosave via `localStorage`.
- `.bricklab` JSON export/import using project format v2 with persisted connections.
- Backward restore support for old v1 local projects.

## Physics and drivetrain

`SIMULATE` is an actual Rapier-backed physics mode:

- Rapier 3D compatibility build is loaded only when simulation starts.
- Gravity and ground collision run in-browser.
- Fixed brick assemblies and rigid keyed shafts are merged into compound rigid bodies.
- `hinge` and `bearing` links become revolute joints.
- Wheels use higher-friction cylindrical colliders.
- Gear collision is deliberately kept inside the pitch circle because tooth interaction is semantic.
- Play / Pause / Reset controls.
- Simulation is non-destructive: returning to BUILD restores the pre-simulation project state.

### Finite motor torque

The Lab Motor no longer acts like an unlimited velocity controller.

BrickLab now applies finite motor torque through Rapier and reads the actual relative shaft RPM back from physics. The simplified prototype motor curve uses:

```text
no-load speed: 120 RPM
stall torque:  5.5 BrickLab torque units
```

Torque is highest near zero speed and falls as the output approaches its target RPM. Reaction torque is applied back into the motor housing, so a poorly supported or overloaded build can physically react instead of being magically locked in place.

Motor telemetry shows:

- actual RPM;
- load %;
- currently applied torque;
- estimated current;
- `STALL` state.

BrickLab torque units are intentionally not labelled N·m yet; the world mass/length scale still needs calibration.

### Drivetrain graph

`drivetrain.js` analyzes the mechanical build before simulation:

- rigid axle/axle-hole connections are grouped into shafts;
- Lab Motor connections seed the drivetrain;
- nearby coplanar spur gears are automatically detected as meshed;
- tooth count determines speed ratio and direction;
- RPM propagates through multiple gear stages;
- torque capacity propagates inversely with speed ratio and includes prototype mesh efficiency;
- incompatible motor / gear loops are reported as drivetrain conflicts.

Example:

```text
Motor + 8T:   +120 RPM
       ↓ 8:24
24T output:    -40 RPM
```

An 8T → 24T reduction also multiplies available torque by roughly 3× before mesh losses.

Detected gear pairs now exchange limited physical torque instead of forcing the output rigid body with `setAngvel()`. This allows load on the output to feed back into actual shaft speed.

### Gear pitch

Prototype gear pitch is aligned to the editor grid:

```text
pitch radius = teeth / 16 stud
```

So common pairs such as 8T + 24T and 16T + 16T sit at exactly 2 stud center distance.

## Live telemetry

SIMULATE opens a drivetrain panel with:

- motor RPM / load / torque / stall;
- powered shaft count;
- target and actual shaft RPM;
- shaft torque capacity;
- transmission ratio;
- detected gear meshes;
- drivetrain conflicts;
- whole-build/chassis speed;
- acceleration;
- wheel ground speed;
- wheel slip estimated from rim speed versus translational rolling speed.

Wheel speed is currently shown in BrickLab world units per second (`u/s`).

## TEST — Hill Climb

TEST is now a real physics scenario rather than only a decorative course.

The first test is **Hill Climb 22°**:

- visible Three.js ramp;
- matching static Rapier collider;
- 18-unit climb;
- finish gate near the top;
- body speed and acceleration;
- progress and altitude;
- drivetrain load;
- `RUNNING`, `STALLED`, or `PASSED` result.

The course rises along world +Z, matching the natural forward direction of a vehicle whose wheel axles run along X.

TEST reuses the same non-destructive simulation runtime, so returning to BUILD restores the original construction.

## GitHub Pages

BrickLab follows the same no-build Pages deployment pattern used by the portfolio repository:

1. Production is plain browser-ready HTML/CSS/JS in the repository root.
2. `index.html` loads `app.js` and `testlab.js` with relative paths.
3. Three.js is pinned to `0.180.0` and loaded as ES modules through jsDelivr.
4. Lucide is pinned to `1.42.0` and loaded as a vanilla browser bundle.
5. Rapier is lazy-loaded only when physics starts.
6. `.nojekyll` is included.
7. `.github/workflows/pages.yml` uploads the repository root directly — no `npm install` and no Vite build are required for deployment.

Expected Pages URL:

`https://deenfoool.github.io/BrickLab-3D/`

The root browser modules are the production runtime. The earlier TypeScript/Vite prototype under `src/` is retained for reference but is not used by GitHub Pages.

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

Mouse controls: left click selects, `Shift+Click` adds/removes from the selection, right mouse orbits the camera, and the mouse wheel zooms.

## Architecture

```text
UI / Builder
    ↓
Part definitions ──→ geometry adapter (procedural now, LDraw later)
    ↓
Connector metadata
    ↓
Snap + orientation engine
    ↓
Persistent connection graph
    ↓
Shaft graph + gear analysis
    ↓
Finite torque drivetrain
    ↓
Rapier physics
    ↓
RPM / load / speed / slip telemetry
    ↓
TEST scenarios
```

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/PROJECT_FORMAT.md`](docs/PROJECT_FORMAT.md)
- [`docs/PHYSICS.md`](docs/PHYSICS.md)

## Roadmap

### Implemented foundation

- Persistent connection graph and connector occupancy.
- Bearings and keyed shafts.
- Undo / redo and multi-selection.
- Rapier compound rigid bodies.
- Finite motor torque and stall detection.
- Automatic spur-gear meshing.
- Multi-stage RPM and torque propagation.
- Physical limited gear coupling.
- Target / actual RPM telemetry.
- Chassis speed and acceleration.
- Wheel slip telemetry.
- Hill Climb TEST.

### Next drivetrain work

- Differential.
- Clutch / neutral / selectable gearbox relationships.
- RPM and torque sensors as placeable parts.
- Time-series graphs.

### Next vehicle physics work

- Suspension springs / dampers.
- Contact-aware tyre grip.
- Explicit mass / collider metadata per part.
- Calibrated physical units.
- More TEST worlds: obstacle course, pull/torque bench, gearbox bench.

### Geometry / LDraw track

- LDraw loader adapter.
- Small curated packed-part set first, not the entire official library.
- Proper LDraw attribution/license notice in-app before redistributing library files.
- Expand the curated catalog after loader, caching and performance are proven.

## Trademark / LDraw note

BrickLab 3D is an independent project and is not affiliated with or endorsed by the LEGO Group. LDraw assets must be redistributed only with their applicable license terms and attribution.
