# BrickLab 3D

**BrickLab 3D** is a browser-based mechanical construction sandbox focused on how builds work, not just how they look.

The long-term goal is to let users assemble brick/Technic-style mechanisms, simulate them, inspect telemetry, and test vehicles, gearboxes, suspensions and engines in purpose-built scenarios.

## Current MVP

The first interactive builder milestone is now in `main`:

- Three.js 3D viewport with orbit camera, lighting, shadows and grid.
- Searchable catalog with 12 procedural prototype parts.
- Bricks, plates, Technic-style beams, axles, pin, gears, wheel and motor placeholder.
- Click-to-add and click-to-select workflow.
- Move and rotate gizmos with 0.5-stud translation snap and 90° rotation snap.
- Mechanical connector metadata on parts.
- Connector guides rendered on the selected part.
- Automatic compatible snapping for `stud ↔ tube`, `pin ↔ pin-hole`, and `axle ↔ axle-hole`.
- Duplicate and delete actions plus keyboard shortcuts.
- Inspector for position, rotation, connector count and color.
- Browser autosave using `localStorage`.
- `.bricklab` project export/import (JSON format).
- BUILD / SIMULATE / TEST mode shell.
- Prototype obstacle course in TEST mode.
- Responsive UI prepared for GitHub Pages.

> Geometry is deliberately procedural in this milestone. It lets us validate the editor, connector semantics and project format before replacing visuals with LDraw assets.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Controls

| Action | Control |
| --- | --- |
| Select | Left mouse button |
| Orbit camera | Right mouse button |
| Zoom | Mouse wheel |
| Move tool | `W` |
| Rotate tool | `E` |
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
Snap engine
    ↓
Connection graph
    ↓
Rapier physics
    ↓
Test scenarios + telemetry
```

The connector layer is intentionally separate from geometry. A mesh describes appearance; connector metadata describes how a part can interact mechanically.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the planned connection and physics pipeline.

## Roadmap

### Milestone 2 — connection graph + LDraw
- Persist actual connections between snapped parts.
- Prevent invalid double-use of exclusive connectors.
- Snap orientation/alignment, not only connector position.
- Undo / redo history.
- LDraw loader experiment and asset/licensing strategy.

### Milestone 3 — physics
- Rapier 3D integration.
- Fixed, revolute and prismatic joints.
- Rigid groups generated from the connection graph.
- Axles, wheel hubs and basic suspension.
- Motor torque / RPM model.
- Play / pause / reset simulation.

### Milestone 4 — drivetrain lab
- Gear meshing and tooth-count ratios.
- Differential and gearbox building.
- RPM / torque sensors.
- Graph telemetry.

### Milestone 5 — test worlds
- Hill climb.
- Obstacle course.
- Pull / torque bench.
- Gearbox bench.
- Build constraints and challenges.

## Static hosting

The project is designed to run entirely in the browser. A GitHub Pages workflow is included in `.github/workflows/deploy-pages.yml`, and Vite uses `/BrickLab-3D/` as its production base path.

## Trademark / future LDraw note

BrickLab 3D is an independent project and is not affiliated with or endorsed by the LEGO Group. If LDraw assets are bundled or redistributed, their applicable license and attribution requirements must be followed.
