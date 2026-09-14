# Physics collider profiles — PHYSICS-7 / Technic clearance hardening

BrickLab renders detailed parts, but Rapier must use simplified collision geometry. A render mesh cannot be treated as one solid bounding cuboid when the real part contains mechanical passages such as Technic pin holes.

Typical failures from an over-solid proxy are:

- air between studs behaving like a solid slab;
- Technic pin/axle holes becoming physically filled;
- pins and shafts behaving like square blocks;
- a valid BUILD assembly being pushed apart on the first SIMULATE step as Rapier resolves initial penetration.

The active collider model is `collider-profiles-v5`.

## Profile source order

`buildColliderProfile()` keeps the following priority:

1. **Explicit complex collider profiles** remain authoritative. Bent liftarms, frames and other parts that already provide `physics.colliderProfile` are not replaced by generic inference.
2. **Verified Technic pin-hole rows** use compound rail/post proxies, leaving the hole centers physically empty. Hydrated LDraw parts prefer Connector V4 `technic-pin-hole` semantics; built-in procedural parts fall back to legacy `pin-hole` connector metadata.
3. **Pure Technic pins** use an axis-aligned cylinder proxy instead of their visual bounding box.
4. **Studded bodies** keep the structural core proxy so the air above/between studs is not filled.
5. **Pure axial shaft parts** keep their established cylindrical proxy where applicable.
6. Everything else falls back to bounds unless it has a dedicated wheel/gear proxy in the runtime.

## Technic pin-hole clearance

BrickLab uses one stud as 8 mm. Parts 6 nominal geometry defines:

```text
visual pin-hole radius = 2.4 mm / 8 mm = 0.3000 stud
visual pin body radius = 2.34 mm / 8 mm = 0.2925 stud
visual friction radius = 2.45 mm / 8 mm = 0.30625 stud
```

The contact proxies intentionally use:

```text
hole clearance radius = 0.3125 stud
pin collider radius    = 0.2850 stud
radial physics margin  = 0.0275 stud ≈ 0.22 mm
```

The wider molded friction rings/collar remain visible geometry, but they are not used as the pin's collision cross-section. Connector constraints own retention/alignment; the collision proxy only needs to prevent gross interpenetration without ejecting a correctly snapped part.

This is especially important for friction pins: the Parts 6 visual center collar is wider than the nominal bore, so using the whole visual bounds as a cuboid would make a valid pin physically impossible to place inside a beam.

## LDraw / Connector V4

LDraw collision clearance now consumes the same verified Connector V4 Technic-hole semantics used by snapping whenever `definition.connectivityV4` is ready and healthy. This closes the previous mismatch where SNAP could recognize `connhole.dat` but the physics profile still saw no legacy `pin-hole` and filled the part with a bounds cuboid.

Only profile-verified `technic-pin-hole` receivers are used for this path. Generic female cylinders, anti-studs and unrelated cavities are not promoted to Technic bores.

Straight rows may run on local X, Y or Z, but every hole must share one cardinal axis and one collinear row. Ambiguous/off-axis layouts fall back instead of carving arbitrary geometry.

## Runtime diagnostics

```js
window.__bricklabPhysicsDiagnostics().colliders
```

Expected version:

```text
collider-profiles-v5
```

The PHYSICS-6 unit contract remains unchanged:

```text
1 stud = 0.008 m
Editor/connector -> Rapier: × 0.008
Rapier -> editor: ÷ 0.008
```
