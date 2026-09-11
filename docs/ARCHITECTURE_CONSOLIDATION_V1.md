# Architecture Consolidation V1 — Closure Record

Status: **COMPLETE**  
Roadmap item: **1. Architecture Consolidation**  
Development branch: **`gh-pages`**

This record closes the first item of `ROADMAP_NEXT.md`. The milestone is intentionally a compatibility consolidation, not a rewrite of Connector V4, Physics v2, LDraw, Parts 3–6, audio, menus/projects or editor groups.

## Delivered boundaries

The stable facade is `globalThis.BrickLabSubsystems`.

It exposes documented subsystem APIs for:

- Editor: live objects, selection, primary selection, groups, object identity, project state and history commands.
- Parts / LDraw: definitions, centralized mechanical/physical/connectivity metadata, capability checks and instance creation.
- Connectivity: one BUILD-facing facade delegated to Connector V4 and its established compatibility bridge.
- Mechanics: drivetrain analysis and centralized mechanical metadata access.
- Physics: one session creation path that observes the already-installed Connector V4 physics guard.
- Projects: current project snapshot plus save/new/import/export actions.
- Telemetry, TEST Lab and Guidance: explicit adapter slots for later roadmap systems, avoiding new cross-cutting globals.

## Authoritative paths

BUILD connectivity:

```text
feature/editor → BrickLabSubsystems.connectivity.build → Connector V4 → approved compatibility bridge
```

SIMULATE planning:

```text
feature/editor → BrickLabSubsystems.physics.createSession
               → guarded PhysicsSession.create
               → live V4 recertification
               → hardened physics plan
               → Rapier
```

The architecture facade has no API that bypasses the Connector V4 physics guard. Unsupported or ambiguous mechanisms therefore remain fail-closed for SIMULATE.

## Editor migration

The current lexical editor remains intact to avoid a high-risk rewrite. `architecture/editor-adapter-v1.js` binds it to the stable contract after `app.js` initializes.

`editor-groups-v1.js` now exposes the actual captured selection and primary selection, so new features no longer need to infer selection from BoxHelpers or DOM state.

Project actions are exposed through `BrickLabSubsystems.projects`; only the transitional adapter translates those calls to the existing UI implementation.

## Compatibility

Existing project files remain on the current `.bricklab` v2 shape. The adapter preserves legacy graph data from autosave/project state and supplies live Connector V4 records separately. No project migration was introduced by this milestone.

The no-build GitHub Pages startup order remains:

```text
runtime extensions
→ LDraw runtime
→ Connector V4 runtime
→ Connector V4 physics guard
→ Architecture API
→ app.js
→ editor/projects adapter
→ Architecture contract assertion
→ UI extensions
```

## Regression and acceptance coverage

Architecture-specific coverage is provided by:

```bash
npm run test:architecture
```

It verifies centralized part metadata/identity, editor/project adapters, BUILD/SIMULATE ownership, fail-closed contract checks and production bootstrap ordering.

The architecture tests are also included in the Connector V4 acceptance command so subsystem-boundary changes stay coupled to the existing connectivity safety gate:

```bash
npm run test:connectors-v4
```

Existing Connector V4, Physics, LDraw and Parts acceptance suites remain the owners of their previous behavior; Architecture Consolidation does not replace them.

## Roadmap item 1 done criteria

- **New roadmap features can use documented subsystem APIs without reaching into unrelated patch internals:** complete; `BrickLabSubsystems` is the supported boundary and `docs/ARCHITECTURE.md` documents it.
- **Existing project files still load:** preserved; project schema/load code was not replaced, and the adapter keeps `.bricklab` v2 compatibility.
- **Connector V4/Physics safety remains fail-closed:** preserved and runtime-asserted; BUILD/SIMULATE authority plus the physics guard owner are checked before runtime readiness.
- **Existing acceptance suites remain valid:** no core Connector V4/Physics/LDraw/Parts owner was rewritten; architecture regression tests are added to the existing Connector V4 acceptance command.
- **No-build runtime remains working:** preserved; the architecture facade and assertion are browser-native ES modules loaded by `bootstrap.js`.

## Legacy cleanup policy after closure

Closing this milestone does **not** mean deleting every historical `v2/v3/v4` filename. Those names are now implementation detail behind stable boundaries. A legacy module is removed only when a later focused change has equivalent regression coverage and can prove the runtime owner has actually moved.

New roadmap features should not add new direct dependencies on editor lexical state, Connector V4 globals, `PhysicsSession.create`, or patch-module internals when an equivalent `BrickLabSubsystems` API exists.
