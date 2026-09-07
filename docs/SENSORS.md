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

SIMULATE also shows a small rolling chart with approximately the latest 180 telemetry samples.

Current traces:

- motor/primary-shaft RPM;
- whole-build body speed.

Telemetry normally refreshes at roughly one sample every six render/physics updates, so the visible time window is intended as a short diagnostic history rather than a precision data-acquisition system.

## Future sensor work

Planned channels include:

- wheel RPM;
- exact delivered shaft torque from constraint impulses;
- motor current and electrical power;
- suspension travel and velocity;
- chassis pitch/roll;
- acceleration vectors;
- tyre contact load;
- exportable CSV/test-run traces.
