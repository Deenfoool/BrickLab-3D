# BrickLab Mechanics Next

Mechanics Next is the replacement mechanical reasoning engine for BrickLab 3D.

It is intentionally developed beside the production Connector V4 / Kinematics V1 stack. The old stack remains the production owner until a subsystem is explicitly handed over. There is no dual-write mode.

## Core pipeline

```
LDraw / native part data
        |
        v
Part Intelligence
        |
        v
Mechanical Descriptor
        |
        v
Connector + Contact Interpretation
        |
        v
Assembly Graph
   |           |
   v           v
Rigid Islands  Constraint Graph
        \     /
         v   v
      Transmission Graph
             |
             v
      Equation / DOF Solver
        |           |
        v           v
 Interaction      Rapier adapter
        |           |
        +-----> Three.js
```

## Non-negotiable invariants

1. **One owner per subsystem.** Snapping, graph mutation, kinematics, persistence and physics each have exactly one active owner.
2. **Legacy is import-only.** Historical `connectionsV4` payloads enter through the Mechanics Next project migration boundary; the live engine has no Connector V4 dependency.
3. **Mechanical state is not Three.js state.** Meshes are views of bodies; they are not the source of mechanical truth.
4. **Six degrees of freedom are explicit.** Every constraint resolves Tx/Ty/Tz/Rx/Ry/Rz to locked, free, limited or driven.
5. **Constraints compose.** Multiple joints are intersected. Impossible intersections become diagnostics instead of silent overrides.
6. **Transmissions are equations.** Gear meshes, rigid shaft coupling and differentials are solved bidirectionally; there is no "propagate from A to B" ownership assumption.
7. **Unknown is a valid result.** Geometry inference carries confidence and may refuse to activate destructive/physical behaviour.
8. **Stable identity.** Part, endpoint, body, constraint and transmission IDs must be deterministic across reloads.
9. **Incremental invalidation.** A local edit dirties only the affected mechanical component/island.
10. **Physics consumes mechanics.** Rapier receives validated bodies/constraints from this engine; Rapier does not infer assembly semantics.
11. **No special-case part IDs in the solver.** Family templates and descriptors may recognize known parts, but equations operate on semantics.
12. **Every decision is explainable.** The engine retains evidence, confidence and dependency paths for future debug UI.

## Ownership migration

Initial state:

| Domain | Owner |
|---|---|
| connector hydration | legacy-v4 |
| snapping / placement | legacy-v4 |
| connection persistence | legacy-v4 |
| assembly graph | legacy-v4 |
| kinematics | legacy-v1 |
| physics constraints | legacy-v4 |
| Mechanics Next | observe-only |

A domain is migrated only after:
- equivalent/new tests pass;
- project load/save migration exists;
- undo/redo and post-transform revalidation are covered;
- diagnostics can explain rejected/invalid state;
- the ownership ledger can switch the domain atomically.

After the final domain is handed over, the legacy engine is deleted rather than retained as a permanent compatibility path.

## Planned layers

- `core/` — schemas, deterministic IDs, confidence/evidence, ownership.
- `constraints/` — 6-DOF algebra and composed constraints.
- `topology/` — bodies, connections, rigid islands and dirty components.
- `transmission/` — gear, rack, worm, clutch, differential and compound-mechanism equations.
- `solver/` — equation solving, multi-driver conflicts and incremental updates.
- `intelligence/` — family templates, geometry inference and mechanical fingerprints.
- `interaction/` — drag-to-DOF drivers and manipulators.
- `simulation/` — friction, retention, slip, detents and breakage.
- `adapters/` — LDraw, legacy V4, Three.js and Rapier boundaries.
- `diagnostics/` — explanation graph, conflict traces and inspector model.

## Current milestone M0

M0 establishes a safe parallel foundation:
- independent schemas;
- ownership ledger;
- 6-DOF composition;
- assembly graph + rigid-island detection;
- bidirectional linear transmission equations;
- multi-driver/conflict-capable kinematic solver;
- read-only Connector V4 snapshot adapter;
- observe-only browser runtime.

No production ownership is transferred in M0.


## Research baseline

Mechanical semantics are grounded in an evidence hierarchy rather than part-ID guesses.
See [research/lego-mechanical-semantics.md](./research/lego-mechanical-semantics.md).

The implementation rule is: geometry defines topology, friction defines resistance, retention defines disengagement, and multiple contacts compose before rigidity is decided.
