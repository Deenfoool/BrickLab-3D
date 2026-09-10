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

## Coordinates, units and identity

LDraw data is resolved in LDraw units first:

```text
20 LDU = 1 BrickLab stud
1 BrickLab stud = 0.008 m in Rapier
```

The visual coordinate conversion is:

```text
LDraw (x, y, z)
    ↓
BrickLab (x / 20, -y / 20, -z / 20)
```

Each endpoint stores a complete local frame, not only a point. Frames must remain finite, unit-scale, orthonormal and right-handed. The same actual visual centering offset used by the rendered LDraw part is also applied to its connectors.

Connector positions remain in studs throughout BUILD. `physics-adapter-v4.js` converts body-local joint anchors to SI metres exactly once at the Rapier boundary using `PHYSICS_UNITS.studMeters`. Axes and quaternions remain dimensionless. This unit boundary is regression-tested because a studs-as-metres anchor error would amplify an anchor by 125× and can produce catastrophic constraint correction impulses.

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

A geometrically compatible pair may still be BUILD-only if its physical limits, retention or collider envelope are not known.

## Axial fit and occupancy

Long connectors use interval occupancy rather than `occupied=true`.

```text
axle 12L
0 ------------------------------------------------ 12
     [beam]       [gear]       [beam]       [bush]
```

Several non-overlapping reservations can coexist on one axle/bar/pin endpoint. Profile caps, shoulders and section transitions determine legal insertion windows. True interval overlap is rejected; touching interval boundaries are legal.

Multiple graph records may describe one physical continuous shaft passing through several holes of the same opposite part. When those records share the same continuous male occupancy channel, body pair, family and DOF, `physics-policy-v4.js` aggregates them into one axial Rapier constraint. This prevents duplicate co-axial joints from over-constraining the same two rigid bodies while preserving every graph connection ID for validation, release and diagnostics.

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

First-load LDraw hydration also resolves the actual instantiated visual through its stored `WeakRef` before reading the visual centering offset. This covers the normal asynchronous placeholder → real LDraw visual path and is regression-tested so a first instance cannot silently receive `hydrate-error` while a later cached instance works.

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
independent multi-stud structural bundle → one fixed joint
keyed axle ↔ keyed hole                  → prismatic
axle ↔ round hole                        → cylindrical
pin ↔ compatible hole                    → cylindrical + normalized resistance
bar ↔ sliding round hole                 → cylindrical
sliding bar ↔ clip                       → cylindrical where Shadow permits slide
coaxial records on one continuous shaft  → one axial joint per body pair/family/DOF
```

A multi-stud bundle is not certified merely because it contains two different points. V4 checks whether the contacts independently constrain the remaining twist: two contacts displaced only along one common axis are not treated as rigid, while sufficiently separated parallel contacts or non-parallel contact axes can form a rigid bundle.

Keyed axle links additionally participate in drivetrain semantics so rotation can propagate while axial translation remains physically free. Redundant graph records between the same keyed body pair are deduplicated into one semantic shaft link while retaining the complete underlying V4 connection-ID set.

## Physics intentionally blocked without stronger evidence

Some families can be placed correctly in BUILD but are deliberately not simulated from Shadow geometry alone:

- a **single `stud-anti-stud` contact**: it permits twist, but the current coarse LDraw collider envelope cannot safely prove collision-free rotational stops; it remains BUILD-only;
- `ball-socket`: spherical mating geometry does not prove the actual angular cone/stops; the current generic colliders are not a certified substitute;
- `hinge-fingers`: the axis is known, but actual angular stops must come from a proven per-family/per-part profile;
- `round-revolute-interface`: a generic captured round pair may have mechanical stops that are not represented by snapping metadata;
- captured/non-sliding `bar-clip`: rotation envelope/retention is not assumed;
- locking/click/detent hinges: detent angles and torque are not inferred;
- `generic-group`: plugs, magnets, electrical connectors and special couplings require explicit physical semantics.

Ball/socket is currently hard-blocked in SIMULATE until BrickLab has a bounded spherical model. Revolute mechanism families may be unlocked only by an explicit tested override with finite angular limits and evidence.

This is intentional. A missing simulation is preferable to a plausible-looking joint that lets geometry rotate through itself or starts from an overlapping coarse collider envelope.

## Rapier mapping

Approved relationships map to Rapier as follows:

```text
fixed        → fixed joint
revolute     → revoluteWithAxes, only through a bounded/evidenced path
prismatic    → GenericJoint with only connector-frame LinX free
cylindrical  → GenericJoint with connector-frame LinX + AngX free
spherical    → reserved for a future bounded ball/socket implementation
```

For generic prismatic/cylindrical joints, BrickLab installs independent local frames for both bodies before the first world step. A common world constraint frame is constructed so the joint is already satisfied at `t=0`; Rapier is not asked to repair a small connector-frame mismatch and therefore does not receive an artificial correction kick.

Rapier anchors are expressed in metres, not editor studs. The V4 adapter performs the explicit `stud × 0.008` conversion after transforming a connector point into the rigid body's local editor frame. Regression tests inspect the resulting Rapier anchors numerically.

These are key regression guards for the historical class of failures where a long axle could launch a construction at simulation start.

Approved revolute overrides may specify finite limits. The adapter applies those limits through Rapier's revolute `setLimits` API. Limits on generic prismatic/cylindrical or spherical relationships are rejected until a separately tested implementation exists.

## Dynamic disengagement

Open axial profiles are monitored during SIMULATE. A single-record axial connection is released only after its live geometry is invalid for two consecutive post-sync validations.

A bundled continuous shaft is stricter: every underlying engagement is revalidated. If one of several coaxial holes is still engaged, the shared Rapier joint remains active and the invalid-frame counter resets. Only after **all** engagements are outside their valid profile windows for two consecutive validations does V4:

1. remove the physical joint exactly once;
2. mark all bundled connection IDs as released for the session;
3. update joint counters;
4. make contacts available again;
5. rebuild keyed-shaft semantic drivetrain links without those released records;
6. emit one diagnostic release event carrying the complete connection-ID set.

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
6. aggregates redundant axial records where the physical DOF is identical;
7. hardens the plan through the safety gate/override registry;
8. blocks SIMULATE if any V4 record is not physics-certified;
9. creates the normal PhysicsSession;
10. installs V4 joints atomically.

If adapter construction fails, the partially created session is disposed. The user receives a Connector V4-specific reason instead of a misleading "Rapier failed to load" message.

`PhysicsSession.create` itself is ownership-marked by the V4 guard and the global physics runtime contract checks that no later patch silently replaces that entry point.

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
- single-stud contact without a proven collider envelope → BUILD allowed, SIMULATE blocked;
- mechanism without proven angular envelope → BUILD allowed, SIMULATE blocked;
- failed Rapier joint install → entire physics session aborted.

## Cache/version consistency

BrickLab is a no-build GitHub Pages runtime. `scripts/version-runtime.mjs` versions root JavaScript, audio and every `connectors-v4/*.js` file with one runtime generation. Historical explicit query imports are redirected to that same canonical generation so browser cache cannot instantiate two schema/matcher generations in one page.

`tests/import-map-integrity.test.mjs` enforces the production mapping. Browser acceptance pages are also generated from the same import map so a QA page cannot accidentally exercise an older V3/V4 generation.

## Tests

Run:

```bash
npm run test:connectors-v4
```

The acceptance suite covers parser/resolver behavior, pinned Shadow fixtures, shape matching, placement, identity, interval occupancy, graph persistence/history/runtime behavior, first-load hydration, production ownership bridges, live physics recertification, Rapier DOF masks, SI anchor conversion, zero-impulse axle stability, dynamic disengagement/drivetrain split, coaxial axial-bundle aggregation and full-release behavior, multi-stud constraint-rank classification, safety gating, explicit override matching/limits, static physics-entry ownership and production import-map consistency.

GitHub Actions are not required for this workflow; the acceptance suite is designed to run locally.
