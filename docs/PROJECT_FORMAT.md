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
  "groupId": null,
  "position": [0, 0, 0],
  "rotation": [0, 0, 0]
}
```

`instanceId` identifies one placed part. `partId` points to a catalog definition in `parts.js`. `groupId` is an optional editor-only logical group identifier.

## Connection edge

```json
{
  "id": "48d2...",
  "kind": "bearing",
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

Current `kind` values:

- `fixed` — stud/tube attachment; parts belong to the same rigid physics component.
- `hinge` — pin/pin-hole attachment; a revolute connection.
- `bearing` — axle through a normal Technic beam hole; keeps the axle located while allowing free rotation.
- `axle` — keyed axle/axle-hole attachment; transmits rotation and joins parts into the same drivetrain shaft unless one endpoint is a powered motor output.
- `generic` — fallback for future connector types.

## Drivetrain relationships

Shaft membership and gear meshes are currently derived from part placement and the connection graph at simulation time, so they are not persisted as extra edges yet.

- Rigid `axle` edges form one shaft.
- A Lab Motor output seeds shaft RPM.
- Spur gears on separate shafts are recognized automatically when their axes are parallel, their faces are aligned, and their pitch circles are at mesh distance.
- Gear RPM is propagated from tooth count and rotation direction.

This keeps `.bricklab` files compact while the drivetrain model is still evolving.

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
- persisted manual gear-mesh overrides;
- motor torque curves and controller settings;
- sensors and telemetry channels;
- scenario/test configuration;
- custom parts and embedded metadata.

Readers should ignore unknown fields where possible.
