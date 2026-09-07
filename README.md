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

### Physics and drivetrain

`SIMULATE` is an actual Rapier-backed physics mode:

- Rapier 3D compatibility build is loaded only when simulation starts.
- Gravity and a ground collider are created in-browser.
- Fixed brick assemblies and rigid keyed shaft assemblies are merged into compound rigid bodies.
- `hinge` and `bearing` links become revolute joints.
- A Lab Motor output becomes a motorized revolute joint and currently targets 120 RPM.
- The motor has four bottom tube mounting points so it can be fixed to a plate/chassis.
- Wheel colliders use higher-friction cylinders.
- Gear colliders are kept inside the pitch circle because tooth interaction is handled semantically.
- Play / Pause / Reset controls.
- Simulation is non-destructive: returning to BUILD restores the pre-simulation project state.

### Drivetrain graph

`drivetrain.js` analyzes the mechanical build before simulation:

- all rigid axle/axle-hole connections are grouped into shafts;
- Lab Motor connections seed shaft RPM;
- nearby coplanar spur gears are automatically detected as meshed using their pitch radii;
- tooth count determines speed ratio and direction;
- RPM propagates through multiple gear stages;
- incompatible motor / gear loops are reported as drivetrain conflicts.

Example:

```text
Motor + 8T gear:  +120 RPM
        ↓ 8:24
24T output gear:   -40 RPM
```

Gear-driven shafts currently receive Rapier angular-velocity targets. This is a practical browser simulation preview, not yet a torque-conserving tooth-force model.

### SIMULATE telemetry

Entering SIMULATE opens a drivetrain panel with:

- motor count;
- powered shaft count;
- detected gear meshes;
- target shaft RPM;
- **actual shaft RPM measured from the Rapier rigid body's angular velocity**;
- visual warning when actual RPM differs materially from the target;
- ratio relative to the motor;
- detected tooth-count ratios;
- drivetrain conflicts.

## GitHub Pages

BrickLab follows the same no-build Pages deployment pattern used by the portfolio repository:

1. The production site is plain browser-ready HTML/CSS/JS in the repository root.
2. `index.html` loads `app.js` with relative paths.
3. Three.js is pinned to `0.180.0` and loaded as ES modules through jsDelivr.
4. Lucide is pinned to `1.42.0` and loaded as a vanilla browser bundle.
5. Rapier is lazy-loaded only when SIMULATE starts.
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
Shaft graph + automatic gear mesh analysis
    ↓
Rapier physics adapter
    ↓
Target + actual drivetrain telemetry
    ↓
Test scenarios / challenges
```

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/PROJECT_FORMAT.md`](docs/PROJECT_FORMAT.md)
- [`docs/PHYSICS.md`](docs/PHYSICS.md)

## Roadmap

### Connection graph

Implemented:
- Persistent connections.
- Exclusive connectors.
- Automatic connector-axis orientation.
- Bearings and keyed shaft semantics.
- Undo / redo.

### Physics

Implemented foundation:
- Rapier lazy loading.
- Dynamic compound rigid bodies and ground collision.
- Revolute hinge / bearing joints.
- Motorized output shaft.
- Rigid shaft grouping.
- Wheel and gear collider specializations.
- Actual shaft RPM measurement.
- Play / pause / reset.
- Non-destructive simulation state.

Next:
- Torque limits and motor stall behaviour.
- Wheel slip / ground-speed telemetry.
- Suspension springs / dampers.
- More accurate per-part collider metadata.

### Drivetrain lab

Implemented foundation:
- Shaft graph.
- Automatic spur-gear meshing.
- Tooth-count ratios.
- Rotation direction propagation.
- Multi-stage RPM propagation.
- Drivetrain conflict detection.
- Target / actual RPM telemetry panel.

Next:
- Torque propagation.
- Differential.
- Clutch and selectable gearbox relationships.
- RPM / torque sensors and time-series graphs.

### Geometry / LDraw track

- LDraw loader adapter.
- Small curated packed-part set first, not the entire official library.
- Proper LDraw attribution/license notice in-app before redistributing library files.
- Expand the curated catalog after loader, caching and performance are proven.

### Test worlds

- Hill climb.
- Obstacle course.
- Pull / torque bench.
- Gearbox bench.
- Build constraints and challenges.

## Trademark / LDraw note

BrickLab 3D is an independent project and is not affiliated with or endorsed by the LEGO Group. LDraw assets must be redistributed only with their applicable license terms and attribution.
