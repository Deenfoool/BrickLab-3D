# BrickLab 3D architecture

Architecture Consolidation V1 status: **COMPLETE**. See [`ARCHITECTURE_CONSOLIDATION_V1.md`](ARCHITECTURE_CONSOLIDATION_V1.md) for the closure record and roadmap-item-1 acceptance mapping.

BrickLab is a browser-native ES-module application served directly by GitHub Pages. The production runtime intentionally stays **no-build**: `index.html` owns the canonical import map and `bootstrap.js` starts subsystems in a controlled order.

This document describes the architecture after the first Architecture Consolidation milestone from [`ROADMAP_NEXT.md`](ROADMAP_NEXT.md).

## Stable subsystem boundary

New roadmap features should prefer the stable facade exposed as:

```js
globalThis.BrickLabSubsystems
```

The facade is installed by `architecture/runtime-v1.js` and reports its contract version through `BrickLabSubsystems.version`.

The current public boundaries are:

```text
BrickLabSubsystems
├─ editor
│  ├─ objects / selection / primarySelection
│  ├─ object identity
│  ├─ groups
│  ├─ projectState
│  └─ history commands
├─ parts
│  ├─ list / get / require
│  ├─ instantiate
│  ├─ connectors
│  ├─ mechanical metadata
│  ├─ physical metadata
│  └─ capability summary
├─ connectivity
│  ├─ build
│  └─ simulate
├─ mechanics
├─ physics
├─ telemetry
├─ projects
├─ testLab
└─ guidance
```

This facade is a **compatibility boundary**, not a rewrite and not a new source of truth. During migration it delegates to the existing production owners.

## Authority rules

### BUILD connectivity

There is one authoritative BUILD path:

```text
editor / future feature
        ↓
BrickLabSubsystems.connectivity.build
        ↓
Connector V4 runtime
        ↓
V4 graph / occupancy / placement
        ↓
legacy V3 bridge only where the current production bridge explicitly allows it
```

New features must not mutate the Connector V4 graph directly. They should use the facade or the documented Connector V4 API when implementing Connector V4 itself.

### SIMULATE physics planning

There is one authoritative SIMULATE path:

```text
editor / TEST
     ↓
BrickLabSubsystems.physics.createSession(...)
     ↓
PhysicsSession.create(...)
     ↓
Connector V4 physics guard
     ↓
fresh live V4 recertification
     ↓
physics policy + safety hardening
     ↓
Rapier session / certified constraints
```

The facade deliberately does **not** provide a bypass around the guard. If Connector V4 says a connection is not certified for physics, SIMULATE remains fail-closed.

## Editor contract

`BrickLabSubsystems.editor` is the integration point for scene objects, selection, groups, object identity, project state and history.

The contract is adapter-based so the existing monolithic `app.js` can be migrated incrementally without destabilising the editor. `architecture/editor-adapter-v1.js` is bound immediately after `app.js` starts and exposes the live object list, selection/primary selection, group semantics, project snapshot and undo/redo capability through this contract. Read-only object lookup can still fall back to the object provider attached to Connector V4 if the adapter is unavailable.

Roadmap features such as Design Doctor, Kinematics and the instruction generator should consume this editor contract instead of reaching into `app.js`, DOM helpers, selection hacks or patch internals.

## Part metadata

Part capability data has historically been spread across `parts.js`, part packs, `physical-parts.js`, LDraw runtime metadata and later refinement modules.

New consumers should use:

```js
BrickLabSubsystems.parts.get(partId)
BrickLabSubsystems.parts.mechanical(partId)
BrickLabSubsystems.parts.physical(partId)
BrickLabSubsystems.parts.connectors(partId)
BrickLabSubsystems.parts.connectivity(partId)
BrickLabSubsystems.parts.capabilities(partId)
```

Project consumers should likewise use `BrickLabSubsystems.projects.current()`, `save()`, `createNew()`, `requestImport()` and `exportProject()` instead of clicking editor controls themselves. The transitional editor adapter is the only layer allowed to translate those calls to the current UI implementation.

Returned metadata snapshots are cloned/frozen so analysis features do not accidentally mutate the production registry.

`parts.instantiate()` centralises editor instance identity (`instanceId`, `partId`, color and `instanceRoot`) while still calling the existing part factory.

## Current production startup

The important ownership order is:

```text
index.html import map
  ↓
bootstrap.js
  ↓
runtime-extensions.js
  ├─ native/basic/Technic part packs
  ├─ Parts 3–6 compatibility/refinement layers
  ├─ Physics v2
  ├─ drivetrain / vehicle / suspension / TEST support
  └─ audio / diagnostics
  ↓
LDraw bootstrap + fast loader
  ↓
Connector V4 runtime
  ↓
Connector V4 physics guard
  ↓
architecture/runtime-v1.js
  ↓
app.js
  ↓
architecture/editor-adapter-v1.js
  ↓
architecture/contract-assert-v1.js
  ↓
viewport/UI extensions
```

Loading the architecture facade **after** the Connector V4 physics guard is intentional: `physics.createSession()` must observe the already guarded `PhysicsSession.create` path.

`architecture/contract-assert-v1.js` turns the consolidated boundaries into a production invariant. Runtime readiness is blocked if editor/projects are not bound, BUILD/SIMULATE ownership changes, the physics guard is inactive, or documented core APIs disappear.

## Migration policy

Architecture Consolidation V1 is closed, but migration remains incremental behind the stable boundary:

1. Stable boundary and regression tests are in production.
2. Existing editor/project state is bound through the adapter.
3. New roadmap features must use the stable subsystem APIs and must not add new direct patch/global dependencies.
4. Existing internal consumers may move subsystem-by-subsystem when a focused change benefits from it.
5. Duplicated legacy/runtime paths are deleted only after equivalent regression coverage exists.

Do not rename layers merely to make version numbers disappear. A legacy module should only be removed when its ownership has actually moved and tests prove behavior stayed intact.

## Compatibility invariants

Architecture work must preserve all of these:

- existing `.bricklab` files continue to load;
- current local autosaves remain readable;
- LDraw lazy loading and dynamic `ldraw-*` definitions keep working;
- Connector V4 remains the structural owner for supported LDraw connectivity;
- unsupported Connector V4 mechanisms remain BUILD-only rather than receiving guessed physics;
- the Connector V4 physics guard remains fail-closed;
- the no-build GitHub Pages runtime remains valid;
- existing Parts 3–6, audio, menu/project and group behavior is not rewritten as part of consolidation.

## Tests

Architecture boundary and completion-contract regression:

```bash
npm run test:architecture
```

Connector V4 acceptance remains the safety gate for connectivity/physics behavior:

```bash
npm run test:connectors-v4
```

The architecture tests verify bootstrap ordering, editor/project binding, centralized part metadata/identity, explicit BUILD/SIMULATE ownership and the production fail-closed architecture assertion.
