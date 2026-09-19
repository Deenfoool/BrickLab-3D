# Mechanics Next — Stage 12 legacy purge plan

Status: **COMPLETE (2026-09-19)**

Stage 12 must not start until Stage 11 is checked green in `mechanics-next/ROADMAP.md`.
This file is an execution map only. It exists so the final purge is deterministic and
does not accidentally remove visual, catalog, collider or migration evidence that is
still required by Mechanics Next.

## Purge rule

Legacy code is removed by ownership domain, never by folder name.

A module may be deleted only when all of the following are true:

- the matching Mechanics Next domain is authoritative;
- the Stage 11 release gate is green in a real checkout;
- BUILD → KINEMATICS → SIMULATE → BUILD browser smoke is green;
- project Save/Open/Undo/Redo compatibility is green;
- no import-map or runtime import references remain;
- no retained visual/catalog/collider module imports the candidate as a side effect.

## Domain order

### 1. KINEMATICS ownership

Native owner:
- `mechanics-next/production/kinematics-owner.js`
- `mechanics-next/interaction/*`
- `mechanics-next/transmission/*`
- `mechanics-next/solver/*`

Legacy ownership candidates to remove after Stage 11:
- `kinematics/runtime-v1.js`
- `kinematics/solver-v1.js`
- `kinematics/drag-v1.js`
- `kinematics/rack-pinion-runtime-v1.js`
- `kinematics/rack-pinion-follow-v1.js`
- legacy-only engine-cam kinematic propagation when equivalent native compound behavior is verified.

Temporary shell to retain until the mode button is moved:
- `kinematics/activation-v1.js` may remain as a UI activation shell, but its legacy
  fallback import path must be deleted once Stage 12 starts.

Exit criterion:
- no runtime path can instantiate `BrickLabKinematics` from the legacy V1 runtime.

### 2. Physics constraints and mechanical force writers

Native owner:
- `mechanics-next/production/physics-owner.js`
- `mechanics-next/physics/*`

Legacy ownership candidates:
- legacy joint creation ownership in `joint-stability-v4.js`;
- legacy motor torque ownership in `physics-v2.js`;
- legacy drivetrain torque ownership in `physics-stability-v3.js`,
  `drivetrain-stress-v2.js` and
  `parts4/articulated-driveline-physics-v1.js`;
- legacy suspension writers in `suspension-patch.js`, `suspension-v2.js`;
- legacy Parts4 rack/steering/suspension mechanical writers in
  `parts4/steering-suspension-physics-v1.js`;
- Connector V4 mechanical joint planning/override layers that are no longer needed
  as a migration base.

Retain:
- generic Rapier world/body/collider creation used as a physical substrate;
- visual/collider metadata providers;
- telemetry/UI that reads the native session without writing competing mechanics.

Exit criterion:
- there is no `__mechanicsNextBypass` compatibility writer left because the writer
  itself has been removed or converted to non-owning infrastructure.

### 3. Connection graph and snapping

Native owner:
- `mechanics-next/connectors/*`
- `mechanics-next/topology/*`
- native connection interpretation in `mechanics-next/intelligence/*`

Legacy ownership candidates:
- Connector V4 graph mutation paths;
- V4 snapping placement ownership;
- V4 occupancy ownership;
- auto-link and stale graph reconcile paths;
- legacy V3 connection graph mutation bridges.

Retain until all LDraw/native parity evidence is migrated:
- LDCad Shadow snapshot/parser reference data used only as compatibility evidence;
- read-only migration adapters;
- catalog/discovery data that is still the source of part metadata.

Exit criterion:
- `adapters/legacy-v4-readonly.js` is the final legacy dependency and can itself be
  removed after parity evidence no longer requires runtime comparison.

### 4. Persistence/history bridges

Native owner:
- `mechanics-next/migration/project-state.js`
- native project graph/history integration in the editor adapter.

Legacy ownership candidates:
- `connectors-v4/history-sync-v4.js`;
- `connectors-v4/project-bridge-v4.js`;
- V4 connection persistence payload writers;
- obsolete project migration code whose only purpose is V3/V4 graph ownership.

Retain:
- one explicit import-only migration reader for old saved projects if historical
  project compatibility still requires it.

Exit criterion:
- saving a new project writes only canonical Mechanics Next mechanical state;
- opening old projects uses a one-way migration reader, never a second live graph.

### 5. Connector hydration

Native owner:
- `mechanics-next/ldraw/*`
- native endpoint semantics/intelligence.

Legacy candidates:
- V4 runtime hydration ownership and inheritance caches once equivalent native
  coverage is proven for the complete supported catalog.

Retain:
- official LDraw/LDCad source data;
- generic LDraw model loader;
- non-owning catalog metadata.

Exit criterion:
- no production connection candidate requires a V4 endpoint object.

## Files that must not be removed merely because they contain mechanics terminology

These are not automatically legacy ownership:

- visual fidelity modules under `parts5/` and `parts6/`;
- part catalog definitions and mechanical metadata;
- collider geometry and generic Rapier body creation;
- audio/telemetry/inspector code that only observes native state;
- LDraw model loading;
- project-library UI;
- Architecture API facade.

Each must be evaluated by behavior, not filename.

## Required Stage 12 sequence

1. Freeze a green Stage 11 release SHA.
2. Remove legacy KINEMATICS fallback and run full gate + browser smoke.
3. Remove legacy mechanical force/joint writers and run full gate + browser smoke.
4. Remove V4 graph/snapping mutation ownership and run full gate + browser smoke.
5. Collapse persistence/history to one canonical Mechanics Next format.
6. Remove runtime parity adapters that are no longer needed.
7. Clean import map and bootstrap imports.
8. Run repository-wide dead-import and canonical-import audit.
9. Run final BUILD → KINEMATICS → SIMULATE → BUILD smoke on existing and new projects.
10. Only then prepare the release merge/publish.

## Hard stop conditions

Abort the purge step immediately if any of these appears:

- a project opens with fewer connections than it saved;
- a moved/rotated connection survives when geometry is invalid;
- a valid long axle/pin loses interval occupancy;
- a differential becomes underdetermined from its carrier drive path;
- KINEMATICS or SIMULATE silently falls back to a legacy owner;
- two physics writers act on the same degree of freedom;
- import-map canonicalization resolves the same module to multiple generations.

The purge is complete only when there is one owner for every domain in
`MECHANICS_DOMAINS` and no runtime compatibility owner can re-enter after takeover.

## Completion evidence

- BUILD connection graph, snapping, KINEMATICS and SIMULATE ownership are published only by Mechanics Next.
- Historical `connectionsV4` is accepted only at the project import boundary; new snapshots write canonical `mechanicsNext` state.
- Connector V4 runtime, discovery, mutation bridges, history/project bridges and runtime parity adapters are removed from production.
- The canonical import-map audit reports no dangling local JavaScript targets.
- Final release gate: 686 tests passed, 0 failed, followed by a successful TypeScript/Vite production build.
- Real-browser package fixture: 18 objects, 12 native stored constraints, migration gate 14/14, 14 physics joints, 5 couplers, 1 motor, 0 fallbacks; BUILD → KINEMATICS → SIMULATE → BUILD completed under native ownership.
