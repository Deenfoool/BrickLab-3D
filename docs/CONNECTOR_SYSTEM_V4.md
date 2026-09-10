# Connector System V4

Connector System V4 is BrickLab 3D's geometry-aware connectivity layer for LDraw-backed parts. It is now used in production for certified LDraw structural snapping, connection persistence/occupancy and a fail-closed Rapier physics path.

Connector V3 still exists as a compatibility layer for native/procedural BrickLab parts and older mechanics code. Gear meshing and other drivetrain relations remain separate mechanical systems; V4 does not turn gear contact into a structural joint.

The runtime's historical internal mode string is currently `hybrid-pilot` when its self-test passes. Despite that name, the certified V4 path is wired into the production `gh-pages` runtime.

## Core rule

V4 deliberately separates four questions:

```text
1. Geometry
   Can the two physical connector profiles fit?

2. Placement
   Where can the moving part be positioned and oriented?

3. Constraint / physics
   Which relative degrees of freedom remain in SIMULATE?

4. Mechanics
   Does the interface transmit rotation, torque, steering motion, ratio, etc.?
```

A positive answer at one layer is not automatically evidence for the next. In particular, persisted connection records are never trusted to self-certify physics.

## Upstream connectivity source

Primary metadata source:

```text
RolandMelkert/LDCadShadowLibrary
snapshot: f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec
license: CC BY-SA 4.0
```

The snapshot is pinned so connector metadata cannot change underneath a BrickLab release. See `NOTICE_CONNECTORS.md` for attribution.

LDCad Shadow metadata supplements LDraw geometry with connection information. V4 currently parses:

```text
SNAP_CYL
SNAP_CLP
SNAP_FGR
SNAP_GEN
SNAP_SPH
SNAP_INCL
SNAP_CLEAR
```

Malformed or unsupported metadata produces diagnostics instead of guessed connectivity.

## Runtime pipeline

```text
LDraw part
  ↓
pinned LDCad Shadow metadata
  ↓
strict parser + recursive resolver
  ↓
canonical V4 connector frames/profiles
  ↓
geometry matcher
  ↓
placement solver
  ↓
activation policy
  ├─ BUILD snap candidate
  ├─ V4 connection graph + occupancy
  └─ SIMULATE physics preflight
          ↓
     fresh physics policy plan
          ↓
     Rapier V4 adapter
```

Relevant modules include:

```text
connectors-v4/
├─ schema-v4.js
├─ ldcad-parser-v4.js
├─ shadow-resolver-v4.js
├─ matcher-v4.js
├─ axial-fit-v4.js
├─ placement-solver-v4.js
├─ candidate-v4.js
├─ activation-v4.js
├─ occupancy-v4.js
├─ connections-v4.js
├─ persistence-v4.js
├─ runtime-v4.js
├─ snapping-bridge-v4.js
├─ connections-bridge-v4.js
├─ constraints-v4.js
├─ validity-v4.js
├─ physics-policy-v4.js
├─ physics-guard-v4.js
├─ physics-adapter-v4.js
└─ debug-overlay-v4.js
```

## Coordinates and connector frames

Shadow/LDraw data is resolved in LDraw units first:

```text
20 LDU = 1 BrickLab stud
```

The current LDraw visual conversion is:

```text
LDraw (x, y, z)
    ↓
BrickLab (x / 20, -y / 20, -z / 20)
```

Each V4 endpoint stores a complete local frame, not only a point. The canonical connector axis is local negative Y. The resolved frame is validated to remain finite, orthonormal and right-handed.

The same real visual centering offset used by the LDraw object is applied to connectivity, so snapping does not rely on part-name or nominal-size guesses.

## Shape matching

Cylinder profiles preserve LDCad section geometry:

```text
R   round
A   axle / cross
S   square
_L  elastic round transition/end
L_  elastic round transition/end
```

Matching is directional where physical fit is directional:

```text
male R → female R   allowed when radius/profile fit
male A → female A   keyed
male S → female S   keyed
male A → female R   geometrically possible
male S → female R   geometrically possible
male R → female A   not assumed
male R → female S   not assumed
```

Groups are hard semantic gates. Different non-empty groups do not connect merely because their dimensions are similar.

V4 also supports clips, alternating finger/hinge profiles, generic grouped bounds and spherical connectors.

## Axial fit and occupancy

Long connectors are not represented by a single occupied boolean. Axles, pins and bars reserve intervals along their connector channel.

```text
axle
0 --------------------------------------------- 12L
     [beam]      [gear]      [beam]      [wheel]
```

Independent parts can legally occupy different non-overlapping intervals of the same shaft. Profile caps and section geometry define legal insertion windows.

This interval model is used both when committing BUILD connections and when restoring/reconciling saved graphs.

## Production activation families

The activation policy currently recognizes certified structural families including:

- `technic-axle-keyed-hole`;
- `technic-axle-round-hole`;
- `technic-pin-hole`;
- `stud-anti-stud`;
- `bar-round-hole`;
- `bar-clip`;
- `keyed-shaft-interface`;
- `round-cylindrical-interface`;
- `round-revolute-interface`;
- `ball-socket`;
- `hinge-fingers`;
- `generic-group` as an editor/graph family only unless an explicit physics rule exists.

Shape-based round interfaces are classified from compatible profile geometry, not from hard-coded part names.

## BUILD ownership and V3 compatibility

For LDraw structural pairs owned by V4, the snapping bridge fails closed: if Shadow metadata is loading, malformed, quarantined or not certified, V3 is not allowed to create a coarse substitute connection for the same pair.

Gear mesh is intentionally excluded from that rule and remains owned by the drivetrain/gear solver.

Native/procedural BrickLab pieces may continue to use Connector V3 where no V4 definition exists.

## Connection persistence

V4 has its own graph with stable endpoint identity, occupancy reservations and project persistence. New/Open actions clear stale graph state appropriately; saved/imported records are reconciled against the current objects and current endpoint geometry.

A saved field such as:

```text
physicsReady: true
```

is never treated as authority. SIMULATE always re-certifies live geometry from the current part definitions.

## Physics preflight

Before `PhysicsSession` is allowed to start, `physics-guard-v4.js`:

1. hydrates required V4 endpoint metadata;
2. reconciles the graph against current objects;
3. resolves each endpoint again;
4. validates current world-space connection geometry;
5. builds a new runtime-only physics plan;
6. refuses SIMULATE if any V4 connection lacks an explicit supported physics rule;
7. creates the normal Rapier session only after the plan passes;
8. installs all V4 Rapier joints atomically.

If any V4 joint cannot be constructed, the partially created physics session is disposed. BrickLab never intentionally continues with a half-installed V4 constraint graph.

## Rapier constraint mapping

The physics adapter maps approved rules to explicit Rapier constraints:

```text
fixed        → fixed joint
revolute     → revoluteWithAxes
prismatic    → GenericJoint, only connector-frame LinX free
cylindrical  → GenericJoint, connector-frame LinX + AngX free
spherical    → spherical joint
```

Rapier's joint frame X is aligned to the V4 connector axis. Independent local frames are assigned for both rigid bodies. This matters for cases such as an axle and a rotated Technic brick: the same physical world axis does not have to be represented by the same model-local axis on both bodies.

For multi-stud attachment between the same two parts, geometrically distinct contacts are aggregated into one fixed physics constraint instead of creating multiple competing fixed joints. A single stud contact remains rotationally free around the stud axis.

## Dynamic disengagement

Open axial profiles such as axles/pins/bars are not permanently trapped by their initial joint. Sliding connections are monitored after physics synchronization.

When current geometry shows the profiles have completely left their valid engagement window for two consecutive validation frames, the V4 Rapier joint is removed. Contacts between the two rigid bodies are then allowed again.

The two-frame confirmation avoids boundary chatter while still allowing an axle or bar to leave an open hole naturally.

This release is session-local. BUILD's persistent project graph is not rewritten from simulation motion; returning from SIMULATE restores the editor's project state through the existing non-destructive simulation workflow.

## Resistance / friction model

Some sliding interfaces have a small normalized axial resistance model in BrickLab. These values are simulation parameters chosen for stable interactive behavior. They are **not claimed measurements of LEGO parts**.

Geometry and free/locked DOF come from connector evidence. A future calibrated material/fit database can replace the normalized resistance values without changing the V4 graph schema.

## Intentionally blocked physics

V4 remains fail-closed where Shadow geometry alone is insufficient.

Current examples:

- `generic-group` — may represent plugs, magnets, electrical connectors or special couplings; group/shape compatibility is not enough to choose a Rapier joint;
- locking/click/detent hinge groups — the metadata does not provide a sufficiently proven detent torque/angle model.

These connections may exist in BUILD where their geometry is certified, but SIMULATE is blocked until an explicit physical rule is available. BrickLab prefers an explicit unsupported state over plausible-looking false physics.

## Debugging

`F9` toggles the Connector V4 endpoint/axis overlay.

The overlay is built as non-interactive child debug geometry. Before any physics session measures collider bounds, the physics guard dispatches a synchronous preflight event and the overlay removes all helpers. Debug visuals therefore cannot enlarge a part's physics `Box3` or alter mass/collider construction.

Useful browser diagnostics:

```js
BrickLabConnectorV4.stats()
BrickLabConnectorV4.get('ldraw-3001')
BrickLabConnectorV4.resolve('3894.dat')
BrickLabConnectorV4.projectConnections()
BrickLabConnectorV4PhysicsGuard.lastPlan()
BrickLabConnectorV4PhysicsGuard.lastFailure()
BrickLabConnectorV4Debug.toggle()
```

## Failure policy

The central invariant remains:

```text
unknown > guessed
```

Examples:

- raw Shadow 404 → metadata absent;
- timeout / 429 / 5xx / network error → hydration error, not absence;
- malformed metadata → warning/quarantine rather than guessed connector;
- invalid inherited scale/mirror → rejected inheritance;
- recursion cycle/budget overflow → branch terminated with diagnostic;
- unsupported physics family → SIMULATE blocked for that connection;
- failed Rapier adapter construction → whole physics session aborted.

## Cache/version consistency

BrickLab is a no-build GitHub Pages runtime, so module URL identity matters. `scripts/version-runtime.mjs` now versions root JavaScript, audio modules and every `connectors-v4/*.js` module with one canonical runtime tag.

A few early V4 source files still contain historical query strings in relative imports. The version generator discovers those exact URLs and maps them to the current canonical module URL. This prevents two schema/matcher generations from being instantiated in the same page.

`tests/import-map-integrity.test.mjs` enforces this invariant.

## Tests

Run the complete Connector V4 acceptance suite with:

```bash
npm run test:connectors-v4
```

The suite covers parser/resolver behavior, upstream fixtures, matching, placement, identity, occupancy, graph persistence/runtime behavior, production bridges, live physics recertification, Rapier DOF masks, axle/hole zero-impulse stability, dynamic disengagement, multi-stud aggregation, shape-based round interfaces, fail-closed locking hinges/generic groups and import-map generation consistency.

Existing Physics/Parts tests remain relevant because V4 is intentionally integrated with, rather than a replacement for, the rest of BrickLab's drivetrain and simulation architecture.
