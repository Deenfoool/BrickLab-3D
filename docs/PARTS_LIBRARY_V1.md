# Family parts library V1

The visible parts catalog is owned by `ldraw/catalog-v3.js`, using the WebGL-independent `library-view-v1.js` and scoped `library-v1.css`. The previous native catalog remains hidden as the editor's existing insertion adapter, not a second visible browser. The obsolete LDraw thumbnail decorator is no longer mounted.

## Interaction

- First visit: seven illustrated family cards (System, Technic, Duplo, Bionicle / CCBS, Trains, Power / Robotics, Other).
- Selecting a family persists it. Reopening/reloading restores it. **Change family** always returns to the picker.
- Independently scrolling categories and results. Gears and wheels have collapsible subcategories.
- Search accepts English/Russian terms, IDs, LDraw codes, tooth counts and dimensions (`ось 5`, `gear 24T`, `plate 2×4`). Search and quick sections stay within the selected family and category.
- All, Recent, Favorites, In Project, Compatible. Compatible lists only proven Smart Assembly counterparts; an empty list is not evidence of incompatibility. It does not guess connector fits or solve gear meshes.
- Single click inspects; **+ Add** or double click inserts. Keyboard users can inspect and activate the explicit Add button. Escape closes the window; Ctrl/Cmd+K focuses search.
- Details show name, source, code and already available mechanical/connector/dimension metadata. Unresolved metadata is labelled, not invented.
- 48 results per page; native lazy images, no extra WebGL context or per-frame catalog work. Family/category counts are calculated when the source view changes.

## Data and integration

`library-model-v1.js` classifies presentation records from the existing compact PartCAD/LDraw metadata index and the authoritative `PARTS` registry. It never registers geometry or supplies physics/connectivity evidence. Unregistered index entries are lightweight catalog records. Registered LDraw definitions are deduplicated by code. Original source category is preserved separately from the display taxonomy.

Insertion retains `registerLDrawPart` → hidden native card → `app.js addPart`. Native selection, sound, history, project persistence and Smart Assembly therefore retain their existing owner. Both BUILD and Kinematics state are checked immediately before insertion. A successful placement is verified against live editor instance IDs before recording Recent.

LDraw geometry loads only via the existing runtime. Missing index data leaves registered parts usable; an exact Design ID lookup uses the existing fallback index and fetches metadata for that one known code. Already generated native previews take priority. Failed/unavailable thumbnails show an explicitly labelled family illustration, not a blank field or a fabricated part rendering.

Storage keys: `bricklab.library.family.v1`, `bricklab.library.favorites.v1`, `bricklab.library.recents.v1`. Previous `bricklab.ldraw.favorites.v3` and `bricklab.ldraw.recents.v3` migrate once without deleting their original records. Storage failure is non-fatal.

The floating-panel owner remains `overlay-ui.js`; its drag bounds account for the new 540px desktop window. Inspector layout is unchanged. The library CSS remains scoped. No connector, physics, mechanics or project schema changes.

## Tests / QA

Run `npm run test:library`. Tests cover classification, bilingual search, dimensions, deduplication, family persistence, categories, sections, inspection/insertion callbacks, failure handling, keyboard isolation, escaped metadata and bounded rendering with 17,000 entries.

Open `parts-library-qa.html` for the exact production component and stylesheet with deterministic real LDraw IDs, isolated QA preferences and explicit insertion-callback logging. This page does **not** substitute for a full-editor placement test.

Browser QA on published GitHub Pages, 2026-09-12: first-visit picker, Technic, collapse/expand Gears, Bevel category, Russian search `ось 5`, insertion callback 32073, Recent, Favorites, close/reopen, family persistence after page reload, Compatible 6578 → 2994, change to System and `plate 2x4` all passed. Details for gear 3648 were inspected. No application exceptions on the component QA page; the browser extension emitted unrelated errors.

The existing official thumbnail URLs failed to load in this browser. This exposed the blank-image fallback and led to the labelled illustration fix. The component does not claim these illustrations are exact part geometry.

Full-editor browser QA is **blocked by this browser's disabled WebGL**: `app.js:217` cannot create its renderer, before catalog initialization. This also occurs on the unchanged baseline. Actual 3D placement, scene/save/reload and interactive Smart Assembly/Doctor/Kinematics behavior are therefore **not browser-verified**. The QA insertion callback is not reported as a real scene insertion. No renderer/physics workaround was added.

Baseline comparison at `1e4596a32d3462378bfebe6cf1e5c2498539b156`: the selected 90-test architecture/guidance/LDraw regression suite already had nine failures (stale structural/cache assertions, reference equality in architecture contract and loader text assertion). These are not reported as passing.

## Cache and attribution

`parts-library-20260912-v2` versions bootstrap, catalog aliases, floating-panel integration, view, model and CSS. Unrelated import-map targets retain their original generations. Tests check the runtime metadata-cache alias is retained.

LDraw thumbnails use the existing official image endpoint. Geometry/library attribution remains unchanged. Family illustrations are original local inline SVG; no external illustration assets or new package dependencies were added.
