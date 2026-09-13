# BOM + Build Instructions V1

Status: **IMPLEMENTED — browser/PDF smoke pending**

This implements roadmap item 9 as a local browser workflow built on the stable Architecture API. It does not introduce a second project model, connection graph or cloud dependency.

## Source of truth

The generator reads `BrickLabSubsystems.projects.current()` / the editor project contract. The snapshot contains the real placed parts and the authoritative Connector V4 records (`connectionsV4`); legacy `connections` are only a fallback for older projects.

LDraw BOM rows use the registered LDraw Design ID (`definition.ldraw.code`). Native BrickLab parts use their normal `partId`. Inventory is grouped by design ID + color and can be exported independently as CSV or JSON.

## Assembly-order solver

`instructions/core-v1.js` builds a deterministic graph plan. The same project snapshot produces the same order.

Current heuristics deliberately prefer:

- a low, well-connected structural base;
- connected internal shafts/gears/racks/bushes before exterior/finishing components;
- parts already attached to the assembled frontier;
- paired symmetric identical parts in one readable step when evidence is strong;
- independent connected components as explicit subassemblies.

Insertion direction is taken from real connector metadata when available. Connector-backed directions are marked `verified`; graph-only directions are `inferred`; missing evidence is `uncertain` and becomes a planning warning instead of pretending that insertion is proven.

This V1 does not claim full geometric path planning through arbitrary enclosed meshes. Where the graph cannot prove an insertion direction it reports uncertainty as required by the roadmap.

## Visual instruction renderer

The renderer does not recreate parts from simplified boxes. It copies renderable geometry from the current live BrickLab scene, preserving the actual loaded native/LDraw visuals without mutating editor objects.

For each step:

- previous assembly remains in its final pose;
- newly added real parts are highlighted;
- new parts are exploded along their connector-derived insertion direction;
- a 3D insertion arrow points toward the final pose;
- the camera is framed automatically around the current assembly;
- callouts show Design ID, color and quantity.

Missing/unloaded live visuals are reported on the page rather than silently replaced by fake geometry.

## PDF export

PDF generation is entirely local in the browser and requires no CDN PDF package or backend:

1. BrickLab renders the cover/final model and each build step with Three.js.
2. Page layout is drawn to an A4-ratio Canvas, which keeps browser Unicode/Cyrillic text support.
3. Pages are encoded as JPEG.
4. `pdf-binary-v1.js` writes a valid PDF 1.4 container with each page embedded as a JPEG XObject.

The PDF includes:

- BrickLab cover and hero render;
- one page per assembly step;
- highlighted/exploded new parts and insertion arrow;
- per-step part callouts;
- completed model page;
- paginated final BOM.

Generation yields between steps/pages and is cancellable from the UI so a large project does not intentionally monopolize one long synchronous frame. Each A4 Canvas is JPEG-encoded and released immediately, so large manuals keep only compressed page bytes instead of retaining every full-resolution Canvas in memory.

## UI

A new **Instructions / Инструкция** action appears in the editor top bar. The modal contains:

- current project/BOM summary;
- BOM table;
- CSV export;
- JSON export;
- deterministic step list;
- interactive real-geometry step preview;
- planner warnings/confidence;
- local PDF generation with progress and cancel.

## Automated coverage

`tests/instructions-v1.test.mjs` covers:

- LDraw Design ID + color BOM grouping;
- preference for Connector V4 records;
- deterministic ordering independent of input array order;
- internal shaft ordering ahead of outer attached parts;
- connector-derived insertion direction;
- explicit disconnected subassemblies;
- structural validity of the custom PDF binary writer.

The PDF binary writer was additionally smoke-validated with a real JPEG page through `pdfinfo`: PDF 1.4, one A4 page (`595.28 × 841.89 pt`), readable xref/image object.

## Browser acceptance

Before marking COMPLETE, smoke-test on deployed `gh-pages`:

1. Open a native-parts project and confirm BOM quantities/colors.
2. Open a project containing several LDraw IDs and confirm BOM uses their Design IDs.
3. Select multiple generated steps and verify real loaded geometry appears, not placeholder geometry.
4. Verify new parts are highlighted/exploded and arrows remain visible.
5. Export BOM CSV and JSON and compare totals with the project.
6. Generate a multi-page PDF and open it in Chrome/Firefox/Acrobat-compatible viewers.
7. Confirm cover, all step pages, completed model and BOM are present.
8. Repeat PDF generation and confirm the step order is unchanged when project data did not change.
9. Cancel a long PDF generation and confirm BUILD remains usable.
10. Confirm Connector V4, SIMULATE, Kinematics, Design Doctor, Project Library and TEST Lab still initialize normally.
