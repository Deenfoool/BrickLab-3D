# BrickLab 3D architecture

## Core principle

A rendered part and a mechanical part are not the same thing. Geometry answers “what does it look like?”, while metadata answers “how can it connect and behave?”.

## Planned part schema

```ts
type ConnectorType =
  | 'stud'
  | 'tube'
  | 'pin'
  | 'pin-hole'
  | 'axle'
  | 'axle-hole'
  | 'gear'
  | 'wheel-hub'
  | 'motor-output'

type Connector = {
  id: string
  type: ConnectorType
  position: [number, number, number]
  axis: [number, number, number]
}
```

Each part definition will eventually include:

- render geometry or LDraw source;
- collision geometry;
- mass and center of mass;
- compatible connectors;
- optional gear tooth count / pitch radius;
- optional motor torque and RPM curve;
- optional break force / break torque.

## Connection pipeline

1. User drags a part.
2. Nearby compatible connectors are queried.
3. Candidate connectors are scored by distance and axis alignment.
4. Best candidate is previewed in the viewport.
5. On release, transform snaps to the candidate.
6. Connection is added to the build graph.
7. Simulation converts the connection graph into rigid bodies and Rapier joints.

## Geometry strategy

The current MVP uses procedural geometry to validate the editor. LDraw will be introduced through a geometry adapter so editor logic does not depend on the source of the mesh.

```text
PartDefinition
     |
     +-- ProceduralGeometryAdapter
     |
     +-- LDrawGeometryAdapter
```

This keeps selection, snapping, save files and physics metadata stable while the visual asset source evolves.
