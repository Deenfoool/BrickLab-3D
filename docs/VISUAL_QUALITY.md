# BrickLab visual quality

BrickLab keeps visual meshes separate from connector semantics and physics behavior. The visual overhaul therefore changes how parts look without changing part IDs, connector IDs, grid spacing, shaft grouping, gear pitch, or saved-project compatibility.

## Procedural visual system

Standard prototype parts now use higher-quality browser-native geometry:

- rounded plastic bodies via Three.js `RoundedBoxGeometry`;
- `MeshPhysicalMaterial` for slightly polished molded plastic;
- differentiated rubber, dark insert, and metal materials;
- refined studs and underside tube details;
- open Technic beam/brick hole geometry instead of dark rings painted onto solid boxes;
- extruded cross-profile axles;
- cross-shaped axle-hole faces;
- multi-point spur-gear tooth profiles and beveled gear edges;
- 24T gear lightening holes;
- off-road tyre tread blocks, spokes, rim barrel, and hub detailing;
- detailed Lab Motor housing, bearing, vents, feet, top panel, and cross output shaft;
- refined gearbox and differential housings.

BrickLab-specific prototype parts were upgraded to the same visual language:

- Bearing Block with an open bearing ring and mounting feet;
- Suspension Arm with open holes and a separate metal pivot;
- RPM/Torque sensors with end caps, cross-hole faces, accent rings, and status indicators.

## Rendering quality

`render-quality.js` configures the editor renderer before normal scene rendering:

- ACES filmic tone mapping;
- soft PCF shadows;
- tuned key light and hemisphere intensity;
- extra fill and rim lights;
- improved shadow bias/normal bias;
- darker neutral workspace background;
- softened grid presentation.

The rendering extension is isolated from the main editor module and skips dedicated catalog-preview scenes.

## Catalog previews

`catalog-previews.js` generates real model previews for Parts cards.

A single off-screen WebGL renderer is reused for every preview. Preview generation is scheduled through `requestIdleCallback` where available, cached as data URLs for the current page session, and falls back to the original text/icon representation if WebGL preview rendering fails.

The Parts Grid view therefore behaves more like an asset browser: cards show the actual procedural mesh rather than only symbols such as `⚙`, `▦`, or `M`.

## Physics remains independent

The visual overhaul intentionally does not redefine mechanical semantics. Gear interaction still uses semantic pitch data, wheels still use dedicated cylindrical colliders, and connector snapping still uses explicit connector metadata rather than rendered mesh surfaces.

Future LDraw integration can replace standard-part visual meshes while keeping the same connector/physics layers.
