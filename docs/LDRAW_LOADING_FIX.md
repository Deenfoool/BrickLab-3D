# LDraw loading recovery, 2026-09-12

Fixed the missing connection between the family library cards and the existing predictive loader. Visible/hovered/focused LDraw cards again participate in bounded warmup. Recent/Favorite warmup understands the new library storage keys as well as legacy entries.

Catalog insertion now waits for a prepared visual prototype before calling the native editor card. Preparation is visible in the library; failed/timed-out requests do not insert a placeholder and can be retried. BUILD/Kinematics is checked again after waiting. A warm prototype still inserts synchronously through the existing app path.

The transport shares top-level geometry/metadata text and caches successful responses. It uses the existing pybricks LDraw source plus its jsDelivr mirror, with per-request aborts and rejected-cache eviction. It validates text rather than accepting HTML error pages. No unrelated part or geometry is substituted on failure.

Three 0.180's parsed-data and geometry caches retain rejected promises. A version-contract-checked adapter evicts only rejected entries, preserving successful shared resources. Dependency preflight prevents Three's nested-part warning path from silently accepting incomplete geometry. No physical metadata/connector changes were introduced.

Existing failed scene instances can be repaired with **Загрузить детали сцены повторно** in the library footer (shown when failed instances exist). Repair replaces only the placeholder and preserves the instance, transform and graph. Changes of mode/project during repair cancel attachment. Project-created loading instances also get one automatic retry for transient failures.

Cold network latency cannot be zero. Preloading moves most waiting before insertion; session-cached prototypes avoid repeat network/parsing work. Permanently missing source files remain errors, not fabricated models. The existing external compact catalog-index URL returned HTTP 404 during investigation; the current registered-parts/ID fallback remains available. This patch does not claim to restore that third-party index.

Run `npm run test:ldraw-loading`. Includes real Three LDraw parsing with a failing/recovering child, missing nested geometry, mirror failover, request deduplication, timeout/retry, cache retention, UI predictive-card contracts and existing library tests.

`ldraw-loading-qa.html` exercises the production import map and loader with real 3708, 3894 and 3648 files, reports mesh/vertex counts, placeholder state, and cold/warm timings without requiring WebGL. Full editor WebGL smoke remains environment-limited as documented in PARTS_LIBRARY_V1.md.

## Published browser results

On 2026-09-12, the real production loader (not a geometry mock) returned:

| File | First preparation | Repeated preparation + instance | Vertices | Placeholder | Status |
| --- | ---: | ---: | ---: | --- | --- |
| 3708.dat (12L axle) | 644 ms | 0 ms rounded | 192 | false | ready |
| 3894.dat (Technic brick 1×6) | 1344 ms | 0 ms rounded | 6666 | false | ready |
| 3648.dat (24T gear) | 2059 ms | 0 ms rounded | 7704 | false | ready |

No application warnings/errors were recorded for these three runs. These are measurements from one browser session, not latency guarantees for other networks or parts. 40/40 loading/library tests and 7/7 repository-hygiene tests pass locally. Full editor insertion/rendering and the scene-repair button remain unverified in a WebGL-capable browser; the real parser, source requests and ready-instance creation are verified above.
