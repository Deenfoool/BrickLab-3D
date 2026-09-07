# BrickLab 3D

**BrickLab 3D** is a browser-based mechanical construction sandbox focused on how builds work, not just how they look.

The goal is to let users assemble brick/Technic-style mechanisms, simulate them, inspect telemetry, and test vehicles, gearboxes, suspensions and engines in purpose-built scenarios.

## Current state

### Builder

- Three.js 3D viewport with orbit camera, lighting, shadows and grid.
- Searchable catalog with 12 procedural prototype parts.
- Bricks, plates, Technic-style beams, axles, pin, gears, wheel and motor placeholder.
- Move / rotate gizmos with grid and 90° rotation snapping.
- Mechanical connector metadata for `stud`, `tube`, `pin`, `pin-hole`, `axle`, and `axle-hole`.
- Compatible connector snapping with automatic axis orientation before attachment.
- Free connector guides are blue, occupied connectors are orange, saved graph connections are green.

### Connection graph

- Explicit persistent graph edges with `fixed`, `hinge`, and `axle` kinds.
- Exclusive connector occupancy: an already-used connector cannot be snapped a second time.
- Moving a connected part breaks its existing links before a new connection is created.
- Inspector shows connector usage and links for the selected part.
- Manual **Disconnect all** action.
- Graph validation on import rejects missing or duplicate endpoints.

### Editing and projects

- Undo / redo history (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`).
- Duplicate and delete shortcuts.
- Browser autosave via `localStorage`.
- `.bricklab` JSON export/import using project format v2 with persisted connections.
- Backward restore support for old v1 local projects.

### Physics preview

`SIMULATE` is now an actual Rapier-backed physics mode rather than a placeholder:

- Rapier 3D compatibility build is loaded only when simulation starts.
- Gravity and a ground collider are created in-browser.
- Each placed part receives a dynamic rigid body and approximate box collider.
- `fixed` graph links are translated into Rapier fixed joints.
- `hinge` and `axle` links are translated into revolute joints.
- Play / Pause / Reset controls.
- Simulation is non-destructive: returning to BUILD restores the pre-simulation project state.
- Failed experimental joints are skipped and reported instead of crashing the whole editor.

The current colliders are intentionally approximate. Precise collision shapes, rigid-group optimization, motors, gear constraints and suspension come next.

## GitHub Pages

BrickLab follows the same no-build Pages deployment pattern used by the portfolio repository:

1. The production site is plain browser-ready HTML/CSS/JS in the repository root.
2. `index.html` loads `app.js` with relative paths.
3. Three.js is pinned to `0.180.0` and loaded as ES modules through jsDelivr.
4. `.nojekyll` is included.
5. `.github/workflows/pages.yml` uploads the repository root directly — no `npm install` and no Vite build are required for deployment.

Expected Pages URL:

`https://deenfoool.github.io/BrickLab-3D/`

The root browser modules are the production runtime. The earlier TypeScript/Vite prototype under `src/` is retained for reference but is not used by GitHub Pages.

## Controls

| Action | Control |
| --- | --- |
| Select | Left mouse button |
| Orbit camera | Right mouse button |
| Zoom | Mouse wheel |
| Move tool | `W` |
| Rotate tool | `E` |
| Undo | `Ctrl/Cmd + Z` |
| Redo | `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` |
| Duplicate | `Ctrl/Cmd + D` |
| Delete | `Delete` / `Backspace` |
| Clear selection | `Esc` |

SIMULATE also exposes Play/Pause and Reset controls in the viewport.

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
Rapier physics adapter
    ↓
Drivetrain systems + telemetry
    ↓
Test scenarios / challenges
```

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/PROJECT_FORMAT.md`](docs/PROJECT_FORMAT.md)
- [`docs/PHYSICS.md`](docs/PHYSICS.md)

## Roadmap

### Milestone 2 — connection graph

Completed:
- Persistent connections.
- Exclusive connectors.
- Automatic connector-axis orientation.
- Undo / redo.

### Milestone 3 — physics

Implemented foundation:
- Rapier lazy loading.
- Dynamic rigid bodies and ground collision.
- Fixed and revolute graph joints.
- Play / pause / reset.
- Non-destructive simulation state.

Next:
- Better per-part collider metadata instead of visual bounding boxes.
- Merge fixed graph components into compound rigid bodies for stability/performance.
- Validate hinge/axle local frames for all orientations.
- Wheel friction and wheel hubs.
- Motor torque / RPM model.
- Suspension springs / dampers.

### Geometry / LDraw track

- LDraw loader adapter.
- Small curated packed-part set first, not the entire official library.
- Proper LDraw attribution/license notice in-app before redistributing library files.
- Expand the curated catalog after loader, caching and performance are proven.

### Milestone 4 — drivetrain lab

- Gear meshing and tooth-count ratios.
- Differential and gearbox building.
- RPM / torque sensors and telemetry.

### Milestone 5 — test worlds

- Hill climb.
- Obstacle course.
- Pull / torque bench.
- Gearbox bench.
- Build constraints and challenges.

## Trademark / LDraw note

BrickLab 3D is an independent project and is not affiliated with or endorsed by the LEGO Group. LDraw assets must be redistributed only with their applicable license terms and attribution.
