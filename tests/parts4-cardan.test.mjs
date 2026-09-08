import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = () => 0

await import('../parts4/mechanical-driveline-v1.js')
await import('../physical-parts.js')
await import('../physics-stability-v3.js')
await import('../drivetrain-stress-v2.js')
const {
  ARTICULATED_DRIVELINE_PHYSICS_VERSION,
  cardanVelocityRatio,
} = await import('../parts4/articulated-driveline-physics-v1.js')
const { PhysicsSession } = await import('../physics.js')
const { findPart } = await import('../parts.js')

test('Cardan velocity ratio varies around 1:1 at a 30 degree articulation', () => {
  const beta = Math.PI / 6
  const atZero = cardanVelocityRatio(beta, 0)
  const atQuarter = cardanVelocityRatio(beta, Math.PI / 2)
  assert.ok(Math.abs(atZero - Math.cos(beta)) < 1e-12)
  assert.ok(Math.abs(atQuarter - 1 / Math.cos(beta)) < 1e-12)
  assert.ok(atZero < 1)
  assert.ok(atQuarter > 1)
})

test('CV metadata selects constant velocity while universal joint selects Cardan variation', () => {
  assert.equal(findPart('cv-joint-30').mechanics.articulatedCoupler.constantVelocity, true)
  assert.notEqual(findPart('universal-joint-30').mechanics.articulatedCoupler.constantVelocity, true)
})

test('PARTS-4 articulation is the final drivetrain coupling owner', () => {
  assert.equal(ARTICULATED_DRIVELINE_PHYSICS_VERSION, 'articulated-driveline-physics-v1')
  assert.equal(PhysicsSession.prototype.applyGearCouplingTorques.__bricklabOwner, ARTICULATED_DRIVELINE_PHYSICS_VERSION)
})

test('worm stage only advertises implemented ratio semantics, not unsupported self-locking', () => {
  const worm = findPart('worm-drive-8')
  assert.equal(worm.mechanics.wormDrive.reduction, 8)
  assert.equal('backdriveEfficiency' in worm.mechanics.wormDrive, false)
  assert.doesNotMatch(worm.description, /holding|self-lock/i)
})

await dom.happyDOM.close()
