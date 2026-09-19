# Mechanics Next — Stage 12 completion

Status: **COMPLETE**  
Date: **2026-09-19**  
Branch: **feature/mechanics-next-engine**

Stage 12 removes the remaining legacy runtime owners and leaves Mechanics Next as the sole production owner for BUILD connectivity, snapping, KINEMATICS, persistence of mechanical state and SIMULATE physics planning.

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
