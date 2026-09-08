# Time Scale: RUNTIME-4

## Root cause reproduced

RUNTIME-3 imported `physics-v2.js?v=runtime-3-20260908-0848` from
`runtime-extensions.js`. Later, `physics-v2-ui.js` imported `./physics-v2.js`
without a query string. ES modules use resolved URLs as identity: the second
URL evaluated the module again, replacing `step`, `build`, motor torque and
other patched methods on the **same** PhysicsSession class.

Before the late UI import: `stepWithPhysicalTimeScaleV3`.
After it: the anonymous Physics v2 runner, which always accumulated 1× time.
Reproduction with Rapier 0.20.0, one ordinary brick at 900 studs, 60 FPS:
**1.233 s at every requested scale (0.5, 1, 2, 3)**.

## Ownership and loading

- `app.js` is the only production caller of `physicsSession.step()`.
- The only PhysicsSession class is exported from `physics.js`.
- Its class method delegates to `simulation-time.js`; no extension replaces it.
- The only production `world.step()` call is in `simulation-time.js`.
- `physics.js` and `physics-v2.js` also initialize world timestep at construction.
  The runner sets the fixed timestep again immediately before each integration.
- `simulation-runtime-v2.js` owns controls, RPM commands and the debug accessor.
  Its old runner was removed. `simulation-time-authoritative-v3.js` was deleted.
- A generated import map assigns **every root JS module** one versioned URL.
  Static imports and sequential dynamic imports resolve to this same URL.
  In particular, the late Physics UI import cannot re-evaluate Physics v2.
- Bootstrap verifies the step owner after all production modules have loaded.
- `syncObjects()` copies rigid-body transforms; there is no time interpolation.
  Suspension and tire load calculations use rigid-body transforms per microstep,
  so render frequency cannot change their input poses.

## Clock

`baseDt = 1 / quality.hz`, independent of Time Scale:

| Quality | Hz | Fixed dt |
|---|---:|---:|
| Fast | 60 | 1/60 s |
| Balanced | 120 | 1/120 s |
| Accurate | 180 | 1/180 s |

Accumulate `realDelta * appliedScale`, then consume fixed microsteps. Each one
updates simulation/test timers, motor commands and torque, suspension, gear
couplers/stress, tires, scenario forces, Rapier integration and vehicle metrics.
Gravity is unchanged. TEST is identified by the session and always applies 1×.
Reset retains the test scenario; pause/resume refreshes the clock without
integrating time spent paused.

The step budget scales with speed and can process a full 250 ms real frame at
all qualities/scales. Tested at 5 FPS without dropped simulation time. Gaps over
250 ms (e.g. suspended browser tab) are capped explicitly; the lost simulated
time is reported as `droppedSimulationTime`. `realElapsed` includes these gaps,
so `effectiveScale` honestly reveals slowdown. Accumulator debt is not silently
clipped. The claimed time ratios apply while frame gaps stay within this bound.

## Motor preservation and numerical correction

BUILD `baseRpm`, `maxRpm`, `stepRpm`, `autoStart`, `initialDirection`, and runtime
commands still pass through BrickLabControls. A loaded RPM controller previously
could overshoot a light axle by hundreds of RPM in one tick. The torque is now
bounded both by the motor torque curve and by the relative angular impulse
needed to reach the setpoint, using shaft/housing inertia and fixed dt. No body
velocity is directly assigned. Shaft tests measured 40.00003 and 140.00021 RPM
for commands 40 and 140 RPM at every tested FPS and Time Scale.

Suspension now has a separate `updateSuspensionV2(dt)` hook; replacing motor
control no longer drops spring/damping updates.

## Diagnostics

```js
window.__bricklabTimeDebug()
// requestedScale, appliedScale, realElapsed, simulationElapsed, effectiveScale,
// physicsHz, baseDt, accumulator, lastSubsteps, activeStepOwner, worldTimestep,
// scenario, test, running, requestedSimulationElapsed, droppedSimulationTime

window.__bricklabPhysicsSession.step.__bricklabOwner
// 'simulation-time-authoritative-v4'

// After production bootstrap completes:
window.__bricklabRuntimeReady
```

The exported `PhysicsSession.prototype.step.__bricklabOwner` is the same marker.

## Reproducible acceptance

```sh
npm ci
npm run test:physics
npm run build
```

The Node suite runs actual Rapier WASM and Three.js part geometry. Happy DOM
provides only the UI environment; neither physics nor rigid-body positions are
mocked. It imports the production extensions and late Physics UI, tests 48
fall cases (four scales × four FPS × three qualities), exact equal-simulation-time
body states, 5 FPS, scale switching, pause/resume/reset, TEST countdown, command RPM,
suspension and the assembled powertrain/wheel trajectory.

Wall-clock acceptance uses real timer ticks and a fresh world before every run.
One representative run (Balanced, same 7.2 m starting height):

| Requested | Measured real fall time |
|---|---:|
| 0.5× | 2.435 s |
| 1× | 1.221 s |
| 2× | 0.609 s |
| 3× | 0.410 s |

The deterministic 60 FPS run detects ground arrival at simulation time
1.216667 s for all four scales. Its real frame times are 2.433, 1.217, 0.617,
0.417 s; frame sampling explains the rounding at accelerated speeds.

`tests/time-scale-browser.html` runs the same production physics loader and
late UI import in an actual browser, without requiring a WebGL renderer. It
measures real time and body position, and displays diagnostics and PASS/FAIL.
This is separate from a visual scene test: the verification browser used for
this change has WebGL disabled.

## Manual publication (no Actions)

The obsolete Actions deployment workflow was removed. GitHub Pages continues
serving the repository-root static site from `gh-pages`, including `.nojekyll`.
Do not publish `dist` over this no-build production layout.

After edits, regenerate cache versions and verify before committing:

```sh
npm run version:runtime -- runtime-4-20260908-01
npm run test:physics
npm run build
git add <reviewed files>
git commit -m "fix: ..."
git push --atomic origin main main:gh-pages
```

Use a new runtime tag on subsequent releases. The version script updates both
production/test import maps, entry URL and build badge. If branch history has
diverged, inspect it and merge as necessary; do not force-push by default.
