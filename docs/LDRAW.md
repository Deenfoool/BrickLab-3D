# LDraw integration

BrickLab 3D uses the LDraw Parts Library as an on-demand source of visual part geometry. The LDraw library is **not vendored into this repository**; the browser loads only the parts that the user actually selects.

## Runtime architecture

```text
LDraw remote library
    │
    ├─ Git tree → lightweight Design ID index
    ├─ parts/<id>.dat → header + connector analysis
    ├─ p/* / parts/s/* → dependencies resolved by LDrawLoader
    └─ LDConfig.ldr → official colour definitions
             │
             ▼
ldraw/runtime-v1.js
    │
    ├─ 20 LDU = 1 BrickLab stud
    ├─ LDraw Y-down → Three.js Y-up
    ├─ geometry/model cache
    ├─ DAT metadata cache
    ├─ primitive-based connector inference
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

## Source

The production runtime currently points to the version-controlled `pybricks/ldraw` mirror of the LDraw library. Geometry is requested from `raw.githubusercontent.com` and the complete top-level `parts/` filename index is obtained lazily from the GitHub Trees API.

This keeps the BrickLab repository small and avoids downloading tens of thousands of part files on startup.

## Catalog

The Parts panel contains an **LDraw** button. Opening it loads the remote part index only when needed.

Supported discovery paths:

- exact or partial LDraw / LEGO Design ID, e.g. `3001`, `3894`, `3647`;
- popular starter parts shown without entering a query;
- name search through the public LDraw Library search endpoint when cross-origin access is available;
- already fetched DAT metadata is cached for the rest of the session.

Selecting a result dynamically registers a `ldraw-<design-id>` BrickLab part and places it through BrickLab's existing part-placement path. The full remote index is never appended to `PARTS`, so the normal catalog remains fast.

## Geometry loading

A selected part is created synchronously with a temporary lightweight placeholder so the existing BrickLab editor does not need an asynchronous `create()` API. The actual LDraw geometry then loads in the background and replaces the placeholder.

Loaded geometry is:

1. rotated 180° around X to convert LDraw coordinates to the Three.js / BrickLab orientation;
2. scaled by `1 / 20`, because 20 LDraw units equal one horizontal stud pitch;
3. centered in X/Z and moved so its visual lower bound sits on BrickLab Y=0;
4. recoloured through LDraw `Main_Colour` where applicable;
5. marked with the BrickLab instance root so ray picking continues to work.

## Automatic connectors

`runtime-v1.js` reads type-1 LDraw references in the source DAT and recognises common standard primitives.

Current automatic connector classes:

- stud / underside tube candidates from `stud*.dat` primitives;
- Technic pin holes from `peghole.dat` / pin-hole primitive families;
- Technic axle holes from `axlehole.dat` / `axlehol*.dat` primitive families.

Opening pairs are merged into one connector and their LDraw transform matrix is used to derive the connector axis. Connector positions use the same coordinate conversion and visual offset as the rendered part.

This is intentionally conservative: a false connector is worse than a missing one. Parts whose connection features are hidden entirely inside nested subparts may initially load as **visual-only** until the recursive primitive analyser recognises them. The primitive registry is designed to be extended with bars, clips, hinges, tyre/rim seats and other connection standards.

## BrickLab capability levels

LDraw-backed parts use progressive capability levels:

```text
visual
  └─ geometry / colour / transform / save / import / export

snap
  └─ visual + automatically recognised BrickLab connectors

mechanical
  └─ snap + explicit BrickLab mechanics metadata
     (gear teeth, shaft behaviour, wheel radius, steering, motor, etc.)
```

LDraw provides geometry, but it does not replace BrickLab's mechanical model. Advanced drivetrain behaviour remains explicit BrickLab metadata.

## Persistence

`.bricklab` projects continue to store the normal `partId`. LDraw parts use IDs such as:

```text
ldraw-3001
ldraw-3894
ldraw-3647
```

`ldraw/bootstrap-v1.js` scans local saves before `app.js` boots and recreates any required dynamic definitions. The same module prepares imported `.bricklab` files before the normal importer runs, so LDraw-backed parts survive reloads and file transfer.

## Offline / failure behaviour

LDraw geometry is remote by design. If the remote library cannot be reached, the placed part keeps its placeholder rather than crashing the editor. Existing native BrickLab parts and the rest of the project continue to work.

A future offline-cache layer can store fetched DAT files and dependencies in IndexedDB without changing project format.

## Attribution

Parts geometry provided by the LDraw Parts Library.
LDraw is an independent community project and is not affiliated with the LEGO Group.
