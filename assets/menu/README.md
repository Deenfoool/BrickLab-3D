# BrickLab main menu assets

The production menu is implemented in `menu/main-menu-v2.js` and `menu/main-menu-v2.css`.

## Background video

The menu automatically tries these files in order:

1. `assets/menu/background.webm`
2. `assets/menu/background.mp4`

Recommended video properties:

- dark, slow-moving mechanical / engineering scene
- 16:9 or wider
- 1920×1080 source is enough for desktop
- H.264 MP4 and/or VP9/AV1 WebM
- no audio track required (the element is always muted)
- seamless or visually soft loop
- restrained motion so UI text stays readable
- keep the file reasonably small for GitHub Pages

If neither video exists, the menu keeps its built-in dark engineering gradient and remains fully functional.

## Interactive hero

The center hero is not an image asset. It is live Three.js geometry created through BrickLab's real production `findPart(...).create(...)` factories after `runtime-extensions.js` has installed the current PARTS-6 refinements.

- If a saved local project exists, the menu previews that real construction.
- Otherwise it builds a compact transmission showcase from real frame, motor, gearbox, differential, gears, axles, bearing block and coupler parts.
- Mouse/touch drag rotates the camera around the object.
- Mouse wheel zooms.
- Double click resets the camera.
- Idle auto-rotation and showcase gear/shaft motion can be disabled in menu settings.
- The hero never starts Rapier or changes physics/mechanics metadata.
