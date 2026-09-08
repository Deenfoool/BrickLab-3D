# Physics collider profiles — PHYSICS-7

BrickLab renders detailed parts, but Rapier must use simplified collision geometry. Before PHYSICS-7, most non-wheel/non-gear parts were reduced to one solid bounding cuboid. That made visually empty space physically solid.

Typical failures included:

- the air between studs behaving like a solid slab;
- Technic pin/axle holes being physically filled;
- shafts and inline couplers behaving like square blocks;
- a valid BUILD assembly being pushed apart on the first SIMULATE step.

PHYSICS-7 introduces explicit clearance-aware proxy profiles:

- **Studded bricks and plates** use the structural core only; studs no longer extend one giant collider across all empty space above the body.
- **Straight Technic pin-hole rows** use compound top/bottom rails and posts, leaving a physical passage through every hole.
- **Pure axial shaft parts** use an X-axis cylindrical proxy when appropriate instead of a full bounding cuboid.
- **Wheels and gears** retain their dedicated cylindrical proxies.
- Multi-collider part mass is distributed across proxy pieces by proxy volume so total part mass remains unchanged.

The straight Technic hole proxy currently keeps `0.285 stud` radial clearance around each connector center. This is intentionally slightly larger than the visual hole radius so a correctly snapped axle/pin is not immediately treated as penetrating the structural collider.

Runtime diagnostics:

```js
window.__bricklabPhysicsDiagnostics().colliders
```

Expected version:

```text
collider-profiles-v3
```

The PHYSICS-6 unit contract remains unchanged:

```text
1 stud = 0.008 m
Editor/connector -> Rapier: × 0.008
Rapier -> editor: ÷ 0.008
```
