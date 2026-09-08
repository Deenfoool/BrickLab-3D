# BrickLab visual quality

BrickLab keeps visual meshes separate from connector semantics and physics behavior. Visual upgrades therefore do not change part IDs, connector IDs, stud pitch, shaft grouping, gear pitch, saved projects, or Rapier collider geometry.

## Realistic molded-part pass

The current renderer uses a brand-neutral construction-brick look inspired by real injection-molded ABS parts without copying molded logos or trademarks.

The catalog-wide visual wrapper now adds:

- polished molded-plastic response with physically based clearcoat/specular tuning;
- subtle top mold lines around bricks and plates;
- refined stud edge rims;
- dark underside socket depth and shallow reinforcement ribs;
- actual dark inner bore surfaces for Technic pin holes instead of flat painted circles;
- finer axle bands and end detailing;
- layered gear face/hub rings;
- dense instanced off-road tyre tread, sidewall rings and bead detail;
- molded housing panels, vents and fasteners on Motor/Gearbox/Differential parts;
- sensor face-ring detail;
- differentiated ABS, rubber and metal reflection response.

Repeated details use `THREE.InstancedMesh` where practical, so visual quality can increase without turning each stud or tread block into a separate draw-call-heavy object tree.

Every detail added by the realism layer carries `userData.physicsIgnore = true`. `colliders-v2.js` ignores those meshes when computing bounds, so visual detailing cannot enlarge or otherwise change physical collision shapes.

## Procedural base geometry

Standard parts remain browser-native procedural geometry:

- rounded plastic bodies via Three.js `RoundedBoxGeometry`;
- `MeshPhysicalMaterial` for molded plastic;
- differentiated rubber, dark insert, and metal materials;
- studs and underside tube details;
- open Technic beam/brick hole geometry;
- extruded cross-profile axles;
- cross-shaped axle-hole faces;
- multi-point spur-gear tooth profiles;
- off-road wheel, rim and hub geometry;
- detailed Lab Motor, gearbox and differential housings;
- Bearing Block, Suspension Arm and RPM/Torque sensor geometry.

This keeps the project lightweight and lets colors/connectors remain fully procedural instead of requiring one heavy GLB asset per part.

## Studio rendering

`render-quality.js` configures the editor renderer with:

- ACES filmic tone mapping;
- sRGB output;
- physically based lighting;
- a PMREM-filtered `RoomEnvironment` studio reflection source;
- 2048px soft directional shadows;
- tuned key, hemisphere, fill and rim lighting;
- improved shadow bias/normal bias;
- dark neutral workspace and softened grid presentation.

The environment is generated locally by Three.js; no remote HDR texture is required.

## Catalog previews

`catalog-previews.js` renders the actual procedural parts with a dedicated off-screen WebGL renderer.

The preview pipeline now uses the same studio-style `RoomEnvironment`, higher 240×158 source frames, ACES tone mapping and balanced key/fill/rim lights. Preview generation is still idle-scheduled and cached as data URLs for the current page session.

Shared realism geometries/materials are marked with `bricklabSharedVisual`, preventing preview cleanup from disposing resources that are reused by scene parts.

## Physics remains independent

The visual system does not redefine mechanical semantics. Gear interaction uses semantic pitch data, wheels use dedicated physical colliders, connector snapping uses explicit connector metadata, and visual-only meshes never participate in Physics v2 bounds.

If a future imported asset pipeline (for example LDraw-compatible geometry) is added, it can replace only the render layer while retaining the same connector and physics definitions.
