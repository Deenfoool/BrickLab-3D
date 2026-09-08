# Vehicle Drive v2 acceptance

Manual browser checks for PHYSICS-12:

1. Passive four-wheel chassis with no motor must remain passive and settle as in PHYSICS-10/11.
2. Vehicle with a drivetrain motor keeps its existing Auto-start behavior until W/S is pressed.
3. After W/S takes ownership, only motors whose drivetrain reaches a wheel shaft are controlled; accessory motors are untouched.
4. W commands vehicle-forward motion, S commands vehicle-reverse motion, independent of motor placement/orientation inferred from shaft geometry.
5. Requesting reverse while moving forward applies service braking first; motor direction must not flip until longitudinal speed is below 0.08 m/s.
6. A/D or arrows keep Ackermann steering behavior. Space is service brake; P is parking brake.
7. Vehicle HUD reports FREE/FWD/RWD/AWD/MULTI topology, motor count, driven wheel count, throttle, steering and braking state.
8. Time Scale 0.5x/1x/2x/3x continues to advance the same fixed-step physics pipeline without changing per-step vehicle laws.
