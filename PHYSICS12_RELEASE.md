# PHYSICS-12 / Vehicle Drive v2

- Fixed-step vehicle drive controller lives inside the authoritative physics pipeline.
- W/S throttle and safe forward↔reverse interlock.
- Drivetrain-aware motor selection: accessory motors are not hijacked.
- Automatic FWD/RWD/AWD/MULTI classification from drivetrain shaft propagation.
- Motor-forward direction inferred from wheel/shaft geometry.
- Vehicle UI is input-only; requestAnimationFrame no longer mutates motor runtime state.
- Existing Auto-start behavior is preserved until W/S explicitly takes vehicle-drive ownership.
- Pipeline order resolves driver commands before motor torque on the same physics step.
- Regression coverage includes drive topology, reverse interlock, accessory motor isolation and pipeline ordering.
