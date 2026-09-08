# BrickLab `.bricklab` project format

BrickLab project files are JSON documents. The project container is currently format version 2. Connector System v3 upgrades the connection-edge schema without breaking old v1/v2 projects.

## Project container

```json
{
  "version": 2,
  "name": "Crawler MK2",
  "savedAt": "2026-09-08T09:00:00.000Z",
  "parts": [],
  "connections": []
}
```

## Part instance

```json
{
  "instanceId": "8ec6...",
  "partId": "beam-9",
  "color": 2976196,
  "groupId": null,
  "position": [0, 0, 0],
  "rotation": [0, 0, 0]
}
```

`instanceId` identifies one placed part. `partId` points to a catalog definition in `parts.js`. `groupId` is editor-only logical grouping metadata.

## Connector System v3 edge

```json
{
  "id": "48d2...",
  "schemaVersion": 3,
  "ruleVersion": "connector-system-v3",
  "kind": "bearing",
  "contactCount": 1,
  "a": {
    "instanceId": "beam-a",
    "connectorId": "hole-2",
    "connectorType": "pin-hole"
  },
  "b": {
    "instanceId": "axle-b",
    "connectorId": "axle-1",
    "connectorType": "axle"
  }
}
```

Current compatibility rules are centralized in `connector-rules-v3.js`:

- `stud ↔ tube` → `fixed`
- `pin ↔ pin-hole` → `hinge`
- `axle ↔ pin-hole` → `bearing`
- `axle ↔ axle-hole` → `axle`

`axle ↔ axle-hole` is keyed and snaps twist in 90° symmetry steps.

## Multi-contact fixed links

A single physical Brick/Plate attachment may use several stud/tube pairs. Connector v3 stores that as one graph edge with extra contacts instead of many independent fixed edges:

```json
{
  "schemaVersion": 3,
  "kind": "fixed",
  "contactCount": 4,
  "a": { "instanceId": "brick-a", "connectorId": "stud-0", "connectorType": "stud" },
  "b": { "instanceId": "plate-b", "connectorId": "tube-0", "connectorType": "tube" },
  "contacts": [
    {
      "a": { "instanceId": "brick-a", "connectorId": "stud-1", "connectorType": "stud" },
      "b": { "instanceId": "plate-b", "connectorId": "tube-1", "connectorType": "tube" }
    }
  ]
}
```

Every connector endpoint may belong to only one connection edge, including endpoints listed in `contacts`.

## Runtime integrity rules

Before physics starts, Connector v3 rebuilds a safe physics snapshot. A connection is accepted only when:

1. both part instances exist;
2. both connector IDs exist in the current part definitions;
3. connector types have a registered compatibility rule;
4. the two parts are different instances;
5. connector positions and axes still satisfy the rule geometry;
6. no endpoint is already owned by another edge.

The runtime also normalizes stale `kind` and `connectorType` metadata, hydrates missing multi-contact stud pairs, and infers structural stud/tube welds that are geometrically present but absent from older project graphs. Invalid edges are dropped from the physics snapshot rather than passed to Rapier.

## Legacy migration

- v1 projects with only `parts` still load with an empty explicit graph.
- v2 connection graphs are kept when valid.
- Stored/browser projects are normalized to Connector v3 metadata before `app.js` restores them.
- Imported `.bricklab` files are normalized before the editor reads them.
- Unknown future fields should be ignored by readers where possible.

The migration changes connector metadata only; part transforms and project identity are preserved.

## Drivetrain relationships

Shaft membership and gear meshes are derived from the connection graph and part placement at simulation time:

- `axle` edges can join shaft membership;
- Lab Motor outputs seed powered shaft state;
- spur gears on separate shafts are recognized from compatible geometry and tooth data;
- gearbox and differential semantics are layered on top of connector-defined shaft endpoints.

See `docs/CONNECTORS.md` for the connector architecture and extension contract.
