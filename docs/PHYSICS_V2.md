# BrickLab Physics v2

Physics v2 separates editor geometry from physical units. The editor remains stud-based, while Rapier runs in SI-scale units.

## Units

- 1 stud = 0.008 m
- mass = kg
- force = N
- torque = N·m
- speed = m/s
- acceleration = m/s²
- power = W

The current per-part masses are prototype estimates intended to make relative vehicle behavior meaningful. They can later be replaced with measured catalog masses without changing the physics API.

## Physical part database

`physical-parts.js` attaches physical metadata to parts:

- mass;
- material class;
- collision class;
- wheel tyre parameters;
- motor electrical/mechanical data;
- suspension parameters.

Collider mass is supplied to Rapier with `ColliderDesc.setMass`, so inertia is derived from collider shape rather than a single global density.

## Fixed timestep and quality

Physics is integrated at a fixed step. Rendering FPS does not change the solver timestep.

- FAST — 60 Hz, lower solver budget, CCD disabled.
- BALANCED — 120 Hz, default, CCD enabled.
- ACCURATE — 180 Hz, higher solver budget, CCD enabled.

Frame time is accumulated and consumed in fixed substeps. TEST scoring uses simulated RUN time, not wall-clock render time.

## Collision layers

Classes:

- structure;
- mechanical;
- wheel;
- sensor;
- world.

Self collision modes:

- OFF — construction bodies collide only with the test world;
- MECHANICAL — wheel/mechanical bodies can contact structure and each other;
- FULL — all physical classes may collide.

## Center of mass

The physical build monitor computes:

- total mass;
- weighted center of mass;
- COM height;
- approximate front/rear distribution;
- approximate left/right distribution;
- wheelbase and track when wheels are present.

BUILD shows a Mass / COM overlay. Physics Debug shows the COM marker in the scene during SIMULATE/TEST.

## Tyre model

Wheels use low raw collider friction because vehicle traction is handled explicitly.

For each wheel Physics v2 computes:

- downward contact ray;
- contact point and surface normal;
- point velocity;
- rim speed;
- longitudinal ground speed;
- lateral speed;
- slip ratio;
- slip angle;
- estimated normal load;
- longitudinal force;
- lateral force;
- rolling resistance.

Grip is load-sensitive and uses an approximate longitudinal/lateral weight-transfer model derived from acceleration, COM height, wheelbase and track.

Supported surfaces:

- concrete;
- asphalt;
- dirt;
- gravel;
- mud;
- ice.

TEST scenarios use their default surface unless the Physics menu overrides it.

## Motor and drivetrain

The Lab Motor now uses SI torque values. Its prototype model contains:

- 120 RPM no-load speed;
- 0.045 N·m stall torque;
- 9 V electrical model;
- free/stall current;
- linear torque-speed curve;
- reaction torque on the motor housing.

Telemetry derives:

- actual RPM;
- requested/available torque;
- current;
- mechanical output power;
- electrical input power;
- efficiency;
- drivetrain transfer torque;
- estimated loss.

Gear, gearbox and differential coupling is bounded by propagated torque capacity. The old prototype minimum coupling torque was removed so the drivetrain cannot create torque from an arbitrary numerical floor.

## Suspension v2

The existing revolute Suspension Arm remains the physical joint, but control now distinguishes:

- spring rate;
- compression damping;
- rebound damping;
- bump-stop region;
- travel limit;
- simple left/right anti-roll coupling.

The current suspension is a torsion/control-arm model. A future telescoping shock can use the same parameter vocabulary.

## Deterministic TEST protocol

Every Physics v2 TEST follows:

1. RESET;
2. SETTLE for 0.5 s;
3. 3-second COUNTDOWN;
4. RUN;
5. PASSED or STALLED.

Motor drive is disabled before RUN. Test clocks advance from fixed physics time only.

Scenarios:

### HILL

22° physical incline. Result depends on mass, COM, gearing, tyre load, grip and available motor torque.

### PULL

A reverse force increases in Newtons until the build stalls or reaches the maximum test load.

### OBST

Physical thresholds, staggered articulation blocks, cross bump and bridge ramps exercise clearance, wheel contact and suspension articulation.

### DYNO

A brake torque loads the drivetrain while telemetry records RPM, torque, current, efficiency and power. Peak mechanical power is the score.

## Physics Debug

`F8` toggles debug mode and restarts the current physics session. Debug rendering includes:

- approximate collider bounds;
- COM marker;
- tyre contact points;
- contact normals;
- tyre force arrows;
- chassis velocity vector;
- suspension joint axes.

## CSV

Physics v2 CSV contains SI columns including:

- physics/test time;
- TEST phase/status;
- quality and surface;
- mass;
- body speed/acceleration;
- RPM;
- motor load, torque, power, input power and efficiency;
- Pull force;
- Dyno power;
- installed sensor channels;
- per-wheel contact, normal load, slip ratio, slip angle and longitudinal/lateral forces.

## Current approximation limits

Physics v2 is still a browser construction simulator rather than an engineering FEA package. Tyre contact uses ray-based contact/load estimation, drivetrain coupling is semantic rather than tooth-contact physics, masses are prototype estimates, and flexible deformation is not simulated. Those simplifications are intentional to keep large constructions interactive.
