# BrickLab sensors and live history

BrickLab includes fictional lab sensors for debugging mechanical builds without requiring a backend or a separate data-logging service.

## RPM Sensor

`RPM Sensor` is an inline keyed shaft part with one axle-hole connector.

Because it has `mechanics.shaft = true`, snapping it onto an axle makes it part of the same rigid shaft group. During SIMULATE the sensor reads the actual Rapier angular velocity of that shaft and projects it onto the shaft axis.

The displayed value is therefore actual physics RPM, not only the drivetrain target.

## Torque Sensor

`Torque Sensor` is also an inline shaft part.

The current reading is an estimate derived from:

- actual Lab Motor load/torque;
- shaft ratio relative to the motor;
- accumulated drivetrain efficiency;
- the propagated torque-capacity ceiling for that shaft.

The reading is shown in BrickLab internal torque units (`T`). It is not yet calibrated to N·m.

## Live history

SIMULATE and TEST show a rolling chart with approximately the latest 180 display samples.

Current traces:

- motor/primary-shaft RPM;
- whole-build body speed.

Telemetry normally refreshes at roughly one sample every six physics updates. The graph is intentionally a short diagnostic window rather than a precision DAQ display.

## CSV logging

The telemetry panel has a **CSV** export action. BrickLab records a longer in-memory run log while the current physics session is alive.

Current CSV columns include:

- simulation time;
- scenario ID;
- TEST status;
- body speed;
- body acceleration;
- primary/motor RPM;
- motor load %;
- motor torque in BrickLab `T` units;
- Pull / Torque Bench load in `F` units when applicable;
- one channel for each installed RPM Sensor or Torque Sensor.

The file name includes the current scenario and an ISO timestamp.

CSV logging is reset when the physics session is disposed or reset. It is deliberately local-only; no telemetry is uploaded to a server.

## Current limits

- Torque Sensor is a semantic estimate, not a direct constraint-impulse torque measurement.
- `T`, `F`, and world-speed units are not yet calibrated to SI units.
- Sensor sample cadence is tied to the current telemetry update interval.

## Future sensor work

Planned channels include:

- wheel RPM;
- exact delivered shaft torque from constraint impulses;
- motor electrical power;
- suspension travel velocity;
- chassis pitch/roll;
- acceleration vectors;
- tyre contact load;
- run-to-run comparison overlays.
