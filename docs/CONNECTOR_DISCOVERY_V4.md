# Connector V4 — Primitive Discovery Pass

Status: **IMPLEMENTED — browser smoke pending**

Connector Discovery is an additive pass that runs after normal LDCad Shadow hydration. Its purpose is to recover high-confidence connection sites explicitly encoded by semantic primitives in official LDraw geometry but absent from the resolved Shadow connector set.

## Authority

LDCad Shadow remains authoritative. Discovery never replaces or rewrites an authoritative Shadow endpoint. A discovered endpoint is appended only when no existing endpoint already covers the same physical connection region.

Existing Shadow endpoint IDs are left untouched so saved Connector V4 graph records remain stable.

## V4.3 semantic geometry pass

V4.3 re-audits how official LDraw parts are actually constructed instead of treating only a handful of primitive filenames as connection evidence.

The additional verified primitive families are:

- `stud2.dat`, `stud2a.dat`, `studa.dat` — standard 6 LDU radius studs using alternate/open visual geometry;
- `stud4.dat`, `stud4a.dat` — standard anti-stud tubes. Their axial scale is preserved, so a tube stretched through the depth of a brick becomes one full-depth receiver rather than a 4 LDU fake hole;
- `axle.dat` — actual Technic male axle geometry;
- `axlehole.dat` — actual Technic keyed axle-hole geometry;
- `axlehol0.dat` — invisible axle-hole hint, now interpreted exactly as documented: as a substitute for `axle.dat` with the same transformed span.

For `axle.dat`, `axlehole.dat`, and `axlehol0.dat`, the native primitive spans Y=0..1. V4.3 therefore transforms the **midpoint** of that span and uses the full axial scale. This fixes the previous `axlehol0` behavior which placed the endpoint at the start of a scaled hole.

A concrete example is official LDraw part `3001.dat` (Brick 2×4): its top studs are `stud.dat`, while its three underside anti-stud tubes are scaled `stud4.dat` references inside `s/3001s01.dat`. V4.3 can recover those underside receivers when Shadow metadata is absent.

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

V4.3 preserves axial scaling only for primitives whose LDraw definition explicitly uses it as physical interface length (anti-stud tubes and axle/axle-hole primitives). Radial scaling, shear and unsupported transformations are rejected.

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
