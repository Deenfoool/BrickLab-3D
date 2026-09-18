# LEGO Mechanical Semantics Research Baseline

Date: 2026-09-18

This document is the evidence baseline for Mechanics Next. It is not a list of part-ID hacks. It defines how physical LEGO/Technic interfaces should be interpreted into constraints, transmissions, friction/retention and compound mechanisms.

## Evidence policy

Mechanics Next assigns semantics using this precedence:

1. **Tier A — official physical/mechanical evidence**
   - LEGO Education mechanism lessons and official LEGO building instructions.
   - Directly observed geometry of an official element.
2. **Tier B — authoritative digital connectivity evidence**
   - LDCad Shadow Library / LDCad SNAP metadata.
   - LDraw official primitives and connectivity conventions.
   - Useful for location/profile/compatibility. It is not automatically authoritative for friction, torque or dynamic behaviour.
3. **Tier C — repeated community engineering evidence**
   - Eurobricks Technic discussions, LDraw forums, BrickLink catalog nomenclature, repeated AFOL observations.
   - Used for friction, play, retention and intended use where official material is silent.
4. **Tier D — inference**
   - family templates, naming, primitive analysis and geometry inference.
   - Must carry confidence and may not activate destructive/physics behaviour when ambiguous.

A lower tier must never silently override contradictory higher-tier evidence.

## Fundamental rule: topology is not friction

A connection is not “fixed” merely because it is hard to rotate by hand.

- friction changes resistance / holding torque;
- retention changes force required to disengage;
- geometry determines degrees of freedom;
- several simultaneous contacts compose to remove degrees of freedom.

Therefore a single friction Technic pin is still a **revolute joint with resistance**, not a fixed joint. Two separated pin contacts between the same rigid bodies can compose into a fixed relation. The same principle applies to round stud contacts.

## Physical-body rule

- A normal LDraw **part** is one rigid physical body even if its geometry references many subparts/primitives.
- LDraw geometry subparts are not mechanical bodies.
- A **shortcut/assembly** can represent multiple physical bodies (wheel+tyre, turntable assembly, universal joint, articulated hinge, etc.) and must be expanded when its internal motion matters.
- Flexible/path/spring elements are not rigid bodies.
- “Monolithic” is a solved property: a set of bodies belongs to one rigid island only when the active constraints remove all relative DOF.

## Interface semantics

### Stud ↔ anti-stud / tube

A single round stud clutch is a retained round-axis connection.

Default active DOF:
- transverse translation: locked;
- axial translation after engagement: locked by clutch/caps;
- tilt: locked by cylindrical contact;
- rotation around stud axis: mechanically possible if surrounding geometry does not collide.

Therefore one stud contact is modeled as **revolute + clutch friction/retention**, not automatically fixed.
Multiple distinct stud contacts between the same bodies compose into a rigid bundle.

Hollow studs may expose a second compatible interface (e.g. bar) and must not be reduced to a single connector class.

### Technic pin ↔ Technic hole

A seated pin locates the bodies transversely and retains them axially.

- frictionless pin: revolute, low rotational resistance;
- friction pin: revolute, higher resistance / holding torque;
- friction does not topologically remove the rotational DOF;
- multiple separated pins can make an assembly rigid through constraint composition;
- pin sections/center stops/shoulders define interval occupancy and insertion limits.

Community experience consistently distinguishes smooth pins for freely moving pivots/wheels from friction pins for controlled/pose-holding pivots and structural retention.

### Axle ↔ axle hole

The keyed cross profile transmits torque.

Default:
- rotation around axle: locked;
- transverse translation/tilt: locked;
- axial translation: allowed until a stop, bush, shoulder, cap or another constraint removes it.

Thus the base relation is **prismatic keyed coupling**, not fixed.
If axial travel is blocked, it becomes fixed through composition.

### Axle/bar ↔ round hole

A round bore does not transmit keyed torque.

Default:
- rotation around axis: free;
- axial slide: free if uncapped/unretained;
- transverse translation and tilt: locked.

Thus the base relation is **cylindrical**. Stops/bushes may remove axial translation while preserving rotation.

A round-hole gear/pulley on an axle should free-spin independently from the axle; a cross-hole version rotates with it.

### Bush / half-bush / axle stop

A cross-hole bush is keyed to the axle, so it shares axle rotation.
Its main mechanical role is axial retention/spacing against adjacent geometry.

It must be modeled as:
- rotationally fixed to the axle;
- axially friction-retained on the axle;
- a possible hard stop when contacting a beam/hub/gear;
- not as a magical global axle lock.

### Bar ↔ clip / bar hole

LDCad models clips as female interfaces matched to cylindrical male bars and explicitly supports sliding.

Default:
- radial separation: retained;
- rotation about bar axis: allowed;
- axial slide: allowed when the metadata/profile says the bar is exposed and slide-compatible;
- geometry/caps/contact can limit rotation and slide.

C-clips and axial bar holes should remain distinguishable because insertion direction and collision limits differ.

### Hinge / finger joint

Interlocking fingers form a **revolute joint** about the hinge axis.

Click hinges are not fixed:
- same revolute topology;
- discrete preferred detent angles;
- resisting torque between/at detents;
- angle limits where geometry requires them.

### Ball ↔ socket

A ball joint is a **spherical joint**:
- translation locked while retained;
- three rotational DOF in principle;
- actual swing/twist ranges limited by socket/neighbor geometry;
- friction/holding torque is separate from topology.

LDCad explicitly uses free placement semantics for Technic ball/socket connectors.

### Turntable

A turntable is a retained **revolute** relation:
- translations locked;
- tilt locked except physical play;
- one rotation axis free;
- friction is part/variant dependent.

Community reports of loose low-friction turntables reinforce that a turntable must never be inferred as fixed merely because both halves are structurally attached to other bricks.

### Tyre ↔ rim

Intended relation is an interference/elastic fit with no normal assembly DOF.
Treat as fixed for kinematics, while simulation may later model tyre deformation separately.

## Transmission semantics

A transmission relation is not the same thing as a structural connection.

### Gear mesh

Official LEGO Education:
- teeth mesh to transfer force and motion;
- gear ratio is determined by tooth counts;
- equal external gears rotate in opposite directions;
- idlers alter direction but not final ratio;
- compound gears on the same axle share angular velocity;
- bevel gears can transfer rotation through 90 degrees.

Engine consequences:
- gear mesh creates an equation, not a rigid constraint;
- external mesh uses opposite sign;
- internal/ring mesh uses same sign;
- center distance, axis orientation, tooth family and engagement must be validated;
- gears with cross holes couple to their axle; round-hole gears may free-spin.

### Differential

Official LEGO Education states:
- input force is transferred to two outputs;
- if one output is stopped, the other doubles speed;
- if both outputs are stopped, input cannot turn.

For an equal open differential:
`2 * omega_carrier - omega_left - omega_right = 0`.

It is a three-port compound mechanism, not “carrier rotates children.”
Friction/load decides how an underdetermined differential distributes motion in simulation; kinematics must report underdetermined state when there is insufficient information.

### Worm gear

Official LEGO Education describes the worm as the drive element and says the worm gearing is not to be driven from the output side in the principle model.

Default Mechanics Next policy:
- directed/non-backdrivable transmission unless a specific family rule or measured evidence says otherwise;
- converts one worm revolution to one tooth advance on the mating gear;
- carries explicit efficiency/friction metadata later.

### Rack ↔ pinion

Rotation maps to linear travel:
`v_rack = pitch_radius * omega_pinion` with sign determined by orientation.

### Belt / pulley

Official LEGO Education:
- belt friction transmits motion;
- ordinary open belt makes pulleys rotate in the same direction;
- a twisted/crossed belt reverses direction;
- diameter ratio changes speed;
- a belt can slip.

Therefore belt transmission is friction-limited and may transition from coupled to slip.

### Cam ↔ follower

Official LEGO Education describes a cam profile controlling timing and follower displacement and notes friction/wear.

This is a contact mechanism:
- cam rotation imposes geometry-dependent follower displacement while contact exists;
- follower may separate if no preload/gravity/spring maintains contact;
- do not model it as a permanent rigid link.

### Ratchet / pawl

Official LEGO Education: motion is allowed in one direction and blocked in the other.

Model as a unilateral rotational/linear constraint with tooth events/detents.

### Wheel and axle

Official LEGO Education distinguishes fixed and split axles:
- wheel and its fixed axle rotate together;
- split axles let left/right wheels rotate at different speeds;
- this matters in steering/cornering.

Never infer “all wheels on the same geometric line share speed.” Follow actual keyed/free interfaces and differential topology.

### Universal joint

Official LEGO Education: transmits rotary motion through an angle with a 1:1 overall speed ratio in the principle model.

High-fidelity future model:
- two revolute joints with crossed axes;
- at nonzero articulation, a single Hooke joint has instantaneous speed variation;
- paired correctly phased joints can cancel that variation under equal angles.

### CV joint

Community/element-design discussion supports its role as angular power transmission; some Technic CV geometries also provide axial plunge/sliding.

Model:
- angular articulation + torque transmission;
- nominal constant angular velocity relation;
- family-specific angle limit;
- optional prismatic plunge for sliding female versions.

### Linear actuator / screw

Rotation of the screw produces constrained linear extension when the body is prevented from co-rotating.
Model as a screw coupling with stroke limits, not independent revolute + prismatic motion.

### Spring / shock

Model internal motion as limited prismatic DOF with spring/damping; endpoint attachment semantics are separate constraints.

## Context rules

1. **Do not decide rigidity from color or part category.**
2. **Do not decide rigidity from friction.**
3. **Do not merge bodies merely because they touch.**
4. **Do not infer transmission from proximity alone.** Gear teeth/profile/alignment must be compatible.
5. **Do compose multiple contacts.** Two individually movable contacts may jointly produce a rigid assembly.
6. **Do keep occupancy intervals.** Long axle/pin/bar can pass through several elements at once.
7. **Do preserve axial stops/caps/shoulders.**
8. **Do preserve symmetry.** Round interfaces permit twist; keyed axle profiles do not.
9. **Do keep friction/load out of pure kinematic topology, but use them to resolve simulation states.**
10. **Do report underdetermined mechanisms instead of inventing motion.**

## Sources reviewed

### Tier A / official
- LEGO Education — Gear: https://education.lego.com/en-us/lessons/spm/gear/
- LEGO Education — Wheel and Axle: https://education.lego.com/en-us/lessons/spm/wheel-and-axle/
- LEGO Education — Pulley: https://education.lego.com/en-us/lessons/spm/pulley/
- LEGO Education — Cam: https://education.lego.com/en-us/lessons/spm/cam/
- LEGO Education — Pawl and Ratchet: https://education.lego.com/en-us/lessons/spm/pawl-and-ratchet/

### Tier B / connectivity standards and tooling
- LDCad snap meta specification: https://www.melkert.net/LDCad/tech/meta
- LDCad Shadow Library: https://github.com/RolandMelkert/LDCadShadowLibrary
- LDraw primitives reference: https://wiki.ldraw.org/wiki/Primitives_Reference
- LDraw connectivity discussion: https://forums.ldraw.org/showthread.php?tid=29037
- Studio connectivity reverse-engineering discussion: https://forums.ldraw.org/showthread.php?tid=28521

### Tier C / engineering experience
- Eurobricks — Why friction ridges?: https://www.eurobricks.com/forum/forums/topic/35709-why-friction-ridges/
- Eurobricks — Technic Pins: To friction or not to friction: https://www.eurobricks.com/forum/forums/topic/109407-technic-pins-to-friction-or-not-to-friction/
- Eurobricks — CV/universal joints: https://www.eurobricks.com/forum/forums/topic/102914-cvuniversal-joints-is-there-a-rule-of-thumb/
- Eurobricks — Element designer AMA: https://www.eurobricks.com/forum/forums/topic/182871-ama-with-element-designers-ask-me-anything/
- BrickLink Technic pin catalog: https://www.bricklink.com/catalogList.asp?catID=139
- Reddit r/legotechnic discussions were used only as corroborating empirical evidence for differential friction, bushing retention and free-spinning round bores.

## Implementation consequences for M1+

The next engine layers must provide:
- interface topology separate from friction/retention;
- multi-contact constraint composition;
- compound-part expansion;
- transmission equations separate from assembly graph edges;
- part-family friction/retention metadata;
- unilateral constraints (ratchet, clutch, contact);
- shape/contact driven mechanisms (cam);
- evidence/confidence attached to every inferred semantic rule.
