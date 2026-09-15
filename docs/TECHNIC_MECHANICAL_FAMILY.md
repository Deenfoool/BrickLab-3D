# Technic Mechanical Family V1

BrickLab treats **Technic** as a mechanical family layered on top of the existing LDraw and Connector V4 authorities. This layer adds semantics and analysis; it does not replace geometry, snapping, persistence, or Rapier ownership.

## Ownership boundaries

- **LDraw runtime** remains the visual/model source.
- **Connector V4** remains authoritative for connection endpoints, placement, occupancy, persisted connection records, and SIMULATE preflight.
- **Technic V1** classifies parts/endpoints/connections, provides transmission math, builds assembly diagnostics, and extends drivetrain analysis to certified V4 axle/gear endpoints.
- **Kinematics** remains temporary/non-persistent. Technic rotary profiles only expose the historical selection hint so LDraw gears/axles/rims can be picked directly; they do not create new constraints.
- Unsupported special mechanisms remain classified but fail closed. The Technic layer must not invent dimensions, tooth counts, limits, torque, spring rates, or connector geometry.

## Implemented mechanical semantics

The current layer recognizes keyed axle couplings, round bearing supports, Technic pin joints, ball joints, hinge fingers, turntables, linear guides, driving-ring groups, differential groups, universal-joint groups, steering hubs, pneumatic/linear-actuator groups, wheel interfaces, and other verified LDCad special groups.

Verified/classified part profiles include common classic axles, bushes, 8T/16T/24T/40T spur gears, 12T/20T bevel gears, plus metadata-backed beams, frames, connectors, racks, worms, sprockets, pulleys, rims, suspension/steering parts and special transmission families.

## Drivetrain integration

`technic/drivetrain-v1.js` activates only when a scene contains a rotary Technic part with a ready V4 keyed endpoint. Otherwise it returns the legacy drivetrain result unchanged.

When active it:

1. builds one shaft graph from legacy axle links plus V4 semantic axle links;
2. derives shaft axes from either legacy connectors or V4 world frames;
3. recognizes trusted LDraw spur/bevel gear profiles without mutating Connector V4 data;
4. detects physical gear meshes using the existing Parts-5 gear geometry math;
5. remaps existing semantic gearbox/differential couplers onto the unified shaft graph;
6. propagates RPM, torque capacity, efficiency and loop conflicts through the unified graph.

The same analyzer is used by Architecture/Kinematics and by the Connector V4 physics guard when it rebuilds drivetrain semantics for SIMULATE.

## Assembly analysis API

`globalThis.BrickLabTechnic` exposes:

- `profile(part)` — trusted/measured part role;
- `endpoint(partId, endpointId)` — endpoint mechanical semantics;
- `connection(record)` — connection mechanical semantics;
- `analyze()` — current V4 Technic assembly report;
- `coverage()` — recognized role coverage;
- `math` — deterministic transmission equations;
- `grammar` — stable Technic mechanical grammar.

Assembly diagnostics are advisory. They can report missing verified gear tooth counts, absent/single bearing support, unverified axial retention, and unknown mechanical roles, but they do not silently block BUILD or fabricate physics.

## Offline family audit

For a full local LDraw + shadow checkout:

```bash
npm run audit:technic -- <ldraw-root> <shadow-root> <report.json>
```

The report enumerates the entire library-classified Technic family, resolved connector roles, LDCad groups, mechanical classes and warnings. This is the preferred way to expand verified coverage without guessing from meshes.

## Regression tests

```bash
node --test tests/technic-*.test.mjs
```
