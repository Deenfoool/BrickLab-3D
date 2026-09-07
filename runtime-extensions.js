// BrickLab production mechanics and rendering extensions.
// This module is imported before app.js so catalog additions, render quality,
// and PhysicsSession prototype extensions are registered deterministically.
import './render-quality.js'
import './lab-parts.js'
import './suspension-patch.js'
import './differential-patch.js'
import './sensors-patch.js'
import './torque-test-patch.js'
import './obstacle-test-patch.js'
