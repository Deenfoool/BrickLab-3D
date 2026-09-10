# LDraw integration

BrickLab 3D uses the LDraw Parts Library as an on-demand source of part geometry. The LDraw library is **not vendored into this repository**; the browser loads only the index and files required by parts the user actually selects.

## Runtime architecture

```text
LDraw remote library
    │
    ├─ Git tree → lightweight Design ID index
    ├─ parts/<id>.dat → header + connector analysis
    ├─ parts/s/* → recursive connector analysis
    ├─ p/* → geometry primitives resolved by LDrawLoader
    └─ LDConfig.ldr → official colour definitions
             │
             ▼
ldraw/runtime-v3.js
    │
    ├─ 20 LDU = 1 BrickLab stud
    ├─ LDraw Y-down → Three.js Y-up
    ├─ geometry/model cache
    ├─ DAT/subpart cache
    ├─ primitive-based connector inference
    ├─ basic mechanical metadata inference
    └─ dynamic PARTS registration
             │
             ▼
BrickLab PARTS
    │
    ├─ normal selection / transform
    ├─ undo / redo
    ├─ autosave
    ├─ .bricklab import / export
    ├─ catalog Favorites / Recent
    └─ Connector / Physics systems
```

`runtime-v1.js` and `runtime-v2.js` remain compatibility entry points and re-export the current runtime.

## Source

The production runtime currently points to the version-controlled `pybricks/ldraw` mirror of the official LDraw library. Geometry is requested from `raw.githubusercontent.com` and the complete top-level `parts/` filename index is obtained lazily from the GitHub Trees API.

This keeps the BrickLab repository small and avoids downloading tens of thousands of part files on startup.

## Catalog

The Parts panel contains an **LDraw** button. Opening it loads the remote part index only when needed.

Supported discovery paths:

- exact or partial LDraw / LEGO Design ID, e.g. `3001`, `3894`, `3647`;
- popular starter parts shown without entering a query;
- name search through the public LDraw Library search endpoint when cross-origin access is available;
- already fetched DAT metadata is cached for the rest of the session.

Selecting a result dynamically registers a `ldraw-<design-id>` BrickLab part and places it through BrickLab's existing part-placement path. The full remote index is never appended to `PARTS`, so the normal catalog remains fast.

The index intentionally exposes top-level `.dat` files, not `parts/s/` subparts or `p/` primitives as standalone catalog pieces.

## Geometry loading

A selected part is created synchronously with a temporary lightweight placeholder so the existing BrickLab editor does not need an asynchronous `create()` API. The actual LDraw geometry then loads in the background and replaces the placeholder.

Loaded geometry is:

1. rotated 180° around X to convert LDraw coordinates to the Three.js / BrickLab orientation;
2. scaled by `1 / 20`, because 20 LDraw units equal one horizontal stud pitch and 24 LDU become BrickLab's 1.2-stud brick height;
3. centered in X/Z and moved so its visual lower bound sits on BrickLab Y=0;
4. recoloured through LDraw `Main_Colour` where applicable;
5. marked with the BrickLab instance root so ray picking continues to work.

## Automatic connectors

`runtime-v3.js` reads type-1 LDraw references and recursively follows `parts/s/*` subparts up to a guarded depth. Every child reference matrix is composed with its parent matrix before the connector is converted into BrickLab coordinates.

Current automatic connector classes:

- outward studs from standard `stud*.dat` primitive families;
- underside tubes from the LDraw stud-tube primitive families;
- Technic pin holes from `peghole.dat` / pin-hole primitive families;
- Technic axle holes from `axlehole.dat` / `axlehol*.dat` primitive families.

For example, a classic brick such as `3001.dat` delegates most of its geometry to `s/3001s01.dat`; the recursive pass therefore still reaches the actual stud/tube primitives instead of leaving the brick visual-only.

Opposite pin/axle-hole openings are paired into one through-connector. Their LDraw transform matrices determine position and axis, and the same grounding/centering offset used by the rendered model is applied to connector positions.

The analyser is intentionally conservative: a false connector is worse than a missing one. It currently follows official `parts/s/` subparts rather than recursively treating every referenced part as a connection source. The primitive registry is designed to grow with bars, clips, hinges, ball joints, tyre/rim seats and other connection standards.

## Basic mechanical inference

A small safe subset can move directly beyond `snap`:

- ordinary `Technic Gear <N> Tooth` spur gears with a recognised axle hole receive BrickLab gear metadata (`teeth`, `pitchRadius = teeth / 16`, prototype efficiency);
- ordinary Technic axle part descriptions receive shaft metadata.

Special gears (bevel, worm, rack, crown, clutch, differential, knob/turntable families), wheels, steering, suspension and motors are **not guessed**. They stay visual/snap until BrickLab has an explicit mechanical profile for the part.

## BrickLab capability levels

LDraw-backed parts use progressive capability levels:

```text
visual
  └─ geometry / colour / transform / save / import / export

snap
  └─ visual + automatically recognised BrickLab connectors

mechanical
  └─ snap + safe inferred or explicit BrickLab mechanics metadata
```

LDraw provides geometry, but it does not replace BrickLab's mechanical model. Advanced drivetrain behaviour remains BrickLab metadata.

## Persistence

`.bricklab` projects continue to store the normal `partId`. LDraw parts use IDs such as:

```text
ldraw-3001
ldraw-3894
ldraw-3647
```

`ldraw/bootstrap-v1.js` scans local saves before `app.js` boots and recreates any required dynamic definitions. The same module prepares imported `.bricklab` files before the normal importer runs, so LDraw-backed parts survive reloads and file transfer.

## Caching and network behaviour

The complete filename index is loaded only when the LDraw browser opens. DAT files, subparts, parsed metadata, connector analysis and finished geometry prototypes are cached for the page session. Independent subparts are analysed concurrently; the connector analyser does not probe unrelated LDraw primitives with additional requests.

LDraw geometry is remote by design. If the remote library cannot be reached, the placed part keeps its placeholder rather than crashing the editor. Existing native BrickLab parts and the rest of the project continue to work.

A future offline-cache layer can store fetched DAT files and dependencies in IndexedDB without changing project format.

## Attribution

Parts geometry provided by the LDraw Parts Library.
LDraw is an independent community project and is not affiliated with the LEGO Group.
