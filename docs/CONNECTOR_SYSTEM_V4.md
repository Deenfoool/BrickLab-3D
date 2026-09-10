# Connector System V4

Connector System V4 is BrickLab 3D's geometry-aware connectivity layer for LDraw-backed parts. It is used in production for certified LDraw BUILD snapping, stable endpoint identity, connection persistence, interval occupancy and a fail-closed Rapier physics path.

Connector V3 remains a compatibility layer for native/procedural BrickLab parts and older mechanics code. Gear meshing remains a separate mechanical-contact system and is never converted into a structural V4 connection.

The runtime's historical mode string is `hybrid-pilot` when its deterministic self-test passes. Despite that old name, certified V4 paths are wired into the production `gh-pages` runtime.

## Core invariant

V4 deliberately separates these questions:

```text
CONNECTOR GEOMETRY
Can the profiles physically mate?
        ↓
PLACEMENT
Where may the moving part be positioned/oriented?
        ↓
OCCUPANCY
Which physical interval/seat is occupied?
        ↓
CONSTRAINT / 6 DOF
Which relative motions remain possible?
        ↓
PHYSICS SAFETY
Do we have enough evidence to simulate those motions safely?
        ↓
MECHANICS
Does the interface transmit rotation, torque, ratio, steering, etc.?
```

Evidence at one layer is never automatically promoted to the next. In particular, saved `physicsReady` fields are not trusted; SIMULATE rebuilds certification from live objects and current metadata.

## Connectivity source

Primary metadata source:

```text
RolandMelkert/LDCadShadowLibrary
snapshot: f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec
license: CC BY-SA 4.0
```

The snapshot is pinned so connector semantics do not change underneath a BrickLab release. See `NOTICE_CONNECTORS.md`.

V4 parses the LDCad snapping metadata used by the pinned snapshot, including:

```text
SNAP_CYL
SNAP_CLP
SNAP_FGR
SNAP_GEN
SNAP_SPH
SNAP_INCL
SNAP_CLEAR
```

Malformed or unsupported critical metadata causes diagnostics/quarantine instead of guessed connectivity.

## Runtime modules

```text
connectors-v4/
├─ schema-v4.js
├─ ldcad-parser-v4.js
├─ shadow-resolver-v4.js
├─ identity-v4.js
├─ matcher-v4.js
├─ axial-fit-v4.js
├─ placement-solver-v4.js
├─ candidate-v4.js
├─ activation-v4.js
├─ validity-v4.js
├─ occupancy-v4.js
├─ connections-v4.js
├─ persistence-v4.js
├─ runtime-v4.js
├─ snapping-bridge-v4.js
├─ connections-bridge-v4.js
├─ constraints-v4.js
├─ physics-policy-v4.js
├─ physics-overrides-v4.js
├─ physics-plan-safety-v4.js
├─ physics-guard-v4.js
├─ physics-adapter-v4.js
├─ selftest-v4.js
└─ debug-overlay-v4.js
```

## Coordinates and identity

LDraw data is resolved in LDraw units first:

```text
20 LDU = 1 BrickLab stud
```

The visual coordinate conversion is:

```text
LDraw (x, y, z)
    ↓
BrickLab (x / 20, -y / 20, -z / 20)
```

Each endpoint stores a complete local frame, not only a point. Frames must remain finite, unit-scale, orthonormal and right-handed. The same actual visual centering offset used by the rendered LDraw part is also applied to its connectors.

Endpoint IDs are deterministic hashes of canonical connector geometry/frame/policy data. Repeated inherited studs therefore receive distinct stable IDs while exact duplicate inherited connectors are deduplicated. A hash collision fails loudly instead of merging endpoints.

## Shape/profile matching

V4 is shape-based rather than part-name based. Cylinder sections preserve their real LDCad profiles:

```text
R   round
A   axle/cross
S   square
_L  elastic round transition/end
L_  elastic round transition/end
```

Multi-section holes and pins are never collapsed into one point. Gender, groups, caps, section radius/length, elastic zones, clip dimensions, finger sequences, generic bounds and spherical geometry all participate in matching.

Examples:

```text
A male → A female  keyed fit
A male → R female  round bearing-style fit
R male → R female  round fit
bar R  → clip      radius/profile fit
ball    → socket   center/radius fit
fingers → fingers  complementary sequence fit
```

A geometrically compatible pair may still be BUILD-only if its physical limits are not known.

## Axial fit and occupancy

Long connectors use interval occupancy rather than `occupied=true`.

```text
axle 12L
0 ------------------------------------------------ 12
     [beam]       [gear]       [beam]       [bush]
```

Several non-overlapping reservations can coexist on one axle/bar/pin endpoint. Profile caps, shoulders and section transitions determine legal insertion windows. True interval overlap is rejected; touching interval boundaries are legal.

## BUILD activation

The current activation policy recognizes geometry-certified structural families including:

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
- `generic-group` as an editor/graph family.

For V4-owned LDraw↔LDraw structural pairs, an uncertified result means no snap; V3 is not allowed to silently substitute a coarser connection. Mixed LDraw↔native pairs retain V3 compatibility when the native side has no V4 metadata. Gear mesh always remains a separate solver.

## Transactional snap

A V4 BUILD snap is committed as a transaction:

```text
candidate
  ↓
solve placement
  ↓
apply transform
  ↓
revalidate world geometry
  ↓
check occupancy
  ↓
commit graph record
```

If final validation fails, the transform is rolled back and no V4 record is created.

Connections are revalidated after editing. Missing endpoints, lateral drift, invalid axis alignment, insufficient engagement or keyed twist invalidate the graph record instead of leaving a phantom link.

## Persistence / history

V4 graph records are part of project state and participate in:

- browser Save/Load;
- `.bricklab` Export/Import;
- New/Open flows;
- Undo/Redo;
- part deletion and movement.

Restored records are reconciled against current instance IDs, part IDs, endpoint IDs and current geometry. Persisted physics certification is discarded and rebuilt at SIMULATE time.

## Two-stage SIMULATE certification

Physics is intentionally stricter than BUILD.

`physics-policy-v4.js` first converts live geometry into a proposed 6-DOF relationship. `physics-plan-safety-v4.js` then decides whether BrickLab has enough physical evidence to instantiate that relationship in Rapier.

```text
live V4 graph
   ↓
geometry revalidation
   ↓
physics-policy-v4
   ↓
physics-plan-safety-v4
   ├─ proven → Rapier adapter
   └─ unproven → SIMULATE blocked with a precise reason
```

`physics-overrides-v4.js` is an explicit trust boundary for mechanisms whose snapping geometry does not contain their physical angular envelope. An override must have a stable ID and an evidence string. Matching can be restricted by family, group, part IDs and endpoint IDs.

No generic "trust this connection" flag exists.

## Physics currently certified without special overrides

The following relationships can be derived from profile geometry and current policies:

```text
multi-stud structural bundle → fixed
single ordinary stud contact → revolute around stud axis
keyed axle ↔ keyed hole      → prismatic
axle ↔ round hole            → cylindrical
pin ↔ compatible hole        → cylindrical + normalized resistance
bar ↔ sliding round hole     → cylindrical
sliding bar ↔ clip           → cylindrical where Shadow permits slide
```

Keyed axle links additionally participate in drivetrain semantics so rotation can propagate while axial translation remains physically free. If the keyed profile completely disengages during SIMULATE, the Rapier joint is removed and the semantic shaft graph is rebuilt immediately.

## Physics intentionally blocked without stronger evidence

Some families can be placed correctly in BUILD but are deliberately not simulated from Shadow geometry alone:

- `ball-socket`: spherical mating geometry does not prove the actual angular cone/stops; the current generic colliders are not a certified substitute;
- `hinge-fingers`: the axis is known, but actual angular stops must come from a proven per-family/per-part profile;
- `round-revolute-interface`: a generic captured round pair may have mechanical stops that are not represented by snapping metadata;
- captured/non-sliding `bar-clip`: rotation envelope/retention is not assumed;
- locking/click/detent hinges: detent angles and torque are not inferred;
- `generic-group`: plugs, magnets, electrical connectors and special couplings require explicit physical semantics.

Ball/socket is currently hard-blocked in SIMULATE until BrickLab has a bounded spherical model. Revolute mechanism families may be unlocked only by an explicit tested override with finite angular limits and evidence.

This is intentional. A missing simulation is preferable to a plausible-looking joint that lets geometry rotate through itself.

## Rapier mapping

Approved relationships map to Rapier as follows:

```text
fixed        → fixed joint
revolute     → revoluteWithAxes
prismatic    → GenericJoint with only connector-frame LinX free
cylindrical  → GenericJoint with connector-frame LinX + AngX free
spherical    → reserved for a future bounded ball/socket implementation
```

For generic prismatic/cylindrical joints, BrickLab installs independent local frames for both bodies before the first world step. A common world constraint frame is constructed so the joint is already satisfied at `t=0`; Rapier is not asked to repair a small connector-frame mismatch and therefore does not receive an artificial correction kick.

This is a key regression guard for the historical class of failures where a long axle could launch a construction at simulation start.

Approved revolute overrides may specify finite limits. The adapter applies those limits through Rapier's revolute `setLimits` API. Limits on generic prismatic/cylindrical or spherical relationships are rejected until a separately tested implementation exists.

## Dynamic disengagement

Open axial profiles are monitored during SIMULATE. If current geometry is outside the valid engagement interval for two consecutive post-sync validations:

1. the joint is removed exactly once;
2. joint counters are updated;
3. contacts become available again;
4. keyed-shaft semantic drivetrain links are rebuilt without the released connection;
5. a diagnostic release event is emitted.

The two-frame confirmation provides hysteresis at the profile boundary. Simulation changes are session-local; returning to BUILD restores the normal non-destructive simulation snapshot.

## Friction / resistance

Some sliding interfaces use normalized BrickLab damping/force parameters. They are interactive simulation parameters, not claimed LEGO measurements. Geometry/DOF evidence is kept separate so future calibrated fit data can replace these values without changing connector identity or graph schema.

## Physics guard behavior

Before Rapier starts, `physics-guard-v4.js`:

1. hydrates required Shadow metadata;
2. reconciles the live V4 graph;
3. re-resolves endpoints;
4. validates current geometry;
5. builds a fresh proposed physics plan;
6. hardens it through the safety gate/override registry;
7. blocks SIMULATE if any V4 record is not physics-certified;
8. creates the normal PhysicsSession;
9. installs V4 joints atomically.

If adapter construction fails, the partially created session is disposed. The user receives a Connector V4-specific reason instead of a misleading "Rapier failed to load" message.

## Debugging

`F9` toggles the Connector V4 endpoint/axis overlay. Helpers are removed synchronously before physics collider bounds are measured, so debug geometry cannot change mass/colliders.

Useful console diagnostics:

```js
BrickLabConnectorV4.stats()
BrickLabConnectorV4.get('ldraw-3001')
BrickLabConnectorV4.resolve('3894.dat')
BrickLabConnectorV4.projectConnections()
BrickLabConnectorV4PhysicsGuard.lastPlan()
BrickLabConnectorV4PhysicsGuard.lastFailure()
BrickLabConnectorV4Debug.toggle()
__bricklabPhysicsDiagnostics()
```

## Failure policy

The central rule is:

```text
unknown > guessed
```

Examples:

- Shadow 404 → metadata absent;
- timeout / 429 / 5xx → hydration error, not "no connector";
- malformed snap meta → quarantine;
- invalid scale/mirror → rejected inheritance;
- recursion cycle/budget overflow → diagnostic and terminated branch;
- unsupported physics family → SIMULATE blocked;
- mechanism without proven angular envelope → BUILD allowed, SIMULATE blocked;
- failed Rapier joint install → entire physics session aborted.

## Cache/version consistency

BrickLab is a no-build GitHub Pages runtime. `scripts/version-runtime.mjs` versions root JavaScript, audio and every `connectors-v4/*.js` file with one runtime generation. Historical explicit query imports are redirected to that same canonical generation so browser cache cannot instantiate two schema/matcher generations in one page.

`tests/import-map-integrity.test.mjs` enforces the mapping.

## Tests

Run:

```bash
npm run test:connectors-v4
```

The suite covers parser/resolver behavior, pinned Shadow fixtures, shape matching, placement, identity, interval occupancy, graph persistence/history/runtime behavior, production ownership bridges, live physics recertification, Rapier DOF masks, zero-impulse axle stability, dynamic disengagement/drivetrain split, multi-stud aggregation, safety gating, explicit override matching and import-map consistency.

GitHub Actions are not required for this workflow; the acceptance suite is designed to run locally.
