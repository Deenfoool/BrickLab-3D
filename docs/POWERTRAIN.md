# BrickLab powertrain semantics

BrickLab keeps visible mechanical geometry separate from the authoritative drivetrain graph. This lets the browser simulate gear ratios, torque transfer, transmissions, and differentials without relying on unstable tooth-to-tooth collision.

## F/N/R Gearbox

The `F/N/R Gearbox` is a semantic housing with two axle-hole ports:

- `input`
- `output`

It is deliberately excluded from rigid shaft grouping. Connecting axles to both ports therefore creates two separate shafts rather than accidentally merging them into one rigid body.

The active mode is global for the current simulation session:

- **F** — ratio `+1.0`
- **N** — no coupling is created; the output shaft is free
- **R** — ratio `-1.0`

Transmission efficiency is currently `0.90`.

The top-bar F/N/R control stores its state in `localStorage`. Changing mode while SIMULATE is running resets the physics session so the drivetrain graph is rebuilt with the new coupling.

## Open Differential

The `Open Differential` exposes:

- one input axle-hole;
- left half-shaft output;
- right half-shaft output.

The first implementation creates two torque-limited output couplings. With the default configuration:

```text
input speed × 1.0 → left output
input speed × 1.0 → right output
available input torque × 0.5 → each branch
```

The differential has prototype efficiency `0.92` and a `0.5 / 0.5` torque split.

This is intentionally a simplified open-differential model. It gives independent output shafts and proper torque budgeting, but it does not yet implement the exact spider-gear constraint:

```text
ω_left + ω_right = 2 × ω_carrier
```

That exact constraint will become important once asymmetric tyre traction and one-wheel-slip tests are implemented.

## Semantic housings

Gearboxes and differentials are not considered shaft members. Their axle connections therefore do not become rigid `axle` unions in physics. The housing itself can still be fixed to a chassis through its bottom tube mounts.

## Powertrain Bench

`examples/powertrain-bench.bricklab` contains a ready-made test fixture:

```text
Lab Motor
   ↓
Axle 5L
   ↓ bearing
F/N/R Gearbox
   ↓
Axle 5L
   ↓ bearing
Off-road Wheel load
```

The wrench button next to the F/N/R selector loads this fixture and keeps a separate backup of the user's current project. The same button restores the previous project.

## Torque units

Torque values are still BrickLab internal units (`T`). They must not be interpreted as N·m until mass, length, inertia, and motor parameters have been calibrated to a physical scale.
