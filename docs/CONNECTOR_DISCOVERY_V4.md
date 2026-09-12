# Connector V4 — Primitive Discovery Pass

Status: **IMPLEMENTED — browser smoke pending**

Connector Discovery is a second, additive pass that runs after normal LDCad Shadow hydration. Its purpose is to recover high-confidence connection sites that are explicitly encoded by semantic primitives in official LDraw geometry but are absent from the resolved Shadow connector set.

## Authority

LDCad Shadow remains authoritative. Discovery never replaces or rewrites existing V4 endpoints. A discovered endpoint is appended only when no existing endpoint already covers the same physical connection region.

Existing endpoint IDs are left untouched so saved Connector V4 graph records remain stable.

## Primitive evidence

Discovery deliberately accepts only explicit semantic primitives:

- `connect.dat` — Technic male pin
- `confric.dat` — Technic friction male pin
- `connhole.dat` — canonical Technic pin receiver
- `axlehol0.dat` — explicit LDraw axle-hole hint
- `stud.dat` — standard stud
- `peghole.dat`, `peghole2.dat` … `peghole6.dat` — one physical edge of a Technic peg/pin hole

No connector is inferred from a part name, description, category, visual bounding box, or arbitrary cylinder geometry.

`axlehol0.dat` is special: LDraw documents it as an invisible axle-hole hint whose axial scaling describes the intended hole. Discovery preserves that axial scale while rejecting arbitrary scaling for the other primitive families.

## Paired peghole reconstruction

A `peghole*.dat` reference is **not** a connection endpoint on its own. It describes one end/lip of a hole. Treating each reference as a connector would create two independently occupiable fake endpoints for one physical hole.

V4.2 therefore collects peghole edges first and creates a receiver only when two edges are proven to be one hole:

- their axes are almost exactly opposite;
- each edge faces the other;
- their centerlines agree within a small LDU tolerance;
- their separation is within a conservative physical span;
- pairing is greedy by the nearest geometrically valid mate so neighbouring collinear holes are not cross-paired.

For a standard 20 LDU Technic brick depth, two `peghole.dat` ends reconstruct the canonical profile `R8×2 → R6×16 → R8×2`, centered between the two physical faces. Other valid spans preserve the same two 2 LDU entry lips and derive the throat length from the measured separation.

Single, same-facing, badly aligned, scaled, or implausibly distant peghole edges stay unpaired and create **no endpoint**.

## Recursive scan

The pass scans the top-level official part and follows official `s/` subparts with depth/node budgets and cycle protection. Primitive transforms are composed through the hierarchy before evidence is paired or converted into a connector.

## Duplicate protection

Before append, Discovery compares semantic role, axis, centerline and occupied axial interval. A reconstructed peghole receiver is considered covered by an existing compatible round Technic receiver at the same physical site. This prevents one real hole from becoming two independently occupiable endpoints when Shadow already describes it.

## Production runtime

`bootstrap.js` mounts the Discovery runtime immediately after Connector V4 and before `app.js`. The mount is fail-open: if Discovery itself fails to load, Connector V4 and the editor continue with the authoritative Shadow set.

`globalThis.BrickLabConnectorDiscovery` exposes:

- `scan(partId, { force })`
- `state(partId)`
- `status(partId)`
- `stats()`

Per-definition results are stored in `definition.connectivityV4.discovery`. `scanStats` includes peghole edge/pair counts and aggregate counters are added to `definition.connectivityV4.stats`.

## Safety

The pass does not mutate scene transforms, project history, physics bodies or existing graph records. It validates discovered connectors, caps the final connector count at the V4 budget, and only dispatches metadata/catalog change events after successful augmentation.
