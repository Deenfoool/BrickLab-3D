# BrickLab 3D

**BrickLab 3D** is a browser-based mechanical construction sandbox focused on how builds work, not just how they look.

The long-term goal is to let users assemble brick/Technic-style mechanisms, simulate them, inspect telemetry, and test vehicles, gearboxes, suspensions and engines in purpose-built scenarios.

## Current MVP

- Three.js 3D viewport with orbit camera, lighting, shadows and grid.
- Searchable catalog with 12 procedural prototype parts.
- Bricks, plates, Technic-style beams, axles, pin, gears, wheel and motor placeholder.
- Move / rotate gizmos with grid and 90° rotation snapping.
- Mechanical connector metadata for `stud`, `tube`, `pin`, `pin-hole`, `axle`, and `axle-hole`.
- Compatible connector snapping with automatic axis orientation before attachment.
- Explicit persistent connection graph with `fixed`, `hinge`, and `axle` links.
- Exclusive connector occupancy: an already-used connector cannot be snapped a second time.
- Moving a connected part breaks its existing links before a new connection is created.
- Free connector guides are blue, occupied connectors are orange, graph connections are green.
- Inspector shows used connectors and graph links for the selected part.
- Manual **Disconnect all** action for the selected part.
- Undo / redo history for build edits and connections (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`).
- Duplicate, delete and keyboard shortcuts.
- Browser autosave via `localStorage`.
- `.bricklab` JSON export/import, now using project format v2 with persisted connections.
- Backward restore support for old v1 local projects without a connection graph.
- BUILD / SIMULATE / TEST mode shell.
- Prototype test course.

> Geometry is deliberately procedural at this stage. The next visual layer will use LDraw while keeping editor, project format and mechanical metadata independent from geometry.

## GitHub Pages

BrickLab follows the same no-build Pages deployment pattern used by the portfolio repository:

1. The production site is plain browser-ready HTML/CSS/JS in the repository root.
2. `index.html` loads `app.js` with relative paths.
3. Three.js is pinned to `0.180.0` and loaded as ES modules through jsDelivr.
4. `.nojekyll` is included.
5. `.github/workflows/pages.yml` uploads the repository root directly — no `npm install` and no Vite build are required for deployment.

Expected Pages URL:

`https://deenfoool.github.io/BrickLab-3D/`

The root browser modules are the production runtime. The earlier TypeScript/Vite prototype under `src/` is currently retained for reference but is not used by GitHub Pages.

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

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/PROJECT_FORMAT.md`](docs/PROJECT_FORMAT.md).

## Roadmap

### Milestone 2 — connection graph + LDraw

Completed:
- Persist actual connections between snapped parts.
- Prevent invalid double-use of exclusive connectors.
- Snap orientation/alignment, not only connector position.
- Undo / redo history.

Next:
- LDraw loader experiment and asset/licensing strategy.
- Geometry adapter that can swap procedural parts for LDraw meshes without changing connector metadata.

### Milestone 3 — physics
- Rapier 3D integration.
- Fixed, revolute and prismatic joints generated from the connection graph.
- Rigid groups generated from fixed connections.
- Axles, wheel hubs and basic suspension.
- Motor torque / RPM model.
- Play / pause / reset simulation.

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

## Trademark / future LDraw note

BrickLab 3D is an independent project and is not affiliated with or endorsed by the LEGO Group. If LDraw assets are bundled or redistributed, their applicable license and attribution requirements must be followed.
