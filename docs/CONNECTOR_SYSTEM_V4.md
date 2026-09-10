# Connector System V4

Connector System V4 is the replacement connectivity architecture for BrickLab 3D.

The system is being introduced **alongside Connector System V3**. V4 is currently in **observe mode**: it resolves and validates rich LDraw/LDCad connectivity metadata, but it does not yet replace the active V3 snap graph or create Rapier joints. This is intentional. A wrong connector is worse than a missing connector because it can silently create impossible assemblies or unstable physics.

## Design rule

V4 separates four questions that V3 previously compressed into a connector `type`:

```text
1. Geometry
   Can these physical connector shapes fit each other?

2. Placement
   Where may the moving part be positioned/oriented while snapping?

3. Kinematics / physics
   Which degrees of freedom remain after the physical connection is made?

4. Mechanics
   Does the connection transmit rotation, torque, gear ratio, steering motion, etc.?
```

These layers must not be inferred from one another unless a rule is explicitly justified.

In particular:

- `slide=true` in LDCad is an editor snapping property. It is **not** by itself proof that the final Rapier joint must be prismatic/cylindrical.
- geometric compatibility does not imply a structural connection;
- gear mesh is mechanical contact, not a rigid connector;
- a V4 `kinematicHint` is never sufficient to create physics by itself;
- all current V4 matcher results therefore carry `physicsReady: false`.

## Upstream connectivity source

Primary source:

```text
RolandMelkert/LDCadShadowLibrary
snapshot: f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec
license: CC BY-SA 4.0
```

The snapshot is pinned so that connector behaviour cannot change underneath a BrickLab release.

The Shadow Library exists specifically to supplement LDraw files with snapping metadata that the base LDraw format does not contain. See `NOTICE_CONNECTORS.md` for attribution.

V4 keeps the existing LDraw primitive analyser only as a future fallback. Shadow metadata has priority when available.

## Source files

```text
connectors-v4/
├── schema-v4.js
├── ldcad-parser-v4.js
├── matcher-v4.js
├── shadow-resolver-v4.js
└── runtime-v4.js
```

### `schema-v4.js`

Defines the canonical V4 connector data model and validation rules.

### `ldcad-parser-v4.js`

Strict parser for LDCad Shadow metas. It currently understands:

```text
SNAP_CYL
SNAP_CLP
SNAP_FGR
SNAP_GEN
SNAP_SPH
SNAP_INCL
SNAP_CLEAR
```

Unknown or malformed data becomes a diagnostic warning. It is not silently converted into a guessed connector.

### `matcher-v4.js`

Answers only the geometry/family compatibility question. It intentionally does not create editor transforms or physics joints yet.

### `shadow-resolver-v4.js`

Combines connector metadata through the same structural concepts used by LDraw/LDCad:

- LDraw type-1 transforms;
- recursive subpart inheritance;
- primitive shadow information;
- `SNAP_CLEAR` overrides;
- `SNAP_INCL`;
- connector/include grids;
- scale policies;
- mirror policies;
- cycle and traversal guards.

### `runtime-v4.js`

Attaches resolved V4 connectivity to instantiated LDraw definitions as `definition.connectivityV4` while V3 continues to operate normally.

## Canonical V4 connector

A V4 connector is a shape in a local coordinate frame, not a point label.

Simplified example:

```js
{
  schemaVersion: 4,
  id: 'connhole',
  family: 'cylinder',
  gender: 'female',
  group: null,

  frame: {
    positionLdu: [0, 0, 0],
    orientation: [
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]
  },

  geometry: {
    sections: [
      { shape: 'R', radiusLdu: 8, lengthLdu: 2 },
      { shape: 'R', radiusLdu: 6, lengthLdu: 16 },
      { shape: 'R', radiusLdu: 8, lengthLdu: 2 }
    ],
    caps: 'none',
    centered: true
  },

  snap: {
    slide: true
  },

  inheritance: {
    scale: 'none',
    mirror: 'cor'
  },

  source: {
    kind: 'ldcad-shadow',
    file: 'p/connhole.dat',
    line: 6,
    meta: 'SNAP_CYL'
  }
}
```

## Coordinate systems

Shadow/LDraw connector data is kept in LDraw units until resolution has finished.

```text
20 LDU = 1 BrickLab stud
```

LDraw and the current BrickLab LDraw visual have different Y/Z orientation. V4 performs the same conversion used by the visual pipeline:

```text
LDraw point (x, y, z)
    ↓
BrickLab (x / 20, -y / 20, -z / 20)
```

The final visual centering offset is added after this conversion. V4 does not guess this offset from the part name or nominal dimensions: `runtime-v4.js` observes the actual centered LDraw visual instance and uses its exact offset.

The original LDraw-space frame is retained alongside the BrickLab-space frame for diagnostics and reproducibility.

## Cylinder profiles

`SNAP_CYL` is represented as a segmented axial profile.

Supported LDCad section shapes:

```text
R   round
A   axle/cross
S   square
_L  elastic round transition/end
L_  elastic round transition/end
```

Example Technic pin hole:

```text
R 8 2 | R 6 16 | R 8 2
```

Example Technic axle:

```text
A 6 80
```

The matcher is deliberately asymmetric where necessary:

```text
male R -> female R      allowed when radius fits
male A -> female A      keyed candidate
male S -> female S      keyed candidate
male A -> female R      geometrically possible candidate
male S -> female R      geometrically possible candidate
male R -> female A      NOT assumed
male R -> female S      NOT assumed
```

The flexible `_L` / `L_` shapes are retained as `elastic: true` and currently produce only a friction hint. V4 does not invent a friction coefficient from them.

## Gender and groups

Cylinder and generic connectors carry `male` / `female` gender. Clips are female by definition. Finger connectors carry an alternating male/female sequence.

A non-empty LDCad `group` is a hard compatibility gate in V4:

```text
no group + no group  -> may match by geometry
same group           -> may match
one group only       -> reject
different groups     -> reject
```

This prevents geometrically similar but semantically unrelated systems from snapping together, such as special click hinges or proprietary connector families.

## Clips

`SNAP_CLP` is modeled separately from a cylinder. A clip can match a male round cylindrical section when its radius is compatible.

The matcher does not yet solve the final angular seating/contact arc. That belongs to the future placement solver, not the coarse compatibility pass.

## Fingers and hinges

`SNAP_FGR` stores:

- first finger gender;
- complete alternating segment sequence;
- radius;
- optional group;
- centering and frame.

V4 tests the overlapping sequence rather than merely checking `hinge + hinge`. Two male finger intervals occupying the same axial region are rejected.

A successful fingers match produces a `revolute` **hint**, not an active Rapier revolute joint. Click detents, friction and rotation limits still require explicit mechanics/constraint metadata.

## Generic and spherical connections

`SNAP_GEN` requires a matching group and opposite gender.

When Shadow metadata explicitly requests size matching, V4 also compares the bounding signature. `placement=free` produces a spherical kinematic hint.

Legacy `SNAP_SPH` is preserved as a sphere family.

Angular limits are not present in enough Shadow data to safely infer ball-joint physics, so V4 does not activate them yet.

## `SNAP_INCL`

Includes are intentionally **non-recursive**, matching the LDCad specification.

V4 behaviour:

```text
current shadow
    └── SNAP_INCL A
            ├── connectors in A        YES
            └── SNAP_INCL B inside A   NO
```

Nested includes produce `nested-include-not-followed` diagnostics instead of being followed accidentally.

The include's explicit `pos`, `ori`, `scale` and `grid` are applied to the included data. Explicit include scaling is separate from a connector's inheritance scaling policy.

## `SNAP_CLEAR`

Every inherited connector retains all relevant clear IDs. A later:

```text
SNAP_CLEAR [ID=axleHole]
```

removes only connectors carrying that ID.

A clear without an ID removes all inherited/current connectors collected at that level so far.

Order matters and V4 preserves source order.

## Grid expansion

LDCad grid syntax is preserved exactly:

```text
[C] Xcount [C] Zcount Xstep Zstep
```

Example:

```text
C 4 C 2 20 20
```

expands to an exactly centered 4×2 grid with 20 LDU pitch.

Grid offsets are transformed by the connector/include orientation before being added to its position.

## Scale inheritance

V4 distinguishes two unrelated concepts:

1. an explicit `SNAP_INCL [scale=x y z]` transform;
2. `SNAP_CYL/CLP/FGR/GEN ... [scale=...]`, which controls whether metadata may survive scaling of an official LDraw reference.

For inherited connector metadata V4 recognizes:

```text
none
YOnly
ROnly
YandR
```

V4 rejects shear. Cylinder/clip/finger radial X/Z scale must remain symmetric because the current schema intentionally has no elliptical connector primitive.

For `YandR`, V4 currently follows the conservative literal interpretation of the LDCad documentation: the reference must satisfy the YOnly rule or the ROnly rule. A transformation requiring independent simultaneous axial and radial scaling is not accepted until confirmed by an upstream test case.

## Mirror inheritance

Mirrored inherited information is accepted only where the Shadow connector policy permits correction (`mirror=cor`). Otherwise it is dropped with a diagnostic.

The resolved connector frame is normalized back to a right-handed orthonormal frame. V4 never leaves a sheared or non-orthogonal orientation in a connector record.

## Failure policy

The most important V4 invariant is:

```text
unknown > guessed
```

Meaning: an explicit unknown/error state is preferable to a plausible-looking but unsupported connection.

Examples:

- HTTP 404 from the pinned Shadow source: metadata is absent;
- timeout / 429 / 5xx / network error: hydration error, NOT metadata absence;
- malformed `secs`: warning + no connector;
- unsupported family/meta: warning + no invented equivalent;
- invalid inheritance scale: warning + connector not inherited;
- recursion cycle: warning + branch terminated;
- traversal budget exceeded: warning + branch terminated;
- unknown physics DOF: `physicsReady: false`.

## Network behaviour

The runtime first loads the Git tree manifest for the pinned Shadow commit. This gives an exact set of `.dat` files that exist in the Shadow Library and avoids probing every LDraw primitive with a raw HTTP request.

If GitHub's API endpoint is rate-limited while raw GitHub remains reachable, V4 falls back to exact raw-file lookups. A raw 404 still means absent metadata; other failures remain errors.

## Current rollout: observe mode

Production loads V4 in:

```text
mode = observe
```

V4 may attach:

```js
definition.connectivityV4
```

but it does **not** mutate:

```js
definition.connectors
project connections
V3 endpoint occupancy
V3 snap candidates
Rapier joints
```

This lets us inspect V4 results on real parts without changing established BUILD/SIMULATE behaviour.

Browser diagnostics are available through:

```js
BrickLabConnectorV4.stats()
BrickLabConnectorV4.get('ldraw-3001')
BrickLabConnectorV4.resolve('3894.dat')
BrickLabConnectorV4.match(connectorA, connectorB)
```

## Required work before V4 can become authoritative

The next stages are deliberately separated:

```text
V4.1  real-part audit / V3-vs-V4 comparison
V4.2  axial placement solver + caps/contact depth
V4.3  interval occupancy for axle/bar/pin profiles
V4.4  explicit constraint classifier and DOF model
V4.5  editor snapping pilot for selected families
V4.6  Rapier constraint pilot
V4.7  migration of project connection schema
V4.8  V3 compatibility bridge / removal plan
```

Before any family becomes authoritative, it needs fixtures covering at least:

- normal match;
- reversed source/target order;
- rotation;
- mirrored part/reference where allowed;
- rejected mirror where prohibited;
- legal inherited scale;
- illegal inherited scale;
- multiple connectors close together;
- occupied intervals;
- save/reload;
- BUILD -> SIMULATE transition;
- disconnect/reconnect;
- malformed/missing upstream data.

## Axial occupancy requirement

V3's endpoint occupancy is intentionally not reused as the final V4 model for long profiles.

An axle can pass through several holes/gears/bushes at different axial positions. Therefore V4 will represent occupancy as intervals on an axial connector channel rather than a single boolean:

```text
axle profile
0 ------------------------------------------------ 12L
     [beam]     [gear]       [beam]     [wheel]
```

Two reservations conflict only when their occupied axial interiors overlap illegally. Touching boundaries may be legal. Stops/collars/end caps will constrain the legal insertion interval separately.

## Physics requirement

No matcher result is allowed to create a physics joint until a constraint classifier explicitly marks it `physicsReady: true`.

The classifier will operate in connector-local coordinates and describe six relative degrees of freedom explicitly rather than relying only on names such as `hinge` or `bearing`.

Target model:

```text
translation radial X  locked/free/limited
translation axial Y   locked/free/limited
translation radial Z  locked/free/limited
rotation tilt X       locked/free/limited
rotation axial Y      locked/free/limited
rotation tilt Z       locked/free/limited
```

A semantic joint label may then be derived for Rapier, not the other way around.

## Mechanics remains separate

The following are not ordinary structural connector matching:

- gear/gear mesh;
- worm/gear mesh;
- rack/pinion mesh;
- differential relations;
- universal joint phase/ratio;
- driving rings;
- linear actuators;
- motors;
- wheel/ground contact.

They may use V4 connector frames as anchors, but their transmission equations belong to the mechanics layer.

## Tests

Current pure V4 tests run without a browser or Rapier:

```bash
node --test tests/connectors-v4.test.mjs
```

The fixture suite covers parsing, centered grids, malformed metadata, cylinder shape compatibility, generic group/size matching, finger sequences, subpart inheritance, `SNAP_CLEAR`, `SNAP_INCL`, explicit include scaling, `YOnly` inheritance, coordinate conversion, network failure semantics and recursion-cycle termination.

These tests are additive. Existing Connector V3/physics tests remain authoritative for current production behaviour while V4 stays in observe mode.
