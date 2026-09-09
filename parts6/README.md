# PARTS-6 — Realism pass

PARTS-6 is a visual fidelity layer on top of PARTS-5. It deliberately keeps existing connector positions, drivetrain semantics, gear pitch radii and authoritative physics ownership intact.

## Goals

- molded Technic-like silhouettes instead of generic primitive geometry;
- waisted liftarms with true bores and subtle molded edge treatment;
- hollow Technic bricks with reinforced side-hole bosses and believable underside structure;
- rounded cross axles, molded pins, bushes and couplers;
- involute-like spur tooth rings with separate hubs and molded radial webs;
- conical bevel gears with tapered teeth;
- family-specific tyre carcasses, tread and recessed rims;
- ABS / POM / rubber / metal material separation without excessive gloss;
- one nominal sizing source for visible pin, pin-hole, axle and axle-hole interfaces;
- visible mating-port orientation derived from connector metadata rather than hand-painted symbols;
- a wheel, gear or housing axle-hole should visibly accept the same cross-axle family;
- steering/suspension parts should visibly distinguish a solid pin/axle from an empty pin-hole/axle-hole;
- steering-rack teeth should belong to the same module and 20° pressure-angle family as the spur gears.

## Interface fidelity

The nominal dimension layer owns the final core geometry for straight/thin/bent liftarms, Technic bricks, 5×7 frame, free axles, pins, bushes, axle coupler and spur gears.

The interface-fit layers then decorate final factories from connector metadata:

- wheels and bevel gears receive keyed axle-hole faces;
- gearbox, differential, Cardan/CV and worm-drive ports follow their axle-hole connector axes;
- RPM/Torque sensors expose the same through axle-hole family;
- bearing, steering, shock and connector pin holes share one counterbore family;
- motor, wheel hub, steering knuckle and axle-pin visibly expose their solid axle/pin semantics.

These interface finishes are visual only. Their meshes are marked `physicsIgnore`, and the safety wrapper recursively protects child meshes so additional detail cannot enlarge a bounds-derived collider.

## Rack / pinion fidelity

`rack-gear-fidelity-v1.js` is the final visual owner for `steering-rack-7`.

- rack circular pitch is `π × GEAR_MODULE_STUD`;
- pressure angle is shared with the spur family;
- addendum and dedendum come from the same canonical `gearMetrics()` source;
- the tooth profile keeps its full standard depth while fitting the existing rack-guide opening;
- tie-pin meshes are centred on the actual `tie-left` / `tie-right` connector coordinates;
- teeth and tie-pin finishing remain `physicsIgnore`;
- rack slider/tie connector positions, steering travel and PARTS-4 rack physics are unchanged.

The QA gallery includes a 12T pinion whose pitch circle is tangent to the rack pitch line. This is a visual reference only and does not create a fake connector or drivetrain joint.

## Non-goals

- no connector migrations;
- no physics hacks or force/velocity clamps;
- no decorative meshes controlling collider dimensions;
- no fake gear joints;
- no drivetrain pitch-radius changes just to make teeth appear to mesh;
- no new catalog flood before existing parts reach the desired quality.

## Visual review

Open `tests/parts5-visual-qa.html` in a WebGL-capable browser. The page is titled **PARTS-6 REALISM QA** and loads every PARTS-6 visual owner before creating the gallery objects.

Review especially:

1. wheel sidewall, rim depth, tread and keyed axle openings on both faces;
2. 8T–40T spur family consistency, measured tooth-tip silhouette and preserved pitch mesh;
3. steering rack ↔ 12T pinion pitch-line contact, tooth depth and guide clearance;
4. 12T/20T bevel pair and keyed centre sockets;
5. straight/thin/bent liftarms and 5×7 frame hole proportions;
6. Technic brick side bores and underside;
7. axles, pins, bushes and axle coupler mating proportions;
8. steering base, knuckle, wheel hub and tie-rod port semantics;
9. shock body/rod and metal coil spring;
10. universal/CV/worm/gearbox/differential ports;
11. RPM/Torque sensor through-holes;
12. absence of floating detail, z-fighting and accidental collider growth.
