# Performance Engine V1

Status: **COMPLETE**  
Roadmap milestone: **2. Performance Engine — Large Builds**  
Development branch: **`gh-pages`**

Performance Engine V1 removes full-scene SNAP work from the steady-state drag path and establishes reusable, frame-budgeted infrastructure for large-build diagnostics without replacing Connector V4, editor identity, or Physics ownership.

## Spatial queries

The runtime owns two incremental spatial hashes:

- a scene-part index keyed by conservative world-space bounding spheres;
- a Connector V4 endpoint index keyed by endpoint world position and axial/profile reach.

The index is built progressively through a frame-budgeted queue. While it is starting, rebuilding, or detects stale scene membership, SNAP deliberately returns to the established full target scan. This makes performance acceleration fail-safe rather than a new source of missed connections.

During TransformControls drag, only the moving part/group is refreshed. A ready index returns a small local part set to legacy V3 discovery and a still smaller endpoint-local object set to Connector V4. Candidate solving, ranking, hysteresis, activation certification, occupancy, commit validation and fail-closed Connector V4 behavior remain unchanged.

A synthetic regression fixture places more than 1,500 remote objects around one valid nearby target and verifies that the indexed search examines a small local subset while returning the same best V4 candidate as the full reference search.

## Analysis scheduling

`FrameBudgetScheduler` provides keyed, restartable whole-build work queues. Jobs process only within a small frame budget and yield before continuing. Scheduling a newer job with the same key aborts the stale generation cleanly.

This is the execution primitive intended for Design Doctor and other future whole-build analyses. Editing can invalidate an old scan without making the main thread finish obsolete work first.

## LDraw persistent parsed metadata

Parsed LDraw header metadata now has a versioned persistent cache. It prefers IndexedDB, falls back to localStorage, and finally to memory if browser persistence is unavailable. Records use a TTL and include the active LDraw runtime/parser generation in the cache namespace so stale parser generations are not reused.

The catalog path uses a thin metadata wrapper that re-exports the canonical `runtime-v3` module. Geometry, text, prototype and inference ownership therefore stay in the existing LDraw runtime; only the serializable parsed metadata is persisted across page reloads. Completed LDraw loads also seed the persistent metadata cache from the already-parsed definition without another network request.

## Rendering policy for V1

The performance pass intentionally does **not** convert editable BrickLab parts to broad `InstancedMesh` batches. Current objects carry per-instance selection, material, group, connector, mechanics and physics identity; merging them before a proven interaction contract would trade FPS for correctness bugs.

Three.js' camera/frustum culling remains the authoritative render visibility path, and Performance Engine adds no per-frame full-build update loop. Spatial rebuild work is frame-budgeted, unchanged objects are not remeasured during drag, and only the moving interaction is touched on SNAP queries. Safe instancing/LOD remains available for a later measured bottleneck (for example immutable background geometry) rather than being introduced speculatively.

Likewise, tiny LDraw header parsing remains on the main thread because worker startup/transfer overhead would exceed the work. The expensive category that matters for the next milestones—whole-build scans—now has a yielding/abortable scheduler and can be moved to a Worker when a pure-data analysis demonstrably benefits from it.

## Acceptance / roadmap done criteria

- **Large-build interaction:** synthetic 1,500+ object tests prove queries examine a local subset instead of every object.
- **SNAP:** after the index is ready, drag discovery no longer starts from the complete scene connector population; compatibility full scans exist only as startup/stale fallback.
- **Whole-build analysis:** scheduler tests prove work spans frame slices and a newer generation aborts/restarts stale work.
- **LDraw:** parsed catalog metadata survives runtime instances through versioned persistent storage while canonical geometry/prototype caches remain shared.
- **Safety:** Connector V4 BUILD authority and Connector V4 Physics Guard SIMULATE authority are unchanged. Performance acceleration can disappear entirely and correctness falls back to the pre-existing paths.
- **Deployment:** the implementation remains browser-native ES modules with no build step and no GitHub Actions dependency.

## Diagnostics

`globalThis.BrickLabPerformance.stats()` reports index readiness, indexed object/endpoint counts, query/fallback counts, examined candidate counts and scheduler statistics. `globalThis.BrickLabLDrawPersistentMetadata.stats()` reports persistent metadata hits, misses, writes, seeds and storage backend diagnostics.
