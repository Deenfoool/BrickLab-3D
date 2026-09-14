# Connector V4 — Primitive Discovery Pass

Status: **V4.4 implemented; local full-library audit and browser resolver smoke completed**

## V4.4: Shadow inheritance beyond subparts

The authoritative resolver now follows ordinary part references and primitive
wrappers when the offline inheritance index proves they lead to Shadow data.
Previously only `s/` geometry recursed; every other reference read direct Shadow
only. This lost e.g. `bush → bush0 → axlehol5`, `handle → handle2`, and nested
`stug-*` stud groups. The new paths also recover clip, finger and generic sites
inside decorated/assembled parts. No new radius, connector gender or physical
joint is guessed from the part name.

The index has 4,365 paths (~79 KB), generated from 27,711 official geometry files
at LDraw mirror commit `c43ed06a128a10ed65675166bf42eb6fd608b9b0` and 4,281 pinned
Shadow files. It is routing evidence only. Runtime reads actual geometry and
Shadow lazily, composes transforms, applies parent `SNAP_CLEAR`, and retains
normal scale/mirror policies, cycle protection, caches and traversal budgets.
It does not fetch the entire library or traverse arbitrary cylinders.

An uncertain new subtree is discarded transactionally and reported as
`discovery-branch-quarantined`, with nested reasons. Previously supported direct
Shadow metadata is still resolved and validated normally. No V3 or geometry
fallback is introduced for these failures. Remaining critical resolver warnings
continue to block activation under the existing policy.

Full offline comparison covered **18,615 top-level parts**. **5,551** gained
unique endpoints after identity deduplication; the total gain was **179,331**
endpoints across these parts (including printed/assembled variants). No part lost
unique Shadow endpoints. These are metadata-discovery counts, not a claim that
179,331 new physical joints have been certified. 5,165 gaining parts resolved
without warnings; unsupported transforms/meta stay guarded.

Per-part counts are recorded in [the audit CSV](qa/connector-sites-audit.csv).
The CSV includes 21 additional parts whose raw metadata changed but deduplicated
endpoint counts did not increase. It compares resolver outputs, before the
existing runtime activation policy and the geometry fallback pass.

Local validation: discovery suite **35/35**; full `test:connectors-v4`
**210/219**, with the same nine failing legacy structural/cache assertions as
unmodified `e5155e2` (**191/200**). The new work adds no failing tests to that
baseline. These existing failures are not described as successful checks.

Published browser QA on 2026-09-14: **9/9 PASS** at `connector-sites-qa.html`,
using the production import map and `shadow-resolver-v4.3.0`. Parts: `32123a`,
`32089`, `3713`, `60470`, `4488`, `3001`, `3708`, `3894`, `3648`. Counts,
schema validation and deterministic endpoint identities passed. No application
console errors were observed; browser-extension metadata errors are unrelated.
This is resolver QA, not a claim of end-to-end editor/physics verification.
The main menu loaded, but this cloud browser reports `GL_RENDERER = Disabled`
and cannot create a WebGL context. Visual placement and simulation could not be
verified in this environment; the no-WebGL resolver page is unaffected.

Representative raw Shadow counts:

| Part | Before | After | Recovered evidence |
|---|---:|---:|---|
| 3713 | 0 | 1 | Bush keyed bore |
| 32123a | 0 | 1 | Half-bush keyed bore |
| 32089 | 0 | 1 | Keyed interface inherited through geometry |
| 60470 | 2 | 7 | Nested plate/clip assembly interfaces |
| 4488 | 6 | 11 | Nested part interfaces |
| 3001 / 3708 / 3894 / 3648 | unchanged | unchanged | Existing Shadow definitions and IDs preserved |

Duplicate suppression also handles non-centered Shadow axles and treats pin-hole
and round-hole receiver roles as the same occupied region. This repairs two
paths where the V4.3 wrapper could append duplicate endpoints.

Connector Discovery is an additive pass that runs after normal LDCad Shadow hydration. Its purpose is to recover high-confidence connection sites explicitly encoded by semantic primitives in official LDraw geometry but absent from the resolved Shadow connector set.

## Authority

LDCad Shadow remains authoritative. Discovery never replaces or rewrites an authoritative Shadow endpoint. A discovered endpoint is appended only when no existing endpoint already covers the same physical connection region.

Existing Shadow endpoint IDs are left untouched so saved Connector V4 graph records remain stable.

## V4.3 semantic geometry pass

V4.3 re-audits how official LDraw parts are actually constructed instead of treating only a handful of primitive filenames as connection evidence.

The additional verified primitive families are:

- `stud2.dat`, `stud2a.dat`, `studa.dat` — standard 6 LDU radius studs using alternate/open visual geometry;
- `axle.dat` — actual Technic male axle geometry;
- `axlehole.dat` — actual Technic keyed axle-hole geometry;
- `axlehol0.dat` — invisible axle-hole hint, now interpreted exactly as documented: as a substitute for `axle.dat` with the same transformed span.

For `axle.dat`, `axlehole.dat`, and `axlehol0.dat`, the native primitive spans Y=0..1. V4.3 therefore transforms the **midpoint** of that span and uses the full axial scale. This fixes the previous `axlehol0` behavior which placed the endpoint at the start of a scaled hole.

V4.4 deliberately removes V4.3's unconditional `stud4.dat` / `stud4a.dat`
anti-stud inference. Pinned Shadow `p/stud4.dat` explicitly comments out the
generic receiver pending multi-matching to prevent unwanted plate snapping.
A visible tube is insufficient evidence of surrounding clearance. Part-specific
Shadow anti-studs, including those of `3001`, remain intact.

Duplo, Scala, truncated/decorative stud primitives and arbitrary cylinder geometry are intentionally not promoted by this pass. They require separate verified interface profiles rather than name-based guessing.

## Existing primitive evidence

The original high-confidence pass remains intact and continues to recognize:

- `connect.dat` — Technic male pin;
- `confric.dat` — Technic friction male pin;
- `connhole.dat` — canonical Technic pin receiver;
- `axlehol0.dat` — explicit LDraw axle-hole hint (the V4.3 wrapper corrects its transformed anchor before endpoint identity assignment);
- `stud.dat` — standard stud;
- `peghole.dat`, `peghole2.dat` … `peghole6.dat` — one physical edge of a Technic peg/pin hole.

No connector is inferred from a part name, description, category, visual bounding box, or an arbitrary cylinder mesh.

## Paired peghole reconstruction

A `peghole*.dat` reference is **not** a connection endpoint on its own. It describes one end/lip of a hole. Treating each reference as a connector would create two independently occupiable fake endpoints for one physical hole.

Discovery therefore collects peghole edges first and creates a receiver only when two edges are proven to be one hole:

- their axes are almost exactly opposite;
- each edge faces the other;
- their centerlines agree within a small LDU tolerance;
- their separation is within a conservative physical span;
- pairing is greedy by the nearest geometrically valid mate so neighbouring collinear holes are not cross-paired.

For a standard 20 LDU Technic brick depth, two `peghole.dat` ends reconstruct the canonical profile `R8×2 → R6×16 → R8×2`, centered between the two physical faces. Other valid spans preserve the same two 2 LDU entry lips and derive the throat length from the measured separation.

Single, same-facing, badly aligned, scaled, or implausibly distant peghole edges stay unpaired and create **no endpoint**.

## Recursive scan

Both passes scan the top-level official part and follow official `s/` subparts with depth/node budgets and cycle protection. Primitive transforms are composed through the hierarchy before evidence is converted into connectors.

Semantic fallback preserves axial scaling for axle/axle-hole primitives. Radial scaling, shear and unsupported transformations are rejected.

## Duplicate protection

Before append, Discovery compares semantic role, axis, centerline and occupied axial interval.

V4.3 extends role-aware suppression to:

- stud ↔ authoritative stud;
- anti-stud ↔ authoritative anti-stud;
- Technic axle ↔ authoritative keyed axle;
- Technic axle hole ↔ authoritative keyed axle hole;
- the existing pin/round-hole families from V4.2.

This prevents a physical interface from becoming two independently occupiable endpoints when Shadow already describes it.

## Production runtime

`bootstrap.js` mounts Discovery immediately after Connector V4 and before `app.js`. The mount is fail-open: if Discovery itself fails to load, Connector V4 and the editor continue with the authoritative Shadow set.

`globalThis.BrickLabConnectorDiscovery` exposes:

- `scan(partId, { force })`
- `state(partId)`
- `status(partId)`
- `stats()`

Per-definition results are stored in `definition.connectivityV4.discovery`. `scanStats` contains both the legacy primitive counters and V4.3 `semanticSites` counters/roles.

## Safety

The pass does not mutate scene transforms, project history, physics bodies or existing graph records. The corrected `axlehol0` candidate is substituted before endpoint IDs are assigned, so there is no post-hoc endpoint mutation. Discovered connectors are validated, capped by the V4 connector budget and only appended after Shadow duplicate suppression.

## Reproduce locally

```sh
npm run test:connector-discovery
npm run test:connectors-v4
node scripts/index-connector-inheritance.mjs /path/to/ldraw /path/to/pinned-shadow
node scripts/audit-connector-inheritance.mjs /path/to/ldraw /path/to/pinned-shadow /tmp/audit.json
```

The generator verifies the pinned Shadow SHA. The fixture pack contains real
source text and attribution in `NOTICE_CONNECTORS.md`. `connector-sites-qa.html`
uses the production import map and real fixtures to check counts, valid frames
and stable IDs in a browser without WebGL. It does not test editor snapping or
simulation. Cache generation for changed entry points is
`connector-sites-20260914-v2`; unrelated import-map targets are preserved.
