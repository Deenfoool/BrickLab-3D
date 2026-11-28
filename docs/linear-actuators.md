# Linear actuators — first integration
- 43097-f1/f2 and 61927-f1/f2: LDraw root has housing, input bush 47157, and piston 62274c01. Piston datum Z=170 or 270 LDU. Stroke 100 LDU (5 studs).
- 61904 hinged and 61905 fixed bracket: common local housing datum, keyed seat. Existing cross-axis holes remain available for actual fasteners; the virtual seat does not add those fasteners to the inventory. External hinges still use pins/axles.
- Input cross bore remains keyed during snapping, but the housing is not locked to the rotating input.
- Kinematics preview: direct actuator slider or external axle / gear input; independent rod and rotor rendering; translates a freely moving rod-side branch. Range capped, no extrapolated rod travel.
- 26 turns/full stroke and positive input rotation=extension are simulation assumptions pending physical calibration; no measured torque/clutch model yet.
- Simple planar actuator/rocker/base loops solve the circle intersection on the assembled branch, constrain stroke by reachability and validate all original joints. Complex or shared-output mechanisms that cannot preserve connections are deliberately rejected rather than tearing joints apart.
- Apply actuator position saves extension and input phase, updates rod connector positions, preserves existing valid connections and belts, and supports undo/redo, cloud and local documents. Intermediate LDraw export uses the three original component references. Direct slider is a position preset; if an external shaft is attached, select that shaft for powered rotation.
- Remaining: measured screw direction/pitch/force/clutch, arbitrary spatial and synchronized multi-actuator loops, physical test-drive integration, small and XL designs, browser verification.
- Geometry sources: https://library.ldraw.org/library/official/parts/43097-f1.dat and 43097-f2.dat, 61927-f1.dat and 61927-f2.dat, 61904.dat, 47157.dat, 62274c01.dat. LDraw data is already shipped in the project.
