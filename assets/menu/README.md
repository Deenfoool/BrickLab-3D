# BrickLab main menu background

The main menu automatically looks for these files in order:

1. `assets/menu/background.webm`
2. `assets/menu/background.mp4`

The video should be a dark, slow-moving mechanical/engineering scene. Recommended properties:

- 16:9 or wider
- 1920×1080 source is enough for desktop
- H.264 MP4 and/or VP9/AV1 WebM
- no audio track required (the element is always muted)
- seamless or visually soft loop
- restrained motion so the UI remains readable
- keep the file reasonably small for GitHub Pages

If neither file exists, the menu uses its built-in dark engineering gradient and remains fully functional.
