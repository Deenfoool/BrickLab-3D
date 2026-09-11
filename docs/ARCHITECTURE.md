# BrickLab 3D architecture

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

The contract is adapter-based so the existing monolithic `app.js` can be migrated incrementally without destabilising the editor. Until an adapter is bound, read-only object lookup can fall back to the object provider already attached to Connector V4.

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
viewport/UI extensions
```

Loading the architecture facade **after** the Connector V4 physics guard is intentional: `physics.createSession()` must observe the already guarded `PhysicsSession.create` path.

## Migration policy

Architecture Consolidation is incremental:

1. Add a stable boundary and regression tests.
2. Bind/migrate existing editor state to that boundary.
3. Migrate new features first; do not add new direct patch/global dependencies.
4. Move existing consumers subsystem-by-subsystem.
5. Delete duplicated legacy/runtime paths only after equivalent regression coverage exists.

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

Architecture boundary regression:

```bash
npm run test:architecture
```

Connector V4 acceptance remains the safety gate for connectivity/physics behavior:

```bash
npm run test:connectors-v4
```

The architecture test also checks that bootstrap ordering keeps the physics guard before the facade and the facade before `app.js`.
