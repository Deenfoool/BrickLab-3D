# PHYSICS-9: axle / Technic bearing investigation

Baseline: main `1af0fb9c92310b9370ee25612b3378f94fc97d36` (PHYSICS-8), Rapier 0.20.0.

## Root cause

`joint-stability-v4.js:createStableJointV4` passed the axis local to body A as the *single* axis argument of `JointData.revolute`. Rapier interprets that argument in **both** body frames. Axle connectors point along local X; Technic brick holes point along local Z. Rotating an axle into the hole aligns the physical connector axes, but does not make the two body coordinate systems identical. The resulting revolute constraint started with a 90° angular error, even though its two world anchors coincided within 1.9 nanometres.

Rapier immediately supplied angular constraint impulses to correct this fabricated error. The previous duplicate-bearing fix only addressed positional error and redundant constraints. A single remaining bearing was enough to inject energy. Base motor/hinge construction and the suspension path contained the same three-argument API misuse.

## IDs and catalog comparison

`app.js` assigns `crypto.randomUUID()` to `instanceId`; the inspector displays `instanceId.slice(0,8)`. `30887916` and `74c43134` fit those displayed instance prefixes, not catalog `partId`s. Neither prefix occurs in the repository; no original `.bricklab` project was supplied. We therefore cannot identify the original full UUIDs, transforms, or exact compound frame. The reproduction uses the named catalog definitions `axle-12` and `technic-brick-1x6`, with explicitly documented transforms in `axle-fixtures.js`.

Axles 3/5/7 use `parts.js`; 9 uses `basic-parts-pack.js`; 12 uses `technic-parts-pack-v2.js`. All use longitudinal local-X connectors, shaft mechanics, geometry-derived rotational collider profiles, and the same compound-body builder. Axle 12 has no special physics runner or joint branch. The longer rod changes inertia and the magnitude of the correction; it is not a unique cause. Real solver tests reproduced spurious rotation on 3, 5, 7, 9 and 12L with both Technic 1×4 and 1×6.

Technic holes use local Z and hole-aware rail/post colliders. The 12L/1×6 single-bearing reproduction has **zero initial inter-body penetration**. Its cylinder radius is 0.0014896 m and half-length 0.04784 m, with longitudinal orientation world Z. Brick mass is 0.003 kg; axle mass is 0.00185 kg. Both COM heights are 0.0848 m in the low-height diagnostic. Axle principal moments are approximately `[1.41237e-6, 2.05249e-9, 1.41237e-6] kg·m²`. The complete transforms, COMs, inertias, oriented collider bounds and joint frames are in [axle-first-step.json](axle-first-step.json).

Positions and collider lengths convert once from studs to metres using 0.008; render sync converts back using 125. Anchor conversion uses the inverse body transform before multiplying by 0.008. No extra unit conversion, mass override, or collider resize was needed.

## First-step evidence

Same reset state, gravity 9.81 m/s², 1/120 s step, no motor, initial v = ω = force = torque = 0:

| Measurement | PHYSICS-8 descriptor | Correct independent axes |
|---|---:|---:|
| Bodies / bearings | 2 / 1 | 2 / 1 |
| Initial angular constraint error | 90° | < 0.00006° |
| Initial penetrating pairs | 0 | 0 |
| Brick angular speed after step 1 | 36.40620 rad/s | approximately 0 |
| Axle angular speed after step 1 | 36.40622 rad/s | approximately 0 |
| Total energy before step | 0.0040346565 J | 0.0040346565 J |
| Total energy after step | 0.0053950503 J | 0.0040326309 J |
| Energy ratio | 1.337177 | 0.999498 |

Both bodies have erroneous angular velocity at the **first observed world-step boundary**; there is no evidence to assign an internal solver ordering to one of them. The axle gains more kinetic energy (~0.000950 J versus ~0.000429 J for the brick). Removing only the joint removes the excess energy. Disabling only inter-part contacts leaves the old result identical. Gravity and all custom-force inputs are unchanged. This isolates the joint solver, not the contact solver, motors, or rendering.

The low-height frame reproduction likewise increases energy by 24.75% on step 1 with the old descriptor; the same frame without its axle does not. Independent supports can have other geometric overlaps, explicitly reported in the JSON; they are not used as proof of a contact-free scene. Longer runs at 200 studs isolate 60 free-fall steps from ground collision.

## Fix and scope

`physics.js:revoluteJointData` expresses one world axis separately in the two body's local frames and uses the pinned Rapier API `revoluteWithAxes(anchorA, anchorB, axisA, axisB)`. `joint-stability-v4.js`, base joint creation and `suspension-patch.js` call that helper. No new runtime override, stabilization force, velocity clamp, teleport, sleep rule, collision disable, mass change or gravity change was added. Existing pair-contact settings and duplicate-bearing handling remain as before.

The browser production import map aliases Connector v3 modules, but Node and Vite previously resolved the old files. `tests/runtime-import-map.mjs` and `vite.config.ts` now consume the same local aliases. Tests now exercise the deployed module graph. Existing fixture corrections: separated overlapping isolated gear-test rotors; allowed one part-per-million floating-point residue; initialized the ray-query broad phase before the tire test; replaced the invalid male-axle/male-axle motor fixture with a real axle coupler socket. Production connector rules and the RPM controller were not changed.

Files: `physics.js`, `joint-stability-v4.js`, `suspension-patch.js`; build/import-map configuration in `vite.config.ts`, `package.json`, `scripts/version-runtime.mjs`, `index.html`, `physics-error-ui.js`; the new `tests/axle-*` fixtures, diagnostics and browser page; `tests/runtime-import-map.mjs`; updates to existing physics tests and the time-scale browser import map; this report and its JSON evidence.

## Regression and local results

- `npm run test:physics`: **27/27 passed**. Axle coverage includes 160 real-Rapier scenarios: five lengths, two brick sizes, A–F plus no-joints/no-contacts controls, normal/reversed body order and globally rotated assemblies. Assert body/joint counts, coincident anchors/axes, no angular launch, gravitational velocity and no energy increase through steps 1, 2, 3, 5, 10, 30 and 60.
- Positive control runs the exact old descriptor on a test instance, reproduces >30 rad/s and >30% excess energy, and verifies disabling contacts makes no difference. No production prototype is changed by this control.
- `npm run build`: passed (TypeScript and Vite). There is no `npm test` script.
- Reset free fall, real timer ticks, 7.2 m initial height: 0.5× **2.435 s**, 1× **1.218 s**, 2× **0.610 s**, 3× **0.407 s**. The test samples actual rigid-body position; fixed Rapier dt remains 1/120 s.
- Existing tests retain motor BUILD command/direction/autostart coverage at 30/60/144 FPS and all time scales, equal-simulation-time trajectory comparisons, and TEST forced to 1×.

To regenerate the full 16-scene diagnostic: `node --import ./tests/runtime-import-map.mjs tests/axle-probe.mjs`. The initial informational console line precedes the JSON. It records both old and fixed descriptors; only test instances opt into the old descriptor.

## Runtime ownership and browser reproduction

`PhysicsSession` remains defined only in `physics.js`. `app.js` calls its step; `simulation-time.js` contains the sole production `world.step()` and updates `world.timestep` before every microstep. Base/Physics v2 build assign only initial timestep values. No late module assigns `PhysicsSession.prototype.step`; bootstrap and the late-UI regression check its owner. `window.__bricklabTimeDebug()` remains available. Render transforms are synchronized from real bodies.

`tests/axle-browser.html` runs the production loader and catalog against actual browser WASM, reports first-step energy and 60-step angular speed, and exposes full snapshots. It deliberately needs no WebGL renderer, so a renderer-less test environment can still verify the actual physics. The original user's complete project is not available; this is a minimal catalog-based A/B reproduction, not a claim to have replayed that missing project.

Browser verification after publishing PHYSICS-9: the live axle acceptance page passed all 18 corrected scenes with the production CDN Rapier. The old-descriptor positive control reproduced the 90° error and 36.406 rad/s. The final browser comparison uses the same 200-stud height for both descriptors, so the potential-energy-normalized increase is smaller than the 10-stud first-step diagnostic above. The main application displays PHYSICS-9; its 3D viewport cannot run in this cloud browser because WebGL is disabled. This limitation does not affect the actual WASM solver acceptance page.
