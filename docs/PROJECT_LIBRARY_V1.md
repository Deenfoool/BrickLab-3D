# Project Library V1

Status: **IMPLEMENTED — browser smoke pending**

Project Library V1 is the first implementation of roadmap item 7. It moves BrickLab from one local autosave slot to a multi-project local workspace without replacing the established `.bricklab` project format or editor import path.

## Storage model

The library uses IndexedDB database `bricklab.projects.v1` with two stores:

- `projects` — lightweight card metadata only;
- `snapshots` — full BrickLab project snapshots keyed by project id.

The active project id is a tiny localStorage pointer (`bricklab.projects.active.v1`). The existing `bricklab.project.v2` autosave remains compatible with the editor; Project Library does not make cloud storage a dependency.

Because cards and snapshots are separated, listing projects does not deserialize every full 3D project.

## Project cards

Each card contains:

- generated lightweight SVG preview derived from stored part positions/colors;
- project name;
- modified date;
- part count;
- connection count;
- current-project marker.

Supported actions:

- open;
- rename;
- duplicate;
- delete (non-active projects);
- export as `.bricklab`.

Opening a stored project deliberately uses the existing hidden `.bricklab` importer through a browser `File`/`DataTransfer` bridge. That keeps project validation, migration, LDraw loading and Connector V4 restoration on the existing authoritative code path instead of implementing a second scene loader.

## Templates

V1 includes four local starter templates:

- Empty project;
- Vehicle chassis;
- Drivetrain bench;
- Suspension test rig.

Templates use normal BrickLab part ids and normal version-2 project snapshots. They do not introduce special template-only parts or fake connections.

## Autosave coexistence

The active library project is refreshed from the Architecture Project API after meaningful editor interactions (viewport pointer commit, explicit save, external editor mutation, Smart Assembly install and tab visibility changes). The library does not poll the full project continuously.

Existing `.bricklab` import/export remains available. A user-imported `.bricklab` is captured as a new library project after the normal editor importer applies it.

## UI

A `Projects` button is mounted in the editor top bar. The modal contains:

- New / Import / Save current actions;
- quick-start templates;
- local project card grid;
- per-card actions.

The modal is bilingual using the current BrickLab interface language.

## Acceptance / browser smoke

Before this item is promoted to COMPLETE, verify in production browser:

1. Existing current build appears as a project card after first load.
2. Create at least two local projects and switch between them without data collision.
3. Rename and duplicate a project.
4. Delete a non-active project.
5. Export a stored project and re-import it through the existing `.bricklab` importer.
6. Create/open all four templates.
7. Reload the page and confirm the active project survives.
8. Confirm BUILD, Connector V4, Smart Assembly, Design Doctor and Kinematics still initialize normally.

Cloud/gallery sharing remains intentionally deferred until a backend/storage design is explicitly chosen, as required by the roadmap.
