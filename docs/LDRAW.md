# LDraw integration

BrickLab 3D uses the LDraw Parts Library as an on-demand source of part geometry. The full LDraw library is **not vendored into this repository**; the browser loads only the index and files required by parts the user actually selects.

For connectivity, production LDraw parts use Connector System V4 with a pinned LDCad Shadow Library snapshot when certified metadata exists. The older LDraw primitive analyser remains useful as a conservative geometry/connectivity source and fallback, but it is no longer the whole connection architecture.

## Runtime architecture

```text
LDraw remote library
    │
    ├─ Git tree → Design ID index
    ├─ parts/<id>.dat → geometry/header data
    ├─ parts/s/* → recursive subparts
    ├─ p/* → primitives resolved by LDrawLoader
    └─ LDConfig.ldr → colour definitions
             │
             ▼
ldraw/runtime-v3.js
    ├─ 20 LDU = 1 BrickLab stud
    ├─ coordinate conversion / centering
    ├─ DAT/model caches
    ├─ conservative primitive connector analysis
    ├─ basic safe mechanical inference
    └─ dynamic PARTS registration
             │
             ▼
LDraw-backed BrickLab part
             │
             ├──────────── visual / catalog / project persistence
             │
             ▼
Connector System V4
    ├─ pinned LDCad Shadow metadata
    ├─ profile/frame resolver
    ├─ shape-aware matching + placement
    ├─ interval occupancy + V4 graph
    ├─ BUILD snap ownership
    └─ SIMULATE live recertification + Rapier adapter
```

`ldraw/runtime-v1.js` and `runtime-v2.js` remain compatibility entry points and re-export the current LDraw runtime.

## Geometry source

The production LDraw runtime currently uses the version-controlled `pybricks/ldraw` mirror. Geometry is requested from `raw.githubusercontent.com`; the top-level `parts/` filename index is obtained lazily from GitHub's Trees API.

This keeps BrickLab small and avoids downloading the complete parts library on startup.

## Catalog

The Parts panel contains the LDraw browser. It supports Design ID lookup, starter parts and metadata/name discovery where the remote source permits it.

Selecting a result dynamically registers a `ldraw-<design-id>` definition and uses the normal BrickLab placement path. The complete remote index is not appended to the normal `PARTS` array as thousands of eager objects.

Only top-level part `.dat` files are exposed as catalog parts; subparts and primitives stay implementation details.

## Geometry loading

A selected LDraw part initially has a lightweight synchronous placeholder because the editor's normal `create()` path is synchronous. Real LDraw geometry then loads and replaces it.

Loaded geometry is:

1. rotated to BrickLab/Three.js orientation;
2. scaled at `1 / 20` because 20 LDU equal one horizontal stud pitch;
3. centered in X/Z and grounded at BrickLab Y=0;
4. recoloured through LDraw `Main_Colour` where applicable;
5. marked with the BrickLab instance root for picking and project behavior.

The exact centering/grounding offset is reused by Connector V4 so endpoint positions stay aligned with the visible model.

## Connectivity sources

BrickLab has two complementary LDraw connectivity sources.

### LDCad Shadow metadata — production V4 source

Connector System V4 uses the pinned `RolandMelkert/LDCadShadowLibrary` snapshot documented in [`CONNECTOR_SYSTEM_V4.md`](CONNECTOR_SYSTEM_V4.md) and `NOTICE_CONNECTORS.md`.

Shadow metadata provides richer connection profiles than base LDraw geometry alone: cylinders/axles/holes, clips, finger hinges, generic grouped connectors, spheres, includes and clears. V4 resolves these into complete local frames and physical profiles.

For V4-owned LDraw structural pairs, an uncertified/missing V4 candidate fails closed instead of silently creating a coarse V3 connection.

### Primitive analyser — conservative source/fallback

`ldraw/runtime-v3.js` also reads type-1 LDraw references and recursively follows guarded `parts/s/*` subparts. It can recognise common primitive families such as:

- studs;
- underside tubes;
- Technic pin holes;
- Technic axle holes.

For example, `3001.dat` delegates much geometry to a subpart, so the recursive analyser can still reach stud/tube primitives rather than leaving the part visual-only.

Opposite pin/axle-hole openings can be paired into a through-connector. The analyser remains deliberately conservative: false connectivity is considered worse than missing connectivity.

## Connector V4 behavior

V4 connectivity is geometry-aware and uses full profiles rather than only labels. Current production concepts include:

- shape compatibility (`R`, `A`, `S`, elastic profile sections);
- male/female and semantic group gates;
- exact connector coordinate frames;
- axial insertion windows;
- interval occupancy for long axles/bars/pins;
- stable endpoint identity and project graph persistence;
- shape-based round interfaces where the profile itself supplies enough evidence;
- explicit fail-closed handling for ambiguous families.

On SIMULATE, BrickLab does not trust connection flags saved in a project. The current endpoints and transforms are revalidated and a fresh runtime physics plan is created.

Certified rules map to Rapier fixed, revolute, prismatic, cylindrical or spherical constraints. Open axial profiles can disengage dynamically after leaving their valid engagement window.

See [`CONNECTOR_SYSTEM_V4.md`](CONNECTOR_SYSTEM_V4.md) for the complete model and physics policy.

## Basic mechanical inference

LDraw geometry/connectivity is separate from drivetrain mechanics. A small safe subset can receive mechanical metadata automatically:

- ordinary `Technic Gear <N> Tooth` spur gears with a recognised axle hole can receive teeth/pitch metadata;
- ordinary Technic axle descriptions can receive shaft metadata.

Special gears, wheel behavior, steering, suspension, motors and unusual couplings are not guessed from visual geometry alone.

## Capability levels

LDraw-backed parts progress through capabilities:

```text
visual
  └─ geometry / colour / transform / save / import / export

snap
  └─ visual + certified connection metadata

mechanical
  └─ snap + safe inferred or explicit BrickLab drivetrain semantics
```

Connector V4 physics certification is evaluated at simulation time and is intentionally stricter than simply having a `snap` capability.

## Persistence

LDraw part IDs are stored normally, for example:

```text
ldraw-3001
ldraw-3894
ldraw-3647
```

`ldraw/bootstrap-v1.js` recreates required dynamic definitions before `app.js` restores a saved project. Imported `.bricklab` files are prepared through the same mechanism.

Connector V4 keeps its richer connection graph/endpoint identity alongside the project lifecycle and reconciles restored records against current geometry.

## Caching and network behavior

LDraw geometry, DAT metadata, subparts and finished model prototypes are cached during the page session. Shadow connectivity uses a pinned upstream snapshot and guarded resolver caches.

Production JavaScript modules, including every `connectors-v4/*.js`, are mapped through one canonical cache generation in `index.html`. Historical V4 query URLs still present in early source imports are redirected to the same current module URL so multiple V4 schema generations cannot coexist in one page.

If remote LDraw geometry cannot be reached, a placed part keeps its placeholder instead of crashing the editor. Existing native BrickLab systems remain available. Shadow network failures are distinguished from a genuine metadata 404; transient failures are not interpreted as proof that a connector does not exist.

## Attribution

Parts geometry provided by the LDraw Parts Library.
LDraw is an independent community project and is not affiliated with the LEGO Group.
