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

## Hero mechanical fidelity

`hero-mechanical-fidelity-v2.js` is the high-visibility pass for the models that dominate screenshots and actual builds: wheels, bevel gears, articulated driveline and major housings.

### Wheels

All wheel families keep their authoritative `mechanics.wheel.radius` and `mechanics.wheel.width`. The hero factory rebuilds only the rendering assembly:

- smoother lathed tyre carcass with bead-to-shoulder curvature instead of a thick torus;
- bead-seat shadows and shallow sidewall mold rings;
- separate rim barrel, bead lips and recessed face dishes;
- tapered radial spokes and a keyed central hub;
- Road: three-row fine tread;
- Narrow: single narrow alternating tread row;
- Off-road: staggered centre + shoulder block rows;
- Tractor: two large opposing diagonal lug rows.

Tread and sidewall finish meshes remain `physicsIgnore`. Wheel collision continues to use radius/width metadata, not render bounds.

### Bevel gears

12T and 20T keep their canonical pitch radii and 90° mesh semantics. The new rendering uses:

- a true conical annular rim;
- multi-slice tapered tooth bodies derived from the same module/pressure-angle family;
- separate keyed hub;
- 4-web 12T and 6-web 20T molded centres;
- shallow face relief rather than a solid conical puck.

Gear collision/mesh detection remains pitch-metadata driven.

### Cardan / CV

The existing articulated factories remain the bounds owners. PARTS-6 only adds collider-independent detail:

- Universal Joint: four bearing caps, seal rings and connector-aligned yoke collars;
- CV Joint: ribbed bell collars and an additional cage retainer around the existing six-ball Rzeppa-style centre.

No articulated mechanics, angular limits or transmission ratios are replaced.

### Gearbox / Open Differential

Both parts already had explicit collider profiles from PARTS-5, so their visual shells can be improved without changing simulation geometry.

- F/N/R Gearbox: split case halves, visible case seam, bearing bosses/retainers, casting ribs, case bolts and three selector detents;
- Open Differential: open carrier ring, external carrier teeth, side hubs/bearing retainers, four cage ribs, spider cross/gears and input bearing boss.

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

`rack-gear-fidelity-v1.js` is the final visual owner for both `steering-rack-7` and `steering-rack-guide`.

- rack circular pitch is `π × GEAR_MODULE_STUD`;
- pressure angle is shared with the spur family;
- addendum and dedendum come from the same canonical `gearMetrics()` source;
- the rack keeps full tooth depth and the guide is shaped around the resulting real tooth envelope;
- the guide remains an open molded channel with POM-like wear strips, stiffening ribs and eight mounting tubes generated from the actual tube connector positions;
- tie-pin meshes are centred on the actual `tie-left` / `tie-right` connector coordinates;
- rack teeth, tie-pin finishing, wear strips, mounting-tube finish and guide ribs remain `physicsIgnore`;
- rack slider/tie connectors, guide rail/mount connectors, steering travel and PARTS-4 rack mechanics are unchanged.

The visible rack and guide no longer determine their colliders through visual bounds. Explicit proxy profiles reproduce the pre-realism rack and guide bounds envelopes, so improving tooth depth, guide clearance or molded details does not silently change simulation geometry.

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

1. all wheel families: sidewall silhouette, bead lip, rim depth, spoke taper and tread family distinction;
2. 8T–40T spur family consistency, measured tooth-tip silhouette and preserved pitch mesh;
3. 12T/20T bevel pair: conical taper, web openings and keyed sockets;
4. Universal Joint bearing caps/seals and CV bell/cage detail;
5. split-shell gearbox bearing bosses/ribs/bolts;
6. Open Differential ring carrier, spider centre and three axle ports;
7. steering rack ↔ 12T pinion pitch-line contact, tooth depth and rebuilt guide clearance;
8. rack-guide wear strips, ribs and eight mounting tubes;
9. straight/thin/bent liftarms and 5×7 frame hole proportions;
10. Technic brick side bores and underside;
11. axles, pins, bushes and axle coupler mating proportions;
12. steering base, knuckle, wheel hub and tie-rod port semantics;
13. shock body/rod and metal coil spring;
14. RPM/Torque sensor through-holes;
15. absence of floating detail, z-fighting and accidental collider growth.
