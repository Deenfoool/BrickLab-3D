# BrickLab 3D architecture

## Core principle

A rendered part and a mechanical part are not the same thing. Geometry answers “what does it look like?”, while metadata answers “how can it connect and behave?”.

The production runtime is currently browser-native ES modules in the repository root so GitHub Pages can serve it without a build step.

## Part schema

Current connector types:

```js
stud
tube
pin
pin-hole
axle
axle-hole
```

Each connector has:

```js
{
  id: 'hole-3',
  type: 'pin-hole',
  position: [x, y, z],
  axis: [x, y, z]
}
```

A part definition contains visual geometry plus connector metadata. Later it will also include collision geometry, mass properties and drivetrain metadata.

## Connection graph

Snapping no longer ends at a transform operation. A successful snap creates an explicit graph edge.

```js
{
  id: '<uuid>',
  kind: 'fixed' | 'hinge' | 'axle',
  a: {
    instanceId: '<part uuid>',
    connectorId: '<connector id>',
    connectorType: '...'
  },
  b: {
    instanceId: '<part uuid>',
    connectorId: '<connector id>',
    connectorType: '...'
  }
}
```

Current connection mapping:

- `stud ↔ tube` → `fixed`
- `pin ↔ pin-hole` → `hinge`
- `axle ↔ axle-hole` → `axle`

Connector endpoints are exclusive. Once an endpoint participates in a graph edge it is considered occupied and the snap engine will not reuse it.

## Connection pipeline

1. User drags a part.
2. Existing links belonging to that moved part are detached once the transform actually changes.
3. Nearby compatible **free** connectors are queried.
4. Candidates are scored by connector distance and axis alignment.
5. Best candidate is previewed in the viewport.
6. On release, the selected part is automatically oriented to the target connector axis.
7. Connector positions are snapped together.
8. A persistent connection edge is created.
9. The new state is committed to undo/redo history and browser autosave.
10. Future simulation will translate graph edges into Rapier rigid groups and joints.

## Visual connector states

- Blue: free connector on selected part.
- Orange: occupied connector on selected part.
- Green: saved connection point / current snap candidate.

## History model

The editor keeps bounded project snapshots for undo/redo. A snapshot includes:

- all part instances;
- transforms;
- colors;
- project name;
- complete connection graph.

This is intentionally project-state history rather than mesh history, which keeps it independent from the eventual geometry source.

## Geometry strategy

The current MVP uses procedural geometry to validate the editor. LDraw will be introduced through a geometry adapter so editor logic does not depend on the source of the mesh.

```text
PartDefinition
     |
     +-- ProceduralGeometryAdapter (current)
     |
     +-- LDrawGeometryAdapter (next)
```

Selection, snapping, connection graph, project files and physics metadata should remain stable while visual meshes are replaced.

## Physics adapter target

The connection graph is deliberately shaped to become physics input:

```text
fixed graph components
       ↓
rigid body groups
       ↓
hinge edges ──→ revolute joints
axle edges  ──→ drivetrain / revolute constraints
       ↓
Rapier world
```

The next physics milestone should not infer mechanical relationships from mesh overlap. It should consume explicit graph edges.
