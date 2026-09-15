# BrickLab 3D — Technic Mechanical Grammar

Status: **foundation / research specification**

This document defines how BrickLab should understand LEGO Technic as a mechanical system rather than as a bag of visually similar parts. It deliberately separates four questions that are often mixed together:

1. **Where can two parts physically mate?**
2. **What does that mate allow to move?**
3. **Does it transmit torque / linear motion or only support another part?**
4. **What surrounding structure is required for the mechanism to remain valid?**

Production snapping must continue to use authoritative LDraw geometry and LDCad Shadow metadata. Names/categories are useful for library presentation and mechanical classification, but they are not connectivity evidence.

## Evidence hierarchy

From strongest to weakest:

1. **LDCad Shadow snap metadata** for the exact official LDraw geometry/subpart.
2. **Official LDraw semantic primitives** (for example `connect.dat`, `confric.dat`, `connhole.dat`, `axle.dat`, `axlehole.dat`, `axlehol0.dat`, gear tooth primitives).
3. **Reviewed BrickLab part/mechanics overrides** for interfaces or mechanisms that cannot be inferred safely from generic snap geometry.
4. **Description/category text** only for presentation/classification; never for creating a connector.
5. **Arbitrary mesh/cylinder detection** is not acceptable as authoritative Technic connectivity evidence.

References:

- LDraw Primitives Reference: https://wiki.ldraw.org/wiki/Primitives_Reference
- LDCad Shadow Library: https://github.com/RolandMelkert/LDCadShadowLibrary
- LDCad Shadow contribution/meta notes: https://github.com/RolandMelkert/LDCadShadowLibrary/blob/main/CONTRIBUTING.md
- LEGO Education gear principles: https://education.lego.com/en-us/lessons/sm/gears/

BrickLab already follows much of this policy in `connectors-v4`, `connector-discovery`, and `docs/CONNECTOR_DISCOVERY_V4.md`.

---

## 1. Core Technic interface families

### 1.1 Round Technic pin → round Technic hole

**Examples**

- frictionless pin;
- friction pin;
- long pin;
- half pin;
- hybrid axle-pin parts, on the pin side only;
- pin side of perpendicular connectors.

**Geometry evidence**

LDraw represents these with `connect*`, `confric*` and matching `connhole` / `peghole*` families. LDCad Shadow adds exact cylinder profiles including elastic/friction sections.

**Mechanical meaning**

A single seated pin is fundamentally a **revolute joint**, not a fixed weld. The pin may resist rotation because of friction, but friction is not the same thing as removing the rotational degree of freedom.

The insertion path allows axial sliding while assembling. Once seated, collars, elastic ribs, end geometry and/or surrounding parts provide retention. Therefore BrickLab should distinguish:

- `assemblySlide = true`;
- `runtime axial DOF = locked once seated` for an ordinary completed pin joint;
- `runtime angular DOF = free with friction`.

**Important assembly-level rule**

Two beams connected by one pin can rotate about that pin. Two separated pins between the same two rigid bodies usually remove that rotation and make the pair effectively rigid. This means final DOF cannot be decided by looking at each pin independently: BrickLab needs a **multi-contact constraint reduction** pass.

Friction pins should increase rotational resistance / holding force, not silently become fixed joints.

---

### 1.2 Technic axle → Technic axle hole

**Geometry evidence**

LDraw has dedicated keyed primitives: `axle.dat`, `axlehole.dat`, `axlehol0.dat` and several reduced/semi-reduced/two-toothed axle-hole families. LDCad Shadow identifies `axle` and `axleHole` explicitly.

**Mechanical meaning**

The cross profile keys the two parts together rotationally:

- relative rotation: **locked**;
- torque transmission: **yes**;
- axial motion: **allowed until a retainer stops it**.

This is the basic rule that makes a gear, wheel, bush, cam or crank become part of a shaft.

For BrickLab shaft analysis, every axle/axle-hole keyed mate should be eligible to join the same rotational shaft component when their axes are collinear and the occupied spans overlap correctly.

Axial retention is a separate concept and can come from:

- full bush;
- half bush;
- axle with stop;
- shoulder on a connector/gear/hub;
- closed frame/trapped geometry;
- another keyed part acting as a stop.

Do not encode “axle in axle-hole = fixed” because that incorrectly removes legal sliding during assembly and breaks driving-ring / selector / telescoping mechanisms.

---

### 1.3 Technic axle → ordinary round Technic hole

This is one of the most important distinctions in Technic.

The same cross axle that is keyed inside an axle-hole can pass through an ordinary round beam/brick pin hole. In that case the round hole is a **bearing**, not a torque coupling.

Mechanical meaning:

- relative rotation: **free**;
- axial motion: **free until retained**;
- torque transmission to the beam/frame: **no**;
- role: support the shaft and define its axis.

BrickLab's generic V4 cylinder matcher already allows an `A` (axle) male profile inside a sufficiently large `R` (round) female profile. The Technic grammar names this result `technic-round-bearing` so later systems can distinguish “support” from “shaft membership”.

When bushes or other retainers prevent axial translation, the effective joint becomes revolute rather than cylindrical.

---

### 1.4 Bushes and axle stops

A bush is not primarily a new motion pair; its keyed axle hole makes it part of the shaft and its outer shoulder gives **axial retention**.

BrickLab should track two independent roles:

- keyed shaft member;
- axial stop/retainer.

A full bush and half bush differ in axial occupied length and stopping surface location. Axles with integrated stops provide the same retention concept without a separate bush.

Retention must be span-aware: a bush on the wrong side of a bearing does not retain the shaft in the opposite direction.

---

### 1.5 Ball joint → ball socket

LDCad Shadow contains dedicated Technic ball-joint grouping (`techBallJnt`) with sphere matching.

Mechanical meaning:

- center translation: locked;
- orientation: free in multiple axes, limited by surrounding geometry;
- torque transmission: not a keyed shaft coupling.

Base constraint: **spherical**. Angular limits should come from reviewed geometry/part-specific rules rather than a universal guessed cone.

Towball systems and larger Technic/Bionicle balls are not interchangeable merely because both are spheres; size/group evidence must match.

---

### 1.6 Finger / hinge / pivot joints

Interlocking finger geometry produces a one-axis revolute joint. Generic V4 `fingers` already models complementary finger sequences.

Technic also contains special pivots represented by pins, steering elements or part-specific generic Shadow groups. These must preserve their group identity so unrelated same-sized cylinders do not mate.

---

### 1.7 Turntables

Technic turntables are retained rotary bearings:

- axial translation locked;
- radial translation locked;
- rotation about the central axis free;
- may carry loads and may also include gear teeth around the perimeter.

The rotary bearing connection and the gear-tooth transmission are separate relationships and should be represented separately.

---

### 1.8 Linear actuators and guided sliders

LDCad Shadow already distinguishes groups such as `linAct1`, `linAct2`, `linearActBody` and cylinder/slider guide groups.

Externally, an actuator creates a **prismatic output** between its body and rod. Internally, screw rotation is converted into linear extension. BrickLab should model these as two layers:

- structural/guide constraint: prismatic;
- internal transmission: rotary input → linear output with reviewed pitch/limits.

Do not infer screw pitch from visual threads.

---

### 1.9 Driving rings / gearbox selectors

LDCad Shadow includes `drivingRing1` and `drivingRing2` groups.

A driving ring is not a normal gear mesh. It is a coaxial selector:

- it can slide axially on its carrier;
- it remains rotationally coupled to the selector shaft/carrier;
- when engaged, its dog teeth lock a target gear/coupler to the shaft;
- in neutral the target may freewheel.

BrickLab needs explicit engagement states rather than treating these teeth as ordinary spur gears.

---

### 1.10 Universal joints and CV joints

A universal joint transfers shaft rotation across an angle using two revolute axes. It is not equivalent to a single rigid shaft connection. A single Hooke/Cardan joint generally has non-uniform instantaneous velocity when angled; paired joints can cancel this when phased appropriately.

CV joints should be treated separately and only given constant-velocity semantics when a reviewed part/mechanism rule supports it.

LDCad Shadow already contains `uniJnt` group semantics; BrickLab mechanical classification already recognizes universal joints but does not yet model the full compound kinematics.

---

### 1.11 Steering hubs, suspension arms, shock absorbers

These mechanisms are assemblies of several interface types:

- ball/socket or pivot joints for wheel carriers;
- pin/axle pivots for control arms;
- rotating wheel axle/hub interfaces;
- prismatic + spring/damper behavior for shock absorbers.

They must not be reduced to a single “steering” connector. Each physical joint needs its own frame and DOF, then higher-level mechanics describes the assembly.

---

### 1.12 System studs on Technic parts

Technic bricks and hybrid parts can also contain ordinary studs/anti-studs. These remain System-style structural connections. They are relevant to Technic structures but must not be confused with pin/axle mechanics.

---

## 2. Gear and transmission grammar

A gear relationship is **not a snap connector**. It is a spatial mechanical relationship between already-supported rotating/linear members.

BrickLab should keep these concepts separate:

- axle ↔ gear axle-hole: shaft membership;
- beam hole ↔ axle: bearing/support;
- gear teeth ↔ gear teeth: transmission;
- beams/pins ↔ beams/pins: frame maintaining center distance.

### 2.1 Spur gears

Requirements:

1. axes parallel (or anti-parallel);
2. gear planes sufficiently coplanar;
3. center distance equals sum of pitch radii within tolerance;
4. tooth phases align tooth-to-gap rather than tooth-to-tooth;
5. shafts are supported so the center distance stays stable.

BrickLab already implements these geometric checks in `parts5/gear-mesh-math-v1.js`.

For the classic Technic spur family used by BrickLab, pitch radius in studs is:

`pitchRadius = toothCount / 16`

Therefore external spur center distance is:

`(teethA + teethB) / 16 studs`

Examples:

- 8T + 24T → 2 studs;
- 16T + 16T → 2 studs;
- 24T + 40T → 4 studs.

External gears rotate in opposite directions. LEGO Education demonstrates the same direction rule and gear ratio behavior (for example 8T driving 40T gives a 5:1 reduction).

Angular velocity relation for an external pair:

`ω_driven / ω_driver = - teeth_driver / teeth_driven`

The minus sign represents opposite direction.

### 2.2 Bevel and double-bevel gears

Bevel gears transfer rotation between intersecting shafts, commonly perpendicular shafts in Technic. Correct mesh requires compatible pitch cones: BrickLab's current bevel solver uses axis orthogonality plus a common pitch-apex condition.

Double-bevel gears can mesh in configurations not supported by a naive “spur only” rule. Their part-specific tooth geometry and allowed pairings need reviewed metadata, not description-only inference.

### 2.3 Crown gears

Crown gears allow face-style engagement, including right-angle arrangements. They need their own mesh rule because contact geometry differs from ordinary bevel and spur gears.

Current status: **not yet certified in BrickLab mechanical grammar**.

### 2.4 Worm gears

Worm gear interaction is a thread-to-tooth transmission, not ordinary tooth-pitch phase alignment. Required data:

- worm axis;
- handedness / lead;
- compatible driven gear family;
- effective ratio;
- contact position and axis relation.

Backdrivability should not be hard-coded universally. Real LEGO friction often makes worm drives effectively one-way under load, but kinematic reversibility and physical backdrivability are different questions.

Current status: **not yet certified**.

### 2.5 Rack and pinion

Rack/pinion converts rotation to linear translation. Requirements:

- rack travel axis;
- pinion axis perpendicular to rack travel;
- pitch-line distance;
- tooth phase;
- linear displacement per pinion rotation.

Current status: classifier knows racks; production mesh/kinematic coupling still needs dedicated rules.

### 2.6 Differential

A differential is not a pairwise fixed ratio between input and each output. It is a multi-shaft constraint. A basic open differential obeys a relation between carrier and side-shaft angular velocities; exact sign/convention depends on part topology.

BrickLab already deliberately marks differential branches as under-constrained in the simple deterministic Kinematics solver instead of inventing a ratio. That policy should remain until a reviewed differential model is available.

### 2.7 Driving-ring gearbox

The free gear may rotate independently on a shaft until a driving ring engages it. The transmission graph therefore changes topology with selector position.

Required runtime concept: **conditional coupling edge**.

### 2.8 Chain + sprocket

A chain transmits rotation between sprockets with discrete link engagement. For an open chain, sprockets normally rotate in the same direction. Required validation includes sprocket compatibility, chain pitch, path length and wrap.

Current status: not implemented.

### 2.9 Pulley + belt

A belt is a continuous transmission. Open belt → same direction; crossed belt → opposite direction. Ratio follows pulley effective diameters. Belt length/path and collision/clearance need separate validation.

Current status: not implemented.

---

## 3. How a working Technic gear train is structurally built

A valid gear mesh alone is not enough. A functional mechanism needs a frame that keeps the shafts where the tooth geometry expects them.

### 3.1 Bearing support

A rotating axle should pass through round Technic holes acting as bearings. For robust mechanisms BrickLab should prefer two separated coaxial bearing supports rather than a single cantilevered hole.

Validation signals:

- number of round-bearing contacts on each shaft;
- coaxiality of bearing axes;
- distance between supports;
- gear position relative to the support span;
- cantilever/overhang distance.

This does not mean one bearing is always illegal; it means the Design Doctor should distinguish “possible” from “well supported”.

### 3.2 Axial retention

Even a perfectly supported axle can slide out unless retained. BrickLab should determine whether the required direction(s) are blocked by bushes, stops, shoulders or trapped geometry.

For a gear pair, excessive axial play can move the gears out of the common contact plane even though their shaft axes are correct.

### 3.3 Closed / braced frame

Two parallel liftarms can hold two gear shafts at the correct spacing only while the liftarms themselves remain positioned. A robust Technic gearbox usually forms structural loops using perpendicular beams/connectors and multiple pins.

BrickLab should eventually compute body-pair and frame rigidity rather than treating every friction pin as a weld.

### 3.4 Gear between supports vs cantilever gear

Best case: gear is between or near two bearings. Risk increases as a gear sits farther outside the support span because shaft/frame deflection can separate teeth under load.

Design Doctor target diagnostics:

- `gear-mesh-no-bearing-support`;
- `gear-mesh-cantilevered`;
- `shaft-underconstrained`;
- `shaft-unretained-axially`;
- `bearing-axes-not-coaxial`;
- `frame-open-near-geartrain`.

### 3.5 Structural pin semantics

A friction pin should add resistance and retention. It should not by itself change a one-pin hinge into a mathematically fixed joint. Rigidity emerges from the arrangement of contacts.

Target solver step:

1. build all local mates;
2. group mates by rigid body pair;
3. compute the combined constraint rank / remaining DOF;
4. only then decide whether the pair is fixed, revolute, etc.

---

## 4. Current BrickLab coverage vs target

### Already present / usable foundation

- LDCad Shadow hydration and inheritance.
- Primitive discovery for pins, pin holes, axles and axle holes.
- Generic V4 cylinder matching including axle-in-round-hole geometry.
- Sphere / ball socket matching.
- Finger hinge matching.
- Constraint templates: fixed, revolute, prismatic, cylindrical, spherical.
- Spur gear center-distance validation and tooth phase correction.
- Bevel gear apex/axis validation.
- Shaft graph + gear-ratio propagation for deterministic gear trains.
- Direct Kinematics drag of supported shaft/gear/wheel nodes.

### Partial or semantically incomplete

- pin friction vs actual DOF;
- axial retention;
- bush/stop semantics;
- bearing recognition as a first-class mechanical role;
- assembly-level multi-contact rigidity;
- universal-joint compound kinematics;
- differential equations;
- steering/suspension joint limits;
- wheel hub/rim/tire mechanical assembly roles.

### Missing / needs dedicated reviewed rules

- crown gear mesh;
- worm gear mesh;
- rack-and-pinion coupling;
- driving-ring engagement state;
- CV-joint semantics;
- chain/sprocket path;
- pulley/belt path;
- linear actuator screw conversion;
- pneumatic cylinder extension semantics;
- turntable bearing + gear relation as separate simultaneous relationships;
- structural support validator / frame stiffness heuristics.

---

## 5. Implementation plan

### Stage T1 — Interface audit

For every part classified into the Technic library family:

- resolve full effective LDCad Shadow endpoints;
- record inherited LDraw primitive evidence;
- classify each endpoint into Technic interface roles;
- preserve unknown/special groups instead of guessing;
- report per-part interface coverage.

Output should be an audit artifact, not production mutations.

### Stage T2 — Mate semantics

Translate certified connector matches into mechanical roles:

- pin joint;
- keyed shaft coupling;
- round bearing;
- ball joint;
- hinge;
- prismatic guide;
- turntable;
- grouped special connector.

Keep assembly insertion freedom separate from runtime DOF.

### Stage T3 — Shaft and retention graph

Build a shaft graph from:

- axle geometry spans;
- keyed axle-hole members;
- round bearing supports;
- axial retainers/stops.

This graph becomes the authority for Kinematics and Design Doctor shaft diagnostics.

### Stage T4 — Gear grammar

Unify gear definitions around reviewed mechanical descriptors:

- tooth count;
- mesh family;
- pitch radius/cone;
- axis and tooth reference phase;
- keyed/freewheel center interface;
- allowed mating families.

Extend current spur/bevel solver to reviewed crown/worm/rack rules rather than writing one generic “gear touches gear” check.

### Stage T5 — Structural grammar

Analyze the support structure around mechanisms:

- bearing count/span;
- axle retention;
- rigid-body multi-contact DOF;
- frame closure;
- gear overhang/cantilever;
- steering/suspension pivot topology.

### Stage T6 — Advanced transmissions

Implement explicit models for:

- differentials;
- driving rings and gearboxes;
- universal/CV joints;
- chain/sprocket;
- pulley/belt;
- linear actuators;
- pneumatic cylinders.

---

## 6. Rules that BrickLab must never fake

- Do not infer a connector only because a part description contains “Technic”.
- Do not treat every visible cylinder as a pin or hole.
- Do not treat friction as a fixed joint.
- Do not treat an axle in a round hole as a keyed shaft connection.
- Do not treat an axle-hole connection as axially fixed unless a retainer exists.
- Do not mark two gears connected simply because their bounding boxes overlap.
- Do not propagate a differential as if both outputs had fixed ratios.
- Do not assume a worm drive is universally non-backdrivable.
- Do not guess universal/CV joint behavior from names alone.
- Do not call a gear train structurally valid without checking how its shafts are supported.

---

## 7. Machine-readable foundation

`technic/mechanical-grammar-v1.js` contains the first non-production registry for:

- core interface roles;
- certified mate semantics;
- transmission families;
- structural support rules;
- classic spur pitch/ratio helpers consistent with BrickLab's existing gear math.

It is intentionally not imported by production yet. Runtime integration happens only after audit fixtures and tests prove that each rule maps cleanly onto effective LDraw/LDCad evidence.
