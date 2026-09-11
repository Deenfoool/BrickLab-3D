# LDraw Mechanical Intelligence V1

Status: **COMPLETE**

Roadmap item: **3 — LDraw Mechanical Intelligence**.

## Goal

Move registered LDraw parts through an explicit capability/knowledge ladder:

`visual → snap → mechanical`

without guessing simulation behaviour from appearance alone.

The existing owners stay unchanged:

- `ldraw/runtime-v3.js` owns LDraw text/geometry loading and its existing narrow legacy mechanics inference;
- Connector V4 owns structural connectivity and SNAP;
- Connector V4 Physics Guard remains the fail-closed SIMULATE authority;
- `ldraw/mechanical-intelligence-v1.js` owns only semantic mechanical classification, confidence/source metadata, registry overrides and coverage reporting.

## Confidence model

Every registered `ldraw-*` definition receives a `mechanicalIntelligence` record:

```js
{
  class: 'axle',
  confidence: 'verified',
  source: 'bricklab-registry-v1',
  evidence: ['ldraw-id:3708'],
  properties: { lengthL: 12, keyed: true }
}
```

The confidence values are deliberately small and explicit:

- `verified` — an explicit BrickLab registry/runtime override identifies the LDraw ID;
- `inferred` — conservative LDraw name/category metadata is sufficiently explicit;
- `unknown` — no safe classification can be made.

`unknown` is a valid result, not an error and not a request to guess.

## Mechanical classes

V1 recognizes the roadmap target families:

- `tire`
- `rim`
- `wheel-assembly`
- `axle`
- `bush`
- `spur-gear`
- `bevel-gear`
- `rack`
- `universal-joint`
- `shock-absorber`
- `steering-hub`
- `suspension-arm`
- `differential-like`
- `gearbox-like`
- `power-unit`

The `*-like` naming is intentional: recognizing a housing/component as differential- or gearbox-related does **not** claim that BrickLab knows its internal ratio, torque split or constraints.

## Verified registry

The initial curated registry covers known high-value Technic IDs for:

- common cross axles (2L, 3L, 4L, 5L, 6L, 7L, 8L, 10L, 12L);
- common bushes / half bush;
- common spur gears (8T, 16T, 24T, 40T);
- common bevel gears (12T, 20T).

Registry records are classified as `verified` and carry deterministic properties such as axle length or tooth count where the registry explicitly knows them.

The registry is intentionally not a giant guessed table. Important future IDs can be added explicitly through the runtime override API and later promoted into the built-in registry.

## Conservative inference

Metadata inference accepts only explicit wording/categories. Examples:

- `Technic Axle 7L` → `axle`, inferred length `7L`;
- `Technic Gear 24 Tooth` → `spur-gear`, 24 teeth;
- `Technic Bevel Gear 12 Tooth` → `bevel-gear`, 12 teeth;
- `Technic Gear Rack ...` → `rack`;
- `Technic Universal Joint ...` → `universal-joint`;
- `Technic Shock Absorber ...` → `shock-absorber`;
- explicit steering/suspension/differential/gearbox names map to their semantic classes;
- explicit Electric/Powered Up/Power Functions motor wording → `power-unit`;
- LDraw `Tyre` / explicit Tire/Tyre names → `tire`;
- LDraw `Wheel` / explicit Wheel/Rim names → `rim`.

A generic occurrence of the word `gear` is **not** enough for spur-gear classification. V1 requires explicit spur wording or a safe tooth-count pattern and excludes worm/rack/crown/clutch/differential/knob/turntable cases.

For tire/rim names, V1 may retain catalog dimensions exactly as written (`catalogDiameterMm`, `catalogWidthMm`). It does not reinterpret those values as bead diameter, inner diameter, grip or other compatibility/physics dimensions.

## No invented physics

Mechanical classification is semantic knowledge, not permission to fabricate simulation parameters.

V1 does **not** infer or invent:

- tire friction/grip curves;
- motor torque/RPM/current;
- differential torque split/ratio;
- gearbox ratios;
- shock spring/damping rates;
- bevel/rack constraints;
- steering limits;
- suspension geometry.

The only legacy behaviour preserved directly by this layer is `mechanics.shaft = true` for a safely recognized axle, matching the existing LDraw axle semantic.

If `ldraw/runtime-v3.js` already provides a supported `mechanics.gear` or `shaft` record, that record is preserved. Mechanical Intelligence adds `mechanics.classification`; it does not replace the existing runtime owner.

## Definition integration

For a recognized LDraw definition, V1 publishes the classification in three compatible places:

- `definition.mechanicalIntelligence`
- `definition.mechanics.classification`
- summary fields under `definition.ldraw`:
  - `mechanicalClass`
  - `mechanicalConfidence`
  - `mechanicalSource`

For `unknown` definitions, `mechanics.classification` is absent. Existing unrelated mechanics are left intact.

The classifier is installed from `ldraw/bootstrap-v1.js` before persisted/imported dynamic LDraw definitions are registered. It resynchronizes on:

- `bricklab:partcatalogchange`
- `bricklab:ldrawlegacyready`
- `bricklab:ldrawloaded`

This matters because recursive LDraw inference may complete after the initial definition exists.

## Override / registry API

The browser API is exposed as:

```js
globalThis.BrickLabLDrawMechanicalIntelligence
```

Useful methods:

```js
BrickLabLDrawMechanicalIntelligence.classify(definition)
BrickLabLDrawMechanicalIntelligence.sync()
BrickLabLDrawMechanicalIntelligence.coverage()
BrickLabLDrawMechanicalIntelligence.getOverride('3708')
BrickLabLDrawMechanicalIntelligence.listOverrides()
BrickLabLDrawMechanicalIntelligence.registerOverride('custom-id', {
  class: 'wheel-assembly',
  properties: { /* only verified facts */ },
  evidence: ['manual verification'],
})
```

Runtime overrides have source `bricklab-runtime-override` and confidence `verified` because they are explicit operator data, not heuristic inference.

## Coverage reporting

`BrickLabLDrawMechanicalIntelligence.coverage()` reports only currently registered LDraw definitions and returns an immutable snapshot such as:

```js
{
  version: 'ldraw-mechanical-intelligence-v1.0.0',
  scope: 'registered-ldraw-parts',
  total: 120,
  capabilities: {
    visual: 120,
    snap: 88,
    mechanical: 31
  },
  confidence: {
    verified: 14,
    inferred: 17,
    unknown: 89
  },
  classes: {
    axle: 10,
    'spur-gear': 7
  }
}
```

`mechanical` in this report means **mechanically classified/understood**, not “guaranteed supported by SIMULATE”. Physics support is still decided by the existing fail-closed physics policy/guard.

## Events

V1 exposes lifecycle changes without polling:

- `bricklab:mechanicalintelligenceready`
- `bricklab:mechanicalintelligencechange`

The change event includes the number of updated definitions and a fresh coverage snapshot.

## Acceptance / roadmap Done mapping

### Mechanical classification has explicit source/confidence

Complete. Every LDraw definition can be queried for `class`, `confidence`, `source`, `evidence` and `properties`. Curated IDs are `verified`; conservative metadata results are `inferred`.

### Unknown parts remain safely unknown

Complete. Unrecognized parts produce `{ class:'unknown', confidence:'unknown', source:'none' }` and do not receive invented drivetrain/suspension/motor/tire physics.

### Coverage reporting shows visual / snap / mechanical counts

Complete. `coverage()` reports the capability counts plus confidence and mechanical-class distributions for registered LDraw definitions.

## Regression coverage

`tests/ldraw-mechanical-intelligence.test.mjs` covers:

- verified curated IDs before full metadata hydration;
- all initial target semantic families;
- spur/bevel/axle properties;
- unknown fail-safe behaviour;
- no invented differential/motor physics;
- explicit runtime overrides;
- visual/snap/mechanical coverage counts;
- bootstrap ordering so the classifier is active before persisted LDraw registrations.

The test file is imported by `tests/architecture-contract.test.mjs`, so it is included in the Architecture suite and the broader Connector V4 suite that already consumes that contract test.

## Safety boundary for the next roadmap item

Smart Assembly Assistant can consume these classification records as compatibility evidence, but must distinguish `verified` from `inferred` and must not turn `unknown` into a suggestion by guesswork. Exact pair compatibility (for example tire ↔ rim bead fit or gear ↔ gear mesh geometry) should use explicit dimensional/connection facts or verified overrides when item 4 is implemented.
