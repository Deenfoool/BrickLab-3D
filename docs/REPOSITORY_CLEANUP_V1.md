# Repository Cleanup V1

Status: **COMPLETE**  
Architecture milestone: **1. Architecture Consolidation**  
Development branch: **`gh-pages`**

This cleanup removes historical files only when the production runtime, regression tests and current module graph prove that a newer authoritative implementation already owns the behavior.

## Removed physical files

Across two conservative passes the cleanup retires 22 duplicate, superseded or unreachable files (225,594 bytes / about 220 KiB).

### Pass 1 — superseded generations and shadowed compatibility files

The first pass removed 18 files (210,991 bytes / about 206 KiB):

- Legacy BUILD aliases whose public specifiers already resolve to authoritative implementations: `connections.js`, `snapping.js`, `connector-validation.js`, `structural-auto-weld-v2.js`.
- Superseded menu generations: `main-menu.js`, `main-menu.css`, `menu/main-menu-v2.js`, `menu/main-menu-v2.css`, `menu/main-menu-v3.js`, `menu/main-menu-v3.css`, `menu/project-preloader.js`.
- Superseded LDraw UI/runtime files: `ldraw/catalog-v1.js`, `ldraw/catalog-v1.css`, `ldraw/catalog-v2.js`, `ldraw/catalog-v2.css`, `ldraw/runtime-v1.js`, `ldraw/runtime-v2.js`.
- Superseded TEST UI: `testlab.js`.

### Pass 2 — proven unreachable leftovers

The second pass removes four more files (14,603 bytes):

- `drivetrain.css` — no production HTML link, runtime import or dynamic stylesheet load; the current drivetrain UI styling lives in the active production stylesheets.
- `test-scenarios-v2.js` — no consumer; `physics-v2.js` owns the authoritative runtime scenario definitions while `testlab-v2.js` owns TEST selection/presentation metadata.
- `torque-test-patch.js` — obsolete side-effect patch; torque-pull world setup, forces, scoring and telemetry are implemented directly by the active `physics-v2.js` path.
- `obstacle-test-patch.js` — obsolete side-effect patch; obstacle-course colliders/scoring are implemented directly by `physics-v2.js` and presentation decoration remains in the actively loaded `test-world-visuals-v2.js`.

The three removed TEST JavaScript files also lose their unused self-mappings from the production import map. They are not compatibility entry points and had no current consumers, so keeping aliases would only preserve misleading dead surface area.

## Compatibility aliases

Removing a historical physical file does not require breaking its old module specifier when a current equivalent is known and compatibility is useful. The production import map keeps these redirects:

```text
./connections.js              → Connector V4 connections bridge
./snapping.js                 → Connector V4 snapping bridge
./connector-validation.js     → connector-validation-v3.js
./structural-auto-weld-v2.js  → connector-physics-v3.js
./main-menu.js                → menu/main-menu-v5.js
./testlab.js                  → testlab-v2.js
./ldraw/catalog-v1.js         → ldraw/catalog-v3.js
./ldraw/catalog-v2.js         → ldraw/catalog-v3.js
./ldraw/runtime-v1.js         → ldraw/runtime-v3.js
./ldraw/runtime-v2.js         → ldraw/runtime-v3.js
```

This keeps old internal specifiers fail-safe while ensuring there is only one physical implementation to maintain for each retired compatibility path.

## Kept intentionally

Files are not deleted merely because their name contains `v1/v2/v3/v4` or because they are not loaded on every page. In particular, current production still intentionally uses:

- `menu/main-menu-v5.js` as the presentation layer over `menu/main-menu-v4.js`;
- `menu/main-menu-v4.css` and `menu/hero-reducer.js`;
- `menu/project-preloader-v4.js`;
- `ldraw/catalog-v3.js`, `ldraw/runtime-v3.js`, `ldraw/fast-loader-v1.js` and `ldraw/bootstrap-v1.js`;
- `testlab-v2.js`, `physics-v2.js` and `test-world-visuals-v2.js`;
- Connector V4 modules and the existing V3 compatibility/physics modules still imported by `runtime-extensions.js`.

Manual QA pages, tests, examples, documentation, `src/` and build configuration are retained because they remain connected to diagnostics, acceptance coverage or the local build/type-check workflow.

Recent but currently unconnected Parts 6 work is also retained unless it is independently proven superseded. Cleanup must not discard potentially newer visual/mechanical work merely because it has not yet been wired into `runtime-extensions.js`.

## Regression guard

`tests/repository-hygiene.test.mjs` verifies that retired files remain absent, compatibility specifiers resolve to current owners, removed TEST patch specifiers stay out of the production import map, and the live menu / TEST Lab / Physics / LDraw generations remain present.

The hygiene test is imported by `tests/architecture-contract.test.mjs`, so it runs through both existing architecture and Connector V4 acceptance commands:

```bash
npm run test:architecture
npm run test:connectors-v4
```

Future cleanup should follow the same rule: prove the file is unreachable or superseded, preserve a compatibility alias only when useful, add regression coverage, then delete the physical duplicate.
