// BrickLab production mechanics extensions.
// This module is imported before app.js so catalog additions and PhysicsSession
// prototype extensions are registered deterministically before project restore
// or the first SIMULATE / TEST session.
import './lab-parts.js'
import './suspension-patch.js'
import './differential-patch.js'
import './sensors-patch.js'
import './torque-test-patch.js'
