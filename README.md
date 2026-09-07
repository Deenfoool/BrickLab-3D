# BrickLab 3D

**BrickLab 3D** is a browser-based mechanical construction sandbox focused on how builds work, not just how they look.

The long-term goal is to let users assemble brick/Technic-style mechanisms, run them in a physics simulation, inspect telemetry, and test vehicles, gearboxes, suspensions and engines in purpose-built scenarios.

## Current MVP

The repository currently contains the first interactive editor milestone:

- Three.js 3D viewport with orbit camera, lighting, shadows and grid.
- Searchable parts catalog with 12 procedural prototype parts.
- Bricks, plates, Technic-style beams, axles, pin, gears, wheel and motor placeholder.
- Click-to-add and click-to-select workflow.
- Move and rotate gizmos with 0.5-stud translation snap and 90° rotation snap.
- Duplicate and delete actions plus keyboard shortcuts.
- Inspector for position, rotation and color.
- Browser autosave using `localStorage`.
- `.bricklab` project export/import (JSON format).
- BUILD / SIMULATE / TEST mode shell.
- Prototype test course.
- Responsive UI suitable for GitHub Pages.

> The current geometry is deliberately procedural. It validates the editor UX and project data model first. LDraw geometry and real mechanical connector metadata are planned next.

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

## Architecture direction

```text
UI / Builder
    ↓
Part definitions ──→ geometry adapter (procedural now, LDraw later)
    ↓
Mechanical metadata
    ↓
Snap & connection graph
    ↓
Rapier physics
    ↓
Test scenarios + telemetry
```

A part should eventually describe more than geometry. Mechanical metadata will define connector positions and types such as `stud`, `pin-hole`, `axle-hole`, `gear`, `wheel-hub`, `hinge`, and `motor-output`.

## Roadmap

### Milestone 2 — real connections
- Connector metadata per part.
- Hole-to-hole / stud-to-stud snapping previews.
- Connection graph and rigid groups.
- LDraw loader experiment and asset strategy.
- Undo / redo history.

### Milestone 3 — physics
- Rapier 3D integration.
- Fixed, revolute and prismatic joints.
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

The project is designed to run entirely in the browser and can be hosted on GitHub Pages. `vite.config.ts` already uses `/BrickLab-3D/` as the production base path.

## Trademark / future LDraw note

BrickLab 3D is an independent project and is not affiliated with or endorsed by the LEGO Group. If/when LDraw assets are bundled or redistributed, their applicable license and attribution requirements must be followed.
