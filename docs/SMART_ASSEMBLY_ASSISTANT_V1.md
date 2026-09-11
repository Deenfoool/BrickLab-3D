# BrickLab 3D — Smart Assembly Assistant V1

Status: **COMPLETE**  
Roadmap: item 4 — Smart Assembly Assistant  
Production branch: `gh-pages`

## Goal

Smart Assembly Assistant is the first scene-native consumer of LDraw Mechanical Intelligence. It notices a mechanically supported incomplete assembly, points at the relevant part in the viewport, and offers a compatible counterpart without modifying the project until the user explicitly accepts the suggestion.

V1 deliberately starts with one production compatibility family: **tire ↔ rim**.

## Supported tire/rim families

Compatibility is curated mechanical data, not display-name matching.

| Family | Tire | Rim | Mechanical fit evidence |
| --- | --- | --- | --- |
| `tire-rim-30.4x14` | LDraw `6578` | LDraw `2994` | 20 mm bead/rim diameter; tire width 14 mm; rim width 12 mm; Technic VR 30.4×14 family |
| `tire-rim-43.2x28` | LDraw `6579` | LDraw `6580a` | 22 mm bead/rim diameter; tire nominal width 26 mm; rim width 23 mm; legacy 43.2×28 small off-road family |

The second family is also represented by the official LDraw shortcut/composite data that combines `6580a.dat` and `6579.dat`, so V1 does not infer that pair from a similar name.

The compatibility registry lives in `guidance/assembly-compatibility-v1.js`. A part must first have a non-`unknown` Mechanical Intelligence classification as `tire` or `rim`, then it must belong to a supported compatibility family. An arbitrary part containing words such as `wheel`, `tire` or `rim` does not receive an install suggestion.

## Scene interaction

When exactly one supported tire or rim is selected in BUILD mode and its counterpart is not already assembled:

1. a projected viewport anchor is placed over the selected 3D part;
2. an arrow line connects the anchor to a floating card;
3. the card identifies the missing counterpart;
4. `Install best` loads and installs the best mechanically supported choice;
5. `Show choices` exposes all supported choices in the family;
6. `Not now` suppresses that suggestion for the current editing session/context.

The reverse flow is symmetrical: selecting a supported rim can offer its tire.

The anchor/card are DOM overlay helpers. They are never added to the Three.js build tree and therefore cannot affect raycast part identity, collider measurement, Connector V4 bounds or SIMULATE state.

## Installation contract

The assistant is advisory until the user clicks an install action.

On acceptance it:

- resolves/registers the real LDraw definition through the canonical LDraw runtime;
- preloads both source and target LDraw prototypes from the existing cache path;
- inserts the counterpart through the stable Editor subsystem API;
- creates a normal BrickLab part object with the normal `partId`, `instanceId`, transform and project serialization path;
- puts the source and inserted counterpart in a normal BrickLab editor group so the wheel assembly moves as one editing unit;
- saves through the existing project path;
- emits `bricklab:smartassemblyinstalled` for future diagnostics/telemetry consumers.

No fake tire-bead Connector V4 record is created. Connector V4 currently has no certified tire-bead connector family, so inventing one here would violate the fail-closed connectivity model. When Connector V4 gains a real certified wheel-bead relationship, the assistant can delegate to it. Until then the editor group is the ordinary BrickLab assembly/co-movement relationship and both components remain ordinary project parts.

## Correct placement with LDraw normalization

`runtime-v3` normalizes LDraw visuals to local `minY = 0`. If a tire and rim simply shared the same root position, their bottoms would align rather than their rotational centers whenever their visual heights differ.

V1 therefore resolves the real source/target prototype bounds and offsets the target along the source's rotated local Y axis by half the height difference. The target receives the same orientation as the source. This keeps the normalized visual centers coincident even when the wheel assembly itself is rotated.

If real prototype sizes cannot be resolved, placement safely falls back to the source transform rather than fabricating dimensions.

## Stable editor API extension

Architecture API is now `architecture-v1.2.0` and exposes three additional editor-facing capabilities for scene-native guidance features:

- `editor.mode()` — current editor mode;
- `editor.viewportPoint(object)` — projected viewport position without exposing the lexical camera directly;
- `editor.insertPart(partId, options)` — insert a normal part through the bound editor adapter.

The adapter remains a compatibility bridge. It does not become a new BUILD connectivity or SIMULATE physics owner.

`app.js` still owns its lexical undo stack. Smart Assembly persists an accepted external insertion immediately through the existing save path; the next native editor history checkpoint incorporates the resulting project state. A future editor-history API can make external feature transactions first-class undo entries without changing Smart Assembly compatibility logic.

## Dismissal behavior

Dismissals are keyed by:

```text
source instance + compatibility family + requested role
```

Therefore a dismissed card does not continuously reappear while the user continues editing the same source assembly. Dismissals are intentionally session-local; reopening/reloading the editor starts a fresh guidance context.

After a successful install, the same suggestion is additionally suppressed by actual scene evidence: a compatible counterpart is already centered/aligned with the source.

## Ownership boundaries

Smart Assembly Assistant consumes existing systems rather than duplicating them:

```text
LDraw Mechanical Intelligence
          +
curated assembly compatibility
          ↓
Smart Assembly evaluator
          ↓
3D-projected DOM anchor/card
          ↓ user accepts
Stable Editor API → normal LDraw/PARTS object
```

It does **not** own:

- LDraw geometry or caches;
- Connector V4 candidate/connection rules;
- Physics planning or constraints;
- the project format;
- editor selection/history internals.

## Regression coverage

`tests/smart-assembly-assistant.test.mjs` covers:

- curated family definitions and mechanical fit dimensions;
- tire → rim and rim → tire flows;
- on-demand registration of an unloaded counterpart;
- rejection of unknown/name-only lookalikes;
- suppression when a compatible pair already exists;
- visual-center placement for bottom-normalized and rotated LDraw parts;
- normal editor group/transform placement;
- stable editor facade delegation;
- insertion of a normal PARTS object into the live build root with ordinary persistence;
- production bootstrap ordering;
- absence of fabricated Connector V4 connection creation in the Smart Assembly runtime.

The suite is imported by the architecture completion test so it remains part of the existing regression path.

## Roadmap item 4 acceptance

### Suggestions only for mechanically supported families

**PASS.** V1 only returns choices for supported Mechanical Intelligence roles and curated/verified compatibility families. Unknown/name-only parts remain silent.

### No automatic build mutation

**PASS.** Evaluation only renders the overlay. Registration/insertion/grouping happens inside an explicit install action.

### Accepted suggestions create normal BrickLab state

**PASS.** The inserted counterpart is a normal LDraw/PARTS object in the actual build root and uses normal project serialization/persistence. No special fake assembly object or fake Connector V4 record is created.

### Dismissed suggestions do not repeatedly return

**PASS.** Session-context dismissal keys suppress the same source/family/role suggestion, and completed compatible assemblies are detected from scene state.

## Next dependency

This assistant becomes a direct consumer/input for roadmap item 5, **Design Doctor**. Design Doctor can reuse the same compatibility evaluator to report an incompatible or incomplete tire/rim assembly without reimplementing Smart Assembly rules.
