# Design Doctor V1 — Progressive Visual Build Diagnostics

Status: **IMPLEMENTED (V1) — browser smoke pending**  
Roadmap: `docs/ROADMAP_NEXT.md` → item 5  
Runtime: `guidance/design-doctor-runtime-v1.js`  
Engine: `guidance/design-doctor-engine-v1.js`

## Purpose

Design Doctor is a scene-native diagnostic mode for BUILD. It does not replace Connector V4, Physics Guard, drivetrain analysis or Mechanical Intelligence. It converts their authoritative results into a common issue model and presents those issues at the affected scene objects.

The mode is intentionally not a modal error list. The user stays in the 3D viewport while the construction is scanned progressively.

## User flow

1. Press **Doctor** in the BUILD viewport toolbar.
2. BrickLab starts a progressive scan using `FrameBudgetScheduler`.
3. The currently inspected part receives a temporary green diagnostic tint.
4. Parts with supported issues remain tinted by severity.
5. Every issue with a scene object gets a viewport anchor marker.
6. The active issue gets a line and contextual floating card.
7. The card provides **Focus**, **Explain**, and **Next issue**.
8. Edits, graph changes, Mechanical Intelligence changes and Smart Assembly installs schedule a fresh scan while Doctor is open.
9. Closing Doctor restores the original materials.

## Severity

- `error` — a supported invariant is broken or SIMULATE is known to fail closed.
- `warning` — the build is incomplete/suspicious according to reliable current data.
- `info` — BrickLab lacks enough evidence to make a mechanical conclusion, or analysis is pending.

The three severities use distinct marker/card colors and persistent diagnostic tinting.

## Authoritative diagnostic sources

Design Doctor consumes existing BrickLab logic instead of reimplementing it:

```text
Connector V4 graph + audit
        ↓
Physics Policy V4 + Physics Plan Safety V4
        ↓
Drivetrain analyzer + V4 drivetrain semantic links
        ↓
LDraw Mechanical Intelligence
        ↓
Smart Assembly mechanical compatibility registry
        ↓
Explicit physical mass / known wheel metadata
        ↓
Design Doctor issue model
        ↓
viewport markers + contextual cards
```

## V1 diagnostic families

### Project integrity

- missing part definition;
- missing instance identity;
- duplicate instance IDs.

### Connectivity

- connector-capable part that is not represented by the current project connection graph;
- duplicate V4 endpoint occupancy;
- Connector V4 audit failures, including invalid/missing/duplicate endpoint metadata and incomplete legacy coverage.

### SIMULATE preflight

Design Doctor runs the same `buildPhysicsPlanV4()` and `hardenPhysicsPlanV4()` policy/safety logic used by Connector V4 physics planning, but does **not** create Rapier bodies or start simulation.

A blocker card contains the exact V4 reason. Live-geometry failures are surfaced as collision/alignment issues. Constraint/locked/conflict reasons are surfaced as mechanism constraint conflicts.

If V4 endpoint hydration is not ready, Doctor reports an informational pending state instead of fabricating a blocker.

### Drivetrain

- drivetrain loop/speed conflicts from the existing analyzer;
- motor with no useful driven output path.

V4 keyed-shaft relationships are converted with the existing `drivetrainSemanticLinksV4()` path before drivetrain analysis.

### Mechanical Intelligence

- unresolved LDraw mechanical classification is informational, not an error.

### Assembly compatibility

- supported tire/rim families that are missing their mechanically compatible counterpart.

This uses the same curated Smart Assembly compatibility registry. It does not match by display name.

### Vehicle center of mass

A warning is emitted only when all placed objects have explicit positive `massKg`, at least four known wheel objects exist, and the projected COM lies outside the wheel support footprint. If those prerequisites are not met, no COM conclusion is made.

## Evidence-gated checks

Some roadmap families deliberately remain silent until BrickLab has reliable source data:

- unsupported/free shaft support: no warning is emitted merely because an axle exists; support/bearing evidence is required;
- arbitrary mesh interpenetration: generic bounding-box overlap is not used because valid LEGO/Technic geometry routinely overlaps coarse bounds;
- speculative vehicle weight thresholds: Doctor only uses the explicit COM-outside-wheel-support condition in V1.

This is intentional fail-safe behavior, not missing-name heuristics.

## Progressive scheduling

Per-object inspection runs through `FrameBudgetScheduler` with a 3.5 ms budget. Connector integrity, Physics Policy/Safety, drivetrain analysis and COM are separated into later stages with a browser-frame yield between them. A scan generation can be aborted and restarted cleanly after edits.

The authoritative drivetrain and physics analyzers remain their own subsystem calls; Design Doctor does not fork their logic.

## Collider / simulation safety

Design Doctor never adds Three.js helper geometry to the scene.

Diagnostic tinting works by temporarily cloning the affected object's materials and changing emissive state. Original material references are restored when the mode closes or a new scan starts. No geometry, transform, connection, project state, collider input or physics session is modified.

All anchors/cards/lines are DOM overlays inside `#viewport`.

## API

Runtime global:

```js
globalThis.BrickLabDesignDoctor
```

Main methods:

```text
scan()
close()
next()
focus()
issues()
current()
status()
destroy()
```

The runtime is optional/fail-open. A Design Doctor import failure must never stop BUILD.

## Startup rule

Design Doctor starts immediately after the stable editor adapter is bound and is launched non-blocking, before later optional editor UI modules. This follows the same startup lesson learned from Smart Assembly: an unrelated late bootstrap failure must not silently prevent guidance/diagnostics from existing.

## Regression coverage

`tests/design-doctor.test.mjs` covers:

- curated tire/rim incomplete assembly diagnostics;
- unresolved LDraw metadata as information;
- connector-capable floating part detection;
- duplicate V4 endpoint occupancy;
- drivetrain conflict → real scene object mapping;
- progressive scan progress;
- severity ordering;
- production bootstrap ordering;
- scene-native DOM overlays;
- no `BoxHelper` / `scene.add()` diagnostic geometry;
- no polling loop;
- use of authoritative Physics Policy/Safety and drivetrain semantics.

## Acceptance against roadmap item 5

Implementation covers the roadmap V1 acceptance shape:

- reported V1 issues reference an actual scene object/connection/endpoint where that source exists;
- scan is progressive and frame-budgeted for per-object work, with yields between subsystem-wide stages;
- diagnostic visuals do not enter collider or simulation state;
- error/warning/info are visually distinct;
- issue anchors, contextual cards and Next issue navigation are scene-native;
- exact Connector V4 SIMULATE blockers are surfaced without starting physics;
- unsupported conclusions remain evidence-gated rather than guessed.

The remaining acceptance step is a real browser/WebGL smoke test on GitHub Pages. Do not promote this document to `COMPLETE` until the toolbar → scan → issue navigation flow has been observed in the production browser runtime.

The next roadmap dependency after validation is **item 6 — Kinematics Mode**.
