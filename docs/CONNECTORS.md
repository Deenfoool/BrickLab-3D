# Connector System v3

Connector System v3 is the authoritative BrickLab attachment layer shared by editor snapping, project persistence, physics integrity and drivetrain endpoint semantics.

## Goals

- one compatibility registry;
- deterministic connector occupancy;
- strict snap geometry;
- grouped structural multi-contact;
- legacy project migration;
- safe physics graph preparation;
- catalog validation for every connector-bearing part;
- new parts should declare connectors instead of adding pair-specific editor code.

## Authoritative modules

- `connector-rules-v3.js` — compatibility and tolerances.
- `connections-v3.js` — graph edges, endpoint occupancy, multi-contact bundles.
- `snapping-v3.js` — candidate scoring, orientation, keyed twist and final placement.
- `connector-validation-v3.js` — catalog and graph diagnostics.
- `connector-project-migration-v3.js` — stored/project graph normalization.
- `connector-import-v3.js` — `.bricklab` import normalization.
- `connector-physics-v3.js` — physics snapshot sanitization and structural weld inference.

`index.html` keeps legacy `./connections.js` and `./snapping.js` import specifiers mapped to the v3 implementations. This lets the large editor and mechanics call sites stay stable while v3 remains authoritative.

## Compatibility table

| A | B | Kind | Axis rule | Notes |
| --- | --- | --- | --- | --- |
| stud | tube | fixed | opposed | supports grouped multi-contact |
| pin | pin-hole | hinge | parallel | revolute joint |
| axle | pin-hole | bearing | parallel | free rotation in beam/bearing hole |
| axle | axle-hole | axle | parallel | keyed, 90° twist symmetry |

The registry is the only place where a new connector-type pairing should be introduced.

## Connector definition contract

A connector on a part definition must provide:

```js
{
  id: 'axle-0',
  type: 'axle-hole',
  position: [0, 0, 0],
  axis: [1, 0, 0],
}
```

Requirements:

1. `id` is unique within the part definition.
2. `type` is a supported connector type.
3. `position` is a finite local-space XYZ vector in BrickLab editor units.
4. `axis` is a finite, approximately unit-length local-space direction.
5. Mechanical metadata that references a connector ID must point to an existing connector of the expected type.

Current mechanics checks include motor outputs, transmission input/output, differential ports, suspension pivots, gears and wheels.

## Snapping

Candidate selection uses rule-specific capture distance and minimum axis alignment. Distance is normalized by the rule capture radius, alignment contributes a secondary penalty, multi-contact fixed snaps get a bounded contact bonus, and the current candidate gets a small sticky bonus to avoid flicker while dragging.

When a snap is committed:

1. the moving part is rotated to satisfy the connector axis rule;
2. keyed axle attachments quantize twist in 90° steps;
3. the source connector is translated exactly onto the target connector;
4. structural stud/tube contacts between the same two parts are collected;
5. `connections-v3.js` creates one connection edge and reserves every contact endpoint.

## Endpoint occupancy

An endpoint key is:

```text
<instanceId>::<connectorId>
```

Occupancy includes the primary `a`/`b` endpoints and every endpoint inside `contacts`. A connector cannot be consumed by two different graph edges.

## Structural multi-contact

Brick/Plate-style attachments are represented as one `fixed` edge even when several stud/tube pairs touch. `contactCount` is always `1 + contacts.length`.

This keeps inspector counts, disconnect behavior, project files and physics component grouping consistent.

## Project migration

Before the editor restores a browser-saved project, the migration layer:

- resolves each endpoint against the current part catalog;
- refreshes `connectorType` metadata;
- refreshes `kind`, `schemaVersion` and `ruleVersion`;
- reconstructs missing fixed multi-contact pairs where geometry still matches;
- leaves part transforms untouched.

Imported `.bricklab` files pass through the same normalizer.

## Physics integrity

`connector-physics-v3.js` never trusts the serialized graph blindly. Before Rapier world construction it creates a sanitized physics-only graph:

- missing parts/connectors are dropped;
- unsupported pairs are dropped;
- self-links are dropped;
- stale kinds/types are normalized;
- connections that no longer geometrically line up are rejected;
- endpoint conflicts are resolved deterministically by first accepted edge;
- missing fixed multi-contacts are hydrated;
- free structural stud/tube contacts are inferred and grouped by part pair.

The editor source project is not mutated by inferred physics-only welds.

## Diagnostics

Catalog diagnostics are available at:

```js
window.BrickLabConnectors
window.BrickLabConnectorDiagnostics
```

Physics/build diagnostics include connector version, catalog validation, migration count and auto-weld/integrity statistics through:

```js
window.__bricklabPhysicsDiagnostics()
```

## Adding a new part

For an existing connector type, add correct connector definitions and mechanical references only. Do not add a special case to snapping or physics.

For a genuinely new connector type:

1. add the type to the v3 validation allow-list;
2. add its compatibility rule in `connector-rules-v3.js`;
3. only add specialized snapping/physics behavior if the rule cannot be expressed by the existing axis/keyed/multi-contact contract;
4. extend catalog validation so malformed new parts fail loudly.

That is the boundary intended to keep connector work from spreading back through the editor.
