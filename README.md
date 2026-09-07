# BrickLab 3D

**BrickLab 3D** is a browser-based mechanical construction sandbox focused on how builds work, not just how they look.

The long-term goal is to let users assemble brick/Technic-style mechanisms, simulate them, inspect telemetry, and test vehicles, gearboxes, suspensions and engines in purpose-built scenarios.

## Current MVP

- Three.js 3D viewport with orbit camera, lighting, shadows and grid.
- Searchable catalog with 12 procedural prototype parts.
- Bricks, plates, Technic-style beams, axles, pin, gears, wheel and motor placeholder.
- Move / rotate gizmos with grid and 90° rotation snapping.
- Mechanical connector metadata and compatible connector snapping.
- Duplicate, delete and keyboard shortcuts.
- Inspector for transforms, connector count and color.
- Browser autosave via `localStorage`.
- `.bricklab` JSON export/import.
- BUILD / SIMULATE / TEST mode shell.
- Prototype test course.

> Geometry is deliberately procedural for the first milestone. The next visual layer will use LDraw while keeping editor and mechanical metadata independent from geometry.

## GitHub Pages

BrickLab follows the same no-build Pages deployment pattern used by the portfolio repository:

1. The production site is plain browser-ready HTML/CSS/JS in the repository root.
2. `index.html` loads `app.js` with relative paths.
3. Three.js is pinned to `0.180.0` and loaded as ES modules through jsDelivr.
4. `.nojekyll` is included.
5. `.github/workflows/pages.yml` uploads the repository root directly with `actions/upload-pages-artifact` — no `npm install` and no Vite build are required for deployment.

Expected Pages URL:

`https://deenfoool.github.io/BrickLab-3D/`

The TypeScript/Vite source under `src/` remains available as development source, but GitHub Pages does not depend on it.

## Local development

For the TypeScript development version:

```bash
npm install
npm run dev
```

The root static version can also be served by any local static HTTP server. Do not open `index.html` directly through `file://`, because browser ES modules require HTTP(S).

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

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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
- RPM / torque sensors and telemetry.

### Milestone 5 — test worlds
- Hill climb.
- Obstacle course.
- Pull / torque bench.
- Gearbox bench.
- Build constraints and challenges.

## Trademark / future LDraw note

BrickLab 3D is an independent project and is not affiliated with or endorsed by the LEGO Group. If LDraw assets are bundled or redistributed, their applicable license and attribution requirements must be followed.
