# Repository Cleanup V1

Status: **COMPLETE**  
Architecture milestone: **1. Architecture Consolidation**  
Development branch: **`gh-pages`**

This cleanup removes historical files only when the production runtime, regression tests and current module graph prove that a newer authoritative implementation already owns the behavior.

## Removed physical files

The cleanup retires 18 duplicate, superseded or import-map-shadowed files (210,991 bytes / about 206 KiB):

- Legacy BUILD aliases whose public specifiers already resolve to authoritative implementations: `connections.js`, `snapping.js`, `connector-validation.js`, `structural-auto-weld-v2.js`.
- Superseded menu generations: `main-menu.js`, `main-menu.css`, `menu/main-menu-v2.js`, `menu/main-menu-v2.css`, `menu/main-menu-v3.js`, `menu/main-menu-v3.css`, `menu/project-preloader.js`.
- Superseded LDraw UI/runtime files: `ldraw/catalog-v1.js`, `ldraw/catalog-v1.css`, `ldraw/catalog-v2.js`, `ldraw/catalog-v2.css`, `ldraw/runtime-v1.js`, `ldraw/runtime-v2.js`.
- Superseded TEST UI: `testlab.js`.

## Compatibility aliases

Removing a historical physical file does not require breaking its old module specifier. The production import map keeps compatibility redirects where a current equivalent is known:

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

This keeps old internal specifiers fail-safe while ensuring there is only one physical implementation to maintain for each retired path.

## Kept intentionally

Files are not deleted merely because their name contains `v1/v2/v3/v4`. In particular, current production still intentionally uses:

- `menu/main-menu-v5.js` as the presentation layer over `menu/main-menu-v4.js`;
- `menu/main-menu-v4.css` and `menu/hero-reducer.js`;
- `menu/project-preloader-v4.js`;
- `ldraw/catalog-v3.js`, `ldraw/runtime-v3.js`, `ldraw/fast-loader-v1.js` and `ldraw/bootstrap-v1.js`;
- `testlab-v2.js`;
- Connector V4 modules and the existing V3 compatibility/physics modules still imported by `runtime-extensions.js`.

Manual QA pages, tests, examples, documentation, `src/` and build configuration are also retained because they remain connected to diagnostics, acceptance coverage or the local build/type-check workflow.

## Regression guard

`tests/repository-hygiene.test.mjs` now verifies that retired files remain absent, old public specifiers resolve to current owners, and the live menu / TEST Lab / LDraw generations remain present.

The hygiene test is imported by `tests/architecture-contract.test.mjs`, so it runs through both existing architecture and Connector V4 acceptance commands:

```bash
npm run test:architecture
npm run test:connectors-v4
```

Future cleanup should follow the same rule: prove the file is unreachable or superseded, preserve a compatibility alias when useful, add regression coverage, then delete the physical duplicate.
