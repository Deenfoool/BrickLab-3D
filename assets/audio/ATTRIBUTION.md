# BrickLab original audio pack v1

All sounds and the ambient composition **Workbench** were authored procedurally for
BrickLab 3D in this change. No external samples, commercial music, artist recordings,
YouTube downloads or third-party sound libraries are used.

Source: `assets/audio/recipes.js` (deterministic synthesis, four variants per one-shot).
Author credit: BrickLab 3D contributors. Original audio assets and synthesis recipes
are dedicated to the public domain under **CC0 1.0 Universal**:
https://creativecommons.org/publicdomain/zero/1.0/
No attribution is required for reuse. The application's other code keeps its existing license.

`music/workbench.ogg`: original 32-second periodic ambient composition, mono 24 kHz,
Vorbis quality 4. Generated from the `music` recipe, encoded with FFmpeg/libvorbis.
No drums or vocals. Integer-period oscillators and periodic chord envelopes provide
continuous looping; decoded loop continuity is tested separately from musical review.

Short effects and mechanical loops are cached Web Audio buffers synthesized from
local recipes after interaction. This avoids network assets for frequent effects.
Music is fetched/decompressed once; failure leaves effects and the application usable.

Reproduce the music: `node scripts/render-audio.mjs` (requires FFmpeg).
