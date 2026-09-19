# Mechanics Next — fixed 12-stage roadmap

This checklist is the canonical progress counter for the Mechanics Next migration.
Do not renumber or redefine stages to make the counter look better.

1. [x] Branch isolation and legacy read-only boundary
2. [x] Mechanical core model, evidence hierarchy and stable identities
3. [x] Native LDraw/LDCad intelligence, inheritance and fingerprints
4. [x] Constraint model, 6D contact-bundle solver and assembly graph
5. [x] Native profile matching, axial fit, occupancy, placement and candidates
6. [x] Transmission graph, gears and compound differential equations
7. [x] Mouse-drag interaction solver and nonlinear displacement propagation
8. [x] Baseline-stable Motion Plan and scene application
9. [x] Compound mechanisms: U-joint, CV, actuator, shock/spring, clutch, shortcut decomposition and endpoint ownership
10. [x] Physics/Rapier core: structural joints, generalized couplings, compound member bodies, dynamics, release and rollback
11. [x] Production migration and full regression/migration gate
12. [ ] Legacy engine purge and final architecture cleanup

## Definition of done

A stage is checked only when its implementation exists in the branch, its dangerous edge cases have explicit regression tests, and unresolved behavior fails closed instead of silently guessing.

Stage 11 must not pass merely because Mechanics Next loads. It requires:
- native connectivity/semantics parity for the migrated scene;
- zero unresolved live connections;
- zero unresolved compound endpoint ownership;
- no physics-plan blockers;
- deterministic KINEMATICS behavior on the differential regression scenario;
- project persistence/history compatibility;
- explicit migration diagnostics;
- regression test suite green in a real Node/browser-capable environment.

Stage 12 may begin only after Stage 11 passes. Legacy code is then removed by ownership domain rather than hidden behind unused fallbacks.

## Stage 12 reopened

Stage 12 was reopened after a real BUILD interaction regression was reported on 2026-09-20. The previous completion gate did not cover the normal editor drag path for real Technic connectivity. Re-close Stage 12 only after real browser interaction verifies at minimum:

- Technic pin → Technic pin hole;
- Technic axle → axle/round Technic hole;
- spur/bevel gear → gear mesh placement;
- connection persistence through Save/Open;
- SIMULATE consumes the resulting native topology;
- no legacy mechanics owner or fallback is restored.
