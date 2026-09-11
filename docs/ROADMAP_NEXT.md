# BrickLab 3D — Next Roadmap

Status: **active roadmap**  
Development branch: **`gh-pages`**  
Stable snapshot branch: **`main`**  
Roadmap baseline: `7dd1e0a883f358e16042fb207ebbc8517ae1c9ca`

## Branch policy

BrickLab has reached a stable milestone with Connector System V4, LDraw Fast Loader, improved SNAP discovery/ranking, Physics v2 and editor groups.

From this point forward:

- `main` is the stable snapshot branch.
- `gh-pages` is the active development branch and remains the GitHub Pages runtime branch.
- New feature development happens only in `gh-pages` unless explicitly decided otherwise.
- Stable milestones from `gh-pages` are promoted back into `main` after validation.
- Do not use GitHub Actions for BrickLab development or deployment.
- Do not rewrite working Connector V4, Physics v2, LDraw, Parts 3–6, audio, project/menu or group systems from scratch. Consolidation must preserve behavior through compatibility layers and tests.

The target is not simply “more parts”. The next phase turns BrickLab from a capable browser constructor into a mechanical CAD-lite / engineering sandbox with guided assembly, diagnostics, kinematics, testing and real build documentation.

---

# 1. Architecture Consolidation

## Goal

Reduce the growing dependency on layered `v2/v3/v4/...`, patch modules and cross-cutting globals without restarting the project.

The intended subsystem boundaries are:

```text
Editor
Parts / LDraw
Connectivity / Connector V4
Mechanics / Drivetrain
Physics
Telemetry / Sensors
Projects
TEST Lab
Guidance / Diagnostics
```

## Work

- Introduce stable subsystem APIs instead of direct cross-module mutation where possible.
- Move shared editor concepts such as selection, groups, history and object identity behind one editor-facing contract.
- Centralize part mechanical metadata access.
- Define one authoritative path for BUILD connectivity and one for SIMULATE physics planning.
- Reduce duplicated legacy/runtime code only after regression coverage exists.
- Keep the current no-build GitHub Pages runtime working during migration.

## What this gives us

- Faster feature development.
- Fewer regressions when one subsystem changes.
- Cleaner foundations for Design Doctor, Kinematics and the instruction generator.
- Easier performance profiling and caching.

## Done when

- New roadmap features can use documented subsystem APIs without reaching into unrelated patch internals.
- Existing project files still load.
- Connector V4/Physics safety behavior remains fail-closed.
- Existing acceptance suites remain valid.

---

# 2. Performance Engine — Large Builds

## Goal

Make builds with hundreds and eventually thousands of parts remain responsive.

## Work

### Spatial queries

- Add a scene spatial index for placed parts.
- Add a dedicated connector endpoint index for SNAP candidate lookup.
- Query only nearby objects/endpoints during drag and diagnostics.

### Rendering

- Frustum/camera-aware update budgets.
- Instancing where identical static visual geometry can safely share GPU resources.
- LOD or simplified distant representation for very large builds where useful.
- Avoid per-frame work for sleeping/unmodified editor objects.

### LDraw

- Persistent parsed metadata cache.
- Move expensive non-render parsing/analysis to Web Workers where practical.
- Keep critical click loads ahead of background prefetch.

### Analysis scheduling

- Frame-budgeted work queues for Design Doctor and other whole-build scans.
- Abort/restart analysis cleanly when the user edits the model.

## What this gives us

- Large vehicle and mechanism projects become practical.
- Expanded SNAP search does not become an FPS bottleneck.
- Future whole-project diagnostics and instruction generation can run progressively instead of freezing the UI.

## Done when

- Editor interaction remains usable on representative large-build fixtures.
- SNAP does not require a full-scene connector scan each drag frame.
- Whole-build analysis can yield between frames.

---

# 3. LDraw Mechanical Intelligence

## Goal

Move LDraw parts through the capability ladder:

```text
visual → snap → mechanical
```

A loaded LDraw part should increasingly be understood as a mechanical component, not only a mesh with connector points.

## Mechanical classes

Initial targets:

- tire
- rim
- wheel assembly
- axle / keyed shaft
- bush / stopper
- spur gear
- bevel gear where confidently recognized
- rack
- universal joint
- shock absorber
- steering hub / carrier
- suspension arm
- differential-like component
- gearbox-like component
- motor/power unit where explicitly known

## Metadata confidence

Every mechanical classification must expose confidence/source:

```text
verified   — explicit BrickLab registry or trusted evidence
inferred   — conservative geometry/name/connectivity inference
unknown    — visual/snap only
```

Do not guess physics behavior from appearance alone.

## Mechanical metadata registry

Provide an override/registry layer for important LDraw IDs where automatic classification is incomplete.

Examples:

```text
rim:
  beadDiameter
  beadWidth
  axleInterface

tire:
  innerDiameter
  width
  beadProfile

gear:
  toothCount
  pitch
  axis
```

## What this gives us

- Thousands of LDraw parts can become useful mechanical parts.
- Smart Assembly Assistant gets reliable compatibility data.
- Design Doctor can understand mechanisms instead of only connector validity.
- Kinematics and TEST Lab can reason about more LDraw builds.

## Done when

- Mechanical classification has explicit source/confidence.
- Unknown parts remain safely unknown rather than receiving guessed mechanics.
- Coverage reporting can show `visual / snap / mechanical` counts.

---

# 4. Smart Assembly Assistant

## Goal

Teach BrickLab to notice obvious incomplete mechanical assemblies and offer the next compatible component directly in the 3D scene.

The first production use case is **tire ↔ rim**.

## Tire / rim interaction

When the user places or selects a tire without a compatible rim:

1. A 3D anchor appears on the tire.
2. A line/arrow connects that anchor to a floating viewport card.
3. The card explains that the tire has no rim.
4. BrickLab offers compatible rims from the catalog.
5. The user can:
   - install the best match immediately;
   - open the compatible choices;
   - dismiss the suggestion.
6. If accepted, BrickLab loads the part, orients it, inserts it into the tire and creates the correct assembly relationship.

The reverse flow applies when a rim is placed without a tire.

Example UI:

```text
[Tire anchor] ───────────────┐
                             │
                     ┌────────────────────┐
                     │ Tire has no rim    │
                     │ 6 compatible rims  │
                     │                    │
                     │ [Install best]     │
                     │ [Show choices]     │
                     │ [Not now]          │
                     └────────────────────┘
```

## Compatibility must be mechanical

Do not match by display name alone.

Typical tire/rim constraints:

```text
Tire:
  innerDiameter
  width
  beadProfile

Rim:
  outerDiameter
  width
  beadProfile
  axleInterface
```

## Later suggestion families

- axle → bush / stopper
- differential output → half-shaft
- motor output → axle / gearbox input
- shock → compatible mounting pin
- steering hub → rim/wheel
- rack → compatible gear
- exposed keyed shaft → compatible gear/bush

## What this gives us

BrickLab becomes an active assembly assistant instead of a passive parts catalog.

## Done when

- Suggestions appear only for mechanically supported compatibility families.
- The assistant never modifies the build without user action.
- Accepted suggestions produce valid normal BrickLab parts/connections, not special fake assemblies.
- Dismissed suggestions do not constantly reappear during the same editing context.

---

# 5. Design Doctor — Progressive Visual Build Diagnostics

## Goal

Create a scene-native diagnostic mode that visually scans the construction and explains problems at their physical location.

This must not be a simple modal with an error list.

## Scan experience

When the user starts Design Doctor:

1. Camera remains in the project scene.
2. A progressive scan moves through the construction.
3. Parts temporarily change diagnostic color/state as they are inspected.
4. Healthy areas settle back to normal or a subtle OK state.
5. Problem locations remain highlighted.
6. Each issue receives a 3D anchor at the actual connector/part/location.
7. A line/arrow leads from the anchor to a contextual floating card.
8. `Next issue` moves/focuses the camera to the next problem.

Example:

```text
             ┌──────────────────────────────────┐
[3D anchor]──│ Axle 12L is over-constrained    │
             │ Two independent constraints lock │
             │ the same intended DOF.           │
             │                                  │
             │ [Focus] [Explain] [Next issue]  │
             └──────────────────────────────────┘
```

## Diagnostic families

Initial checks should include:

- floating/unconnected parts;
- connector conflicts;
- occupied endpoint inconsistencies;
- connections that block SIMULATE and their exact V4 reason;
- over-constrained axial/hinge mechanisms;
- unsupported/free shafts where evidence exists;
- gear mesh conflicts;
- drivetrain path breaks;
- motor with no useful driven output;
- incompatible tire/rim assembly;
- suspicious collisions/interpenetration where a reliable check exists;
- extreme or unexpected COM/weight distribution warnings for vehicle-like builds;
- unresolved LDraw mechanical metadata as informational rather than an error.

## Architecture

Design Doctor should consume subsystem diagnostics rather than duplicating their rules:

```text
Connector V4 audit
Physics safety plan
Drivetrain diagnostics
Mechanical Intelligence
Vehicle/COM diagnostics
Project integrity
        ↓
Design Doctor issue model
        ↓
3D anchors + viewport cards
```

## What this gives us

Users can understand *where* and *why* a build fails without reading console output or manually inspecting graph state.

## Done when

- Every reported problem points to an actual scene location/object/connector.
- The scan is progressive and frame-budgeted.
- No diagnostic helper affects collider bounds or simulation state.
- Warnings, errors and information are visually distinct.

---

# 6. Kinematics Mode

## Goal

Introduce a mechanical motion mode between BUILD and full dynamic SIMULATE.

Target workflow:

```text
BUILD → KINEMATICS → SIMULATE → TEST
```

KINEMATICS ignores gravity, mass, impact and tyre dynamics. It solves intended constraints and mechanical relationships.

## Capabilities

- Drag/rotate a valid driver and propagate mechanism motion.
- Hinge/revolute motion.
- Axial/prismatic motion.
- Cylindrical interfaces where appropriate.
- Gear ratio propagation.
- Rack-and-pinion motion.
- Shaft rotation.
- Steering linkage motion.
- Suspension articulation.
- Bounded joint limits.
- DOF analysis.

Useful feedback:

```text
Mechanism DOF: 1
Driver: axle-7

or

Mechanism locked
Conflicting constraints:
- hinge A
- axle B
```

## What this gives us

- Mechanisms can be debugged before physics.
- Suspension/steering/linkage design becomes much easier.
- Design Doctor can explain locked or under-constrained mechanisms using the same solver information.

## Done when

- Kinematics never depends on unstable collision impulses.
- Entering/leaving the mode does not alter the saved construction.
- Supported mechanisms move deterministically from the same input pose.

---

# 7. Project Library / Templates / Share

## Goal

Move from one working project/autosave toward a real local project workspace.

## Project Library

Project cards should support:

- thumbnail preview;
- name;
- modified date;
- part count;
- duplicate;
- rename;
- delete;
- export;
- open;
- tags/folders later if needed.

Use IndexedDB or another suitable local persistent store rather than one giant localStorage record.

## Templates

Initial templates:

- Empty project
- Vehicle chassis
- Drivetrain bench
- Suspension test rig
- Robot/mechanism base when robotics exists

## Share

Stages:

1. Reliable `.bricklab` import/export.
2. Compressed portable project package where useful.
3. Shareable link/gallery only when a suitable backend/storage design is intentionally added.

Do not make cloud storage a dependency for local building.

## What this gives us

- Users can maintain several builds.
- TEST comparisons and instructions can reference stable project versions.
- BrickLab feels like a complete creation tool rather than a single document.

## Done when

- Multiple projects can coexist locally without key collisions.
- Project thumbnails and metadata do not require loading every full 3D scene.
- Existing `.bricklab` projects remain importable.

---

# 8. TEST Lab 2.0

## Goal

Turn TEST from four fixed scenarios into a reusable engineering test environment.

Current HILL / PULL / OBST / DYNO remain as trusted presets.

## Work

### Test editor

Composable test modules:

- configurable incline;
- step/threshold;
- articulation blocks;
- cross axle/bump;
- bridge/ramp;
- surface zones;
- mud/ice/gravel/asphalt/concrete;
- towing load;
- dyno brake;
- optional boundaries/checkpoints.

### Test profiles

Save a test independently of the vehicle/project where possible.

### Run comparison

Store run summaries and selected traces:

```text
Run A vs Run B
speed
RPM
motor power
wheel slip
wheel load
suspension travel
elapsed time
peak pull
peak power
```

Support overlay charts and delta summaries such as:

```text
+18% wheel torque
-22% top speed
+11% peak motor load
```

## What this gives us

BrickLab becomes an iteration laboratory: change the design, rerun the same test, compare objective results.

## Done when

- Fixed test time remains deterministic.
- Run comparisons use physics time, not wall-clock time.
- A saved test profile can be repeated against different project revisions.

---

# 9. BOM + LEGO-like PDF Build Instructions

## Goal

Generate a real visual assembly manual from a BrickLab project, not merely a parts CSV.

## BOM

Generate inventory by:

- LDraw Design ID / BrickLab part ID;
- color;
- quantity;
- optionally mechanical category.

Allow CSV/JSON export independently of the PDF instruction system.

## Assembly-order solver

Use the connection graph and mechanical knowledge to infer a plausible assembly sequence.

Important rules include:

- establish structural base first;
- insert internal axles/gears before geometry encloses them;
- preserve meaningful subassemblies;
- avoid impossible insertion directions;
- prefer stable intermediate states;
- keep paired/symmetric repeated steps readable.

The solver must report uncertainty rather than silently produce impossible steps.

## Instruction rendering

Each generated step should support:

- clean studio render of current assembly state;
- newly added parts highlighted;
- parts callout with ID/color/count;
- insertion arrow/direction;
- exploded offset where needed;
- automatic camera framing;
- submodel callouts;
- rotation indicators when the assembly orientation changes.

Example page concept:

```text
┌─────────────────────────────────────────┐
│ STEP 17                                 │
│                                         │
│             [3D build render]           │
│                   ↓                     │
│             insertion arrow             │
│                                         │
│  New parts                              │
│  2780 × 2        3705 × 1              │
│                                         │
│                         BrickLab 3D      │
└─────────────────────────────────────────┘
```

## PDF output

Generate an actual paginated PDF containing:

- cover;
- project name;
- optional model hero render;
- step pages;
- subassembly pages/callouts;
- final inventory/BOM;
- final completed-model render.

The visual goal is the clarity of a real construction-toy instruction manual while keeping BrickLab branding and avoiding copying protected LEGO artwork/layout assets.

## What this gives us

A BrickLab digital design can become a real-world build plan.

## Done when

- The same project generates a deterministic step order unless construction data changes.
- Every step references real project parts and connection relationships.
- Camera planning avoids hidden/ambiguous insertion whenever possible.
- The PDF can be generated locally in the browser or through a clearly defined offline/export pipeline without requiring cloud processing.

---

# Dependency map

```text
Architecture Consolidation
          │
          ├──────────────→ Performance Engine
          │                        │
          │                        ├────────────→ Design Doctor
          │                        └────────────→ Large PDF projects
          │
          └──────────────→ LDraw Mechanical Intelligence
                                   │
                                   ├────────────→ Smart Assembly Assistant
                                   ├────────────→ Design Doctor
                                   ├────────────→ Kinematics
                                   ├────────────→ TEST Lab 2.0
                                   └────────────→ BOM / PDF Instructions

Project Library ────────────────→ TEST run/version management
Project Library ────────────────→ Instruction project versions
```

# Recommended milestone order

## M1 — Foundation

- Architecture Consolidation foundation
- Performance Engine foundation
- representative large-build benchmark fixtures

**Result:** safer architecture and enough headroom for expensive scene-native tooling.

## M2 — Mechanical understanding

- LDraw Mechanical Intelligence V1
- mechanical metadata registry
- visual/snap/mechanical coverage report
- Smart Assembly Assistant V1 with tire ↔ rim

**Result:** BrickLab starts understanding what LDraw components *are* and can actively help finish assemblies.

## M3 — Intelligent engineering workflow

- Design Doctor V1
- progressive scene scan
- 3D issue anchors / lines / contextual cards
- Kinematics V1
- DOF/locked-mechanism diagnostics

**Result:** BrickLab can explain and demonstrate mechanical problems before full simulation.

## M4 — Projects and testing

- Project Library
- templates
- local version/run identity
- TEST Lab 2.0 test profiles
- Run A/B telemetry comparison

**Result:** repeatable engineering iteration across several projects and revisions.

## M5 — Real build output

- BOM
- assembly-order solver
- automatic instruction camera planning
- exploded/insertion annotations
- LEGO-like BrickLab PDF instruction generator

**Result:** digital BrickLab designs become usable real-world assembly documentation.

# Roadmap rules

1. **No fake mechanics.** Unknown mechanical behavior stays unknown until evidence exists.
2. **No physics hacks.** Do not hide instability with arbitrary velocity clamps or broad bypasses.
3. **One source of truth per subsystem.** New features should consume authoritative graph/metadata/physics diagnostics.
4. **Scene helpers are non-physical.** Doctor anchors, arrows, cards, guides and instruction helpers must never affect collider measurement.
5. **Progressive work for large builds.** Expensive scans must yield to the frame and support cancellation/restart.
6. **Preserve project compatibility.** Migrations must keep existing `.bricklab` projects usable wherever reasonably possible.
7. **Keep local-first behavior.** Core building, simulation, diagnostics, projects and PDF export should not depend on a backend.
8. **Promote milestones to `main` only when stable.** Development continues in `gh-pages`.
9. **Do not use GitHub Actions.** Validation is performed through local/manual/runtime test paths available to the project.

# Product direction

The intended long-term identity of BrickLab 3D is:

> A browser-based mechanical construction and engineering sandbox where users can build with real part geometry, receive intelligent assembly guidance, inspect mechanisms, test them under physics, compare telemetry and export real visual build instructions.
