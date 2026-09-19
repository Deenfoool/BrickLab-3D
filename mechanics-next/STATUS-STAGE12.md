# Mechanics Next — Stage 12 regression recovery

Status: **REOPENED — critical BUILD connectivity regression**  
Date: **2026-09-19**  
Branch: **feature/mechanics-next-engine**

Stage 12 removed the remaining legacy runtime owners, but its completion status was reopened after real editor use showed that core BUILD connections could fail. The previous gate remains historical evidence for migration/physics ownership; it is not sufficient proof of real BUILD snapping.

## Final verification

- Release gate: **686 passed, 0 failed**.
- Production build: **passed**.
- Import map: **283 canonical module URLs, 97 compatibility redirects, 0 dangling local targets**.
- Browser package fixture: **18 objects, 12 native stored constraints, migration gate 14/14, 14 joints, 5 couplers, 1 motor, 0 fallbacks**.
- Browser mode cycle: **BUILD → KINEMATICS → SIMULATE → BUILD** under Mechanics Next ownership.
- Blank-project browser smoke: SIMULATE entered with 0 bodies/0 joints and returned to `BUILD MODE · 0 parts · 0 connections · Mechanics Next`; an empty graph keeps KINEMATICS fail-closed at its migration gate.

Historical Connector V4 project records remain readable through a one-way import boundary. New saves omit `connectionsV4` and serialize canonical `mechanicsNext` state.


## Post-completion editor snap fix

After Stage 12 completion, the normal editor drag path exposed a gap that the direct browser fixture did not cover: structural editor edits could update the Three.js scene without synchronizing Mechanics Next scene membership immediately. A newly added or duplicated part could therefore be visible in BUILD while native candidate search still had no observer record for it.

Fixed after the Stage 12 gate:

- `app.js` now synchronizes Mechanics Next and schedules native BUILD handoff after add/remove/duplicate structural edits;
- `mechanicalInstance()` self-heals missing observer membership;
- `findCandidate()` self-heals the selected moving instance before native snap search;
- `tests/mechanics-next-editor-scene-sync.test.mjs` locks the editor-to-native snap wiring;
- the earlier release policy still gives connector snap priority over grid snap at mouse release.

These changes are post-Stage-12 correctness fixes; the full browser/release gate recorded above refers to the Stage 12 completion SHA, not the later editor snap wiring commits.

## Critical BUILD regression findings

Real manual BUILD use exposed failures that the Stage 12 browser fixture did not cover because that fixture created native links directly through `findCandidate()` / `commitCandidate()` rather than the normal editor drag/release path.

Verified defects found after reopening:

1. **Primitive Shadow includes were missing.** Real Technic parts such as `3701.dat` include `connhole.dat`, which lives under `p/connhole.dat` in the pinned LDCad Shadow Library. The native resolver tried `parts/` but not `p/`, so real Technic holes could disappear from native endpoint intelligence.
2. **Grid/inherited endpoint identities could collide.** Multiple holes expanded from one Shadow line could receive the same native endpoint ID because the adapter did not key the final transformed connector identity. That can corrupt occupancy and commit behavior.
3. **Native BUILD bypassed gear placement snapping.** After legacy ownership purge, structural native candidates were queried but the gear placement candidate path was no longer considered by `refreshSnap()`.
4. **LDraw bevel gears need native gear geometry.** The old UI helper depended on `definition.mechanics.gear`, while ordinary LDraw bevel gears are classified by Mechanics Next and may not have that legacy field.
5. **Editor structural mutations needed immediate native scene synchronization.** Add/remove/duplicate could update Three.js before the Mechanics Next scene observer saw the same instance.

Fixes now on the feature branch:

- Shadow include resolution searches both `parts/` and `p/` library roots;
- endpoint IDs prefer the final transformed connector signature, preserving unique grid/inheritance identities;
- real `3673` pin, `3705` axle and `3701` Technic-hole Shadow profiles have dedicated native compatibility and candidate regressions;
- editor add/remove/duplicate synchronizes Mechanics Next and reacquires native BUILD ownership;
- native BUILD considers gear placement candidates again;
- gear placement can derive center/axis/teeth/pitch radius from Mechanics Next `gearFrameForRecord()` instead of requiring legacy `mechanics.gear` metadata.

## Re-close criteria

The old **686 passed / browser fixture PASS** result above predates these fixes and must not be used to claim release readiness. Stage 12 remains open until the current branch HEAD passes the full release gate and a real browser/WebGL user-path smoke test performs actual editor drag/release for pin→hole, axle→hole and spur/bevel gear→gear, then verifies Save/Open and SIMULATE topology consumption. No publication to `gh-pages` or `main` should occur before that verification.
