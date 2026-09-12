# Connector V4 — Primitive Discovery Pass

Status: **IMPLEMENTED — browser smoke pending**

Connector Discovery is a second, additive pass that runs after normal LDCad Shadow hydration. Its purpose is to recover high-confidence connection sites that are explicitly encoded by semantic primitives in official LDraw geometry but are absent from the resolved Shadow connector set.

## Authority

LDCad Shadow remains authoritative. Discovery never replaces or rewrites existing V4 endpoints. A discovered endpoint is appended only when no existing endpoint already covers the same physical connection region.

Existing endpoint IDs are left untouched so saved Connector V4 graph records remain stable.

## V1 primitive evidence

V1 deliberately accepts only explicit semantic primitives:

- `connect.dat` — Technic male pin
- `confric.dat` — Technic friction male pin
- `connhole.dat` — Technic pin receiver
- `axlehol0.dat` — explicit LDraw axle-hole hint
- `stud.dat` — standard stud

No connector is inferred from a part name, description, category, or visual bounding box.

`axlehol0.dat` is special: LDraw documents it as an invisible axle-hole hint whose axial scaling describes the intended hole. Discovery preserves that axial scale while rejecting arbitrary scaling for the other primitive families.

## Recursive scan

The pass scans the top-level official part and follows official `s/` subparts with depth/node budgets and cycle protection. Primitive transforms are composed through the hierarchy before a connector is created.

## Duplicate protection

Before append, Discovery compares semantic role, axis, centerline and occupied axial interval. A canonical pin-hole is considered already covered by an existing compatible round Technic receiver at the same physical site. This prevents one real hole from becoming two independently occupiable endpoints.

## Runtime API

`globalThis.BrickLabConnectorDiscovery` exposes:

- `scan(partId, { force })`
- `state(partId)`
- `status(partId)`
- `stats()`

Per-definition results are stored in `definition.connectivityV4.discovery` and aggregate counters are added to `definition.connectivityV4.stats`.

## Safety

The pass does not mutate scene transforms, project history, physics bodies or existing graph records. It validates discovered connectors, caps the final connector count at the V4 budget, and only dispatches metadata/catalog change events after successful augmentation.
