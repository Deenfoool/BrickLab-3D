# Design Doctor V1 — Progressive Visual Build Diagnostics

Status: **COMPLETE (V1) — production browser validated 2026-09-12**  
Roadmap: `docs/ROADMAP_NEXT.md` → item 5  
Activation: `guidance/design-doctor-activation-v1.js`  
Runtime: `guidance/design-doctor-runtime-v1.js`  
Engine: `guidance/design-doctor-engine-v1.js`

## Purpose

Design Doctor is a scene-native diagnostic mode for BUILD. It does not replace Connector V4, Physics Guard, drivetrain analysis or Mechanical Intelligence. It converts their authoritative results into a common issue model and presents those issues at the affected scene objects.

The mode is intentionally not a modal error list. The user remains in the 3D viewport while the construction is analysed progressively.

## Production interaction — Quiet Mode

The first browser build proved that a scanner can become too intrusive when it reacts to every pointer event and automatically moves the camera. V1 therefore ships with a calm interaction policy:

1. Press **Doctor** in the BUILD viewport toolbar.
2. BrickLab starts a frame-budgeted scan.
3. Normal camera/selection pointer interaction does **not** trigger a new scan.
4. Only the currently open issue receives diagnostic emphasis; the whole model is not permanently recoloured.
5. Every located issue gets a viewport anchor marker.
6. The active issue gets a line and contextual floating card.
7. **Next issue** changes the active issue without moving the camera.
8. **Focus** is the only action that intentionally reframes the scene.
9. Real model/Connector graph/Smart Assembly mutations schedule a delayed rescan rather than rescanning after ordinary clicks.
10. Closing Doctor restores normal materials/UI state.

## Severity

- `error` — a supported invariant is broken or SIMULATE is known to fail closed.
- `warning` — the build is incomplete/suspicious according to reliable current data.
- `info` — BrickLab lacks enough evidence to make a mechanical conclusion, or analysis is pending.

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

Legacy and Connector V4 links are treated as one project connectivity context for diagnostics. Connector V4 remains authoritative for V4/LDraw relationships; legacy links remain supported for older/basic parts.

## V1 diagnostic families

### Project integrity

- missing part definition;
- missing instance identity;
- duplicate instance IDs.

### Connectivity

- connector-capable part not represented by either current legacy or V4 graph;
- duplicate V4 endpoint occupancy;
- Connector V4 audit failures, including invalid/missing/duplicate endpoint metadata and incomplete coverage.

### SIMULATE preflight

Design Doctor runs the same `buildPhysicsPlanV4()` and `hardenPhysicsPlanV4()` policy/safety logic used by Connector V4 physics planning, but does **not** create Rapier bodies or start simulation.

A blocker card contains the exact V4 reason. If endpoint hydration is not ready, Doctor reports an informational pending state instead of fabricating a blocker.

### Drivetrain

- drivetrain loop/speed conflicts from the existing analyzer;
- motor with no useful driven output path.

V4 keyed-shaft relationships are converted through the existing `drivetrainSemanticLinksV4()` path before drivetrain analysis.

### Mechanical Intelligence

- unresolved LDraw mechanical classification is informational, not an error.

### Assembly compatibility

- supported tire/rim families missing their mechanically compatible counterpart.

This uses the same curated Smart Assembly compatibility registry. It does not match by display name.

### Vehicle center of mass

A warning is emitted only when all placed objects have explicit positive `massKg`, at least four known wheel objects exist, and projected COM lies outside the wheel support footprint.

## Evidence-gated checks

Some roadmap families deliberately remain silent until BrickLab has reliable source data:

- unsupported/free shaft support requires support/bearing evidence;
- arbitrary mesh interpenetration is not inferred from coarse bounding boxes;
- speculative vehicle weight thresholds are not invented.

This is intentional fail-safe behavior.

## Progressive scheduling

Per-object inspection runs through `FrameBudgetScheduler` with a small frame budget. Connector integrity, Physics Policy/Safety, drivetrain analysis and COM are separate stages with browser-frame yields between them. A scan generation can be aborted and restarted cleanly after a real edit.

## Collider / simulation safety

Design Doctor never adds Three.js helper geometry to the construction scene. Anchors/cards/lines are DOM overlays inside `#viewport` and temporary material emphasis does not alter geometry, transform, connection, project state, collider input or physics session.

## Startup

A lightweight Doctor activation mounts immediately after the editor contract is available. Heavy runtime/engine code loads lazily on first use. Failure of Doctor never blocks BUILD.

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

## Browser validation

Production GitHub Pages validation was performed interactively on 2026-09-12. The Doctor toolbar control appeared and the scan/navigation behavior executed in the real editor. That run also exposed the overly aggressive first interaction policy; Quiet Mode was implemented from that feedback and is now the production behavior.

## Acceptance against roadmap item 5

V1 is complete:

- supported problems point to real scene objects/connections/endpoints where evidence exists;
- scan is progressive and frame-budgeted;
- diagnostic helpers do not affect collider or simulation state;
- error/warning/info are visually distinct;
- issue anchors/cards are scene-native;
- camera movement requires explicit **Focus**;
- exact Connector V4 SIMULATE blockers are surfaced without starting physics;
- connectivity uses the combined legacy + authoritative V4 project graph;
- unsupported conclusions remain evidence-gated rather than guessed.

The next roadmap item is **6 — Kinematics Mode**.
