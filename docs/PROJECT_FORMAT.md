# BrickLab `.bricklab` project format

BrickLab project files are JSON documents. Format version 2 adds an explicit mechanical connection graph while keeping old v1 part data readable.

## Version 2

```json
{
  "version": 2,
  "name": "Crawler MK2",
  "savedAt": "2026-09-07T13:00:00.000Z",
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
  "position": [0, 0, 0],
  "rotation": [0, 0, 0]
}
```

`instanceId` identifies one placed part. `partId` points to a catalog definition in `parts.js`.

## Connection edge

```json
{
  "id": "48d2...",
  "kind": "hinge",
  "a": {
    "instanceId": "part-a",
    "connectorId": "hole-2",
    "connectorType": "pin-hole"
  },
  "b": {
    "instanceId": "part-b",
    "connectorId": "pin-1",
    "connectorType": "pin"
  }
}
```

Current `kind` values:

- `fixed` — stud/tube attachment; intended to merge parts into one rigid physics group.
- `hinge` — pin/pin-hole attachment; intended to become a revolute joint where appropriate.
- `axle` — axle/axle-hole attachment; intended for rotational drivetrain propagation and physics constraints.
- `generic` — fallback for future connector types.

## Validation rules

When a project is loaded, BrickLab only keeps a connection when:

1. both referenced part instances exist;
2. both referenced connector IDs exist on their part definitions;
3. neither endpoint has already been consumed by another connection.

Invalid or duplicate graph edges are discarded rather than allowed to corrupt the editor state.

## Compatibility

Old version 1 projects contain only `parts`. They still load; their connection graph starts empty. New saves and exports use version 2.

## Future-compatible direction

Potential future fields may include:

- connector joint configuration;
- gear mesh relationships;
- motor configuration;
- sensors and telemetry channels;
- scenario/test configuration;
- custom parts and embedded metadata.

Readers should ignore unknown fields where possible.
