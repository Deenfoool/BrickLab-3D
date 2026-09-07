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

The drivetrain layer gives each branch its own shaft and torque budget. The physics extension then applies one differential constraint across both output shafts instead of treating them as two locked 1:1 drives.

The controlled relationship is the open-differential average-speed equation:

```text
(ω_left / ratio_left + ω_right / ratio_right) / 2 = ω_input
```

For the current 1:1 prototype this reduces to:

```text
ω_left + ω_right = 2 × ω_input
```

That means the left and right half-shafts may run at different speeds while their average still follows the carrier/input speed.

The default torque budget is split 50/50 across both output branches with prototype efficiency `0.92`. If only one half-shaft is connected, the patch does not create a fake locked drive through the remaining side.

SIMULATE adds differential telemetry:

- left output RPM;
- right output RPM;
- absolute RPM difference (`ΔRPM`).

A non-zero `ΔRPM` is therefore expected during differential action rather than automatically treated as an error.

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
