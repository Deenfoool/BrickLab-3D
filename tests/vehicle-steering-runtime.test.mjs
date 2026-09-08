import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window', 'document', 'localStorage', 'CustomEvent', 'MutationObserver', 'CSS']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = () => 0
globalThis.setInterval = () => 0

await import('../runtime-extensions.js')
const { PhysicsSession } = await import('../physics.js')
const { findPart } = await import('../parts.js')
await RAPIER.init()

function part(partId, instanceId, position) {
  const object = findPart(partId).create(0x6688aa)
  object.userData.partId = partId
  object.userData.instanceId = instanceId
  object.position.fromArray(position)
  return object
}

function quat(body) {
  const q = body.rotation()
  return new THREE.Quaternion(q.x, q.y, q.z, q.w)
}

function relativeYaw(baseBody, movingBody) {
  const relative = quat(baseBody).invert().multiply(quat(movingBody)).normalize()
  return new THREE.Euler().setFromQuaternion(relative, 'YXZ').y
}

test('Steering Base + Knuckle owns one real Rapier hinge and turns the wheel body', () => {
  localStorage.setItem('bricklab.physics.v2.settings', JSON.stringify({ quality: 'balanced', selfCollision: 'mechanical' }))
  window.__bricklabRequestedTimeScale = 1

  // Exact connector alignment, in editor studs:
  // frame stud y=1.2 -> base tube y=0
  // base pivot y=.88 -> knuckle pivot y=.88
  // knuckle bearing y=.55 -> axle-2 axle-0 at [-.5,.32,0]
  // axle-2 axle-1 -> wheel axle hole y=1.15
  const objects = [
    part('brick-2x4', 'frame', [0, 100, 0]),
    part('steering-base', 'steer-base', [0, 101.2, 0]),
    part('steering-knuckle', 'knuckle', [0, 101.2, 0]),
    part('axle-2', 'wheel-axle', [0.5, 101.43, 0]),
    part('wheel-small', 'wheel', [1.0, 100.60, 0]),
  ]

  const connections = [
    {
      id: 'frame-base', kind: 'fixed',
      a: { instanceId: 'frame', connectorId: 'stud-0-1' },
      b: { instanceId: 'steer-base', connectorId: 'mount-0-0' },
    },
    {
      id: 'steering-pivot', kind: 'hinge',
      a: { instanceId: 'steer-base', connectorId: 'pivot-hole' },
      b: { instanceId: 'knuckle', connectorId: 'pivot-pin' },
    },
    {
      id: 'knuckle-bearing', kind: 'bearing',
      a: { instanceId: 'knuckle', connectorId: 'wheel-bearing' },
      b: { instanceId: 'wheel-axle', connectorId: 'axle-0' },
    },
    {
      id: 'axle-wheel', kind: 'axle',
      a: { instanceId: 'wheel-axle', connectorId: 'axle-1' },
      b: { instanceId: 'wheel', connectorId: 'axle-hole' },
    },
  ]

  const session = new PhysicsSession(RAPIER, objects, connections)
  session.build()
  try {
    assert.equal(session.failedJointCount, 0)
    assert.ok((session.revoluteJoints?.length ?? 0) >= 2, 'hinge and wheel bearing are in the authoritative registry')
    assert.equal(session.steeringJointsV1?.length, 1, 'knuckle hinge registered as physical steering')
    assert.equal(session.wheelMonitors?.length, 1)
    assert.ok(session.wheelMonitors[0].physicalSteeringV1)
    assert.equal(session.vehicleControlV1.steeringMode, 'physical')

    const baseBody = session.members.get('steer-base').body
    const knuckleBody = session.members.get('knuckle').body
    baseBody.setBodyType(RAPIER.RigidBodyType.Fixed, true)

    // One-wheel fixture is enough to verify the real joint, but the normal vehicle
    // enable rule expects at least two wheels. Enable only the controller for this fixture.
    session.vehicleControlV1.enabled = true
    session.vehicleControlV1.steeringTarget = 1
    session.world.timestep = 1 / 120

    for (let i = 0; i < 120; i += 1) {
      session.updateVehicleControlsV1(1 / 120)
      session.world.step()
    }

    const steering = session.steeringJointsV1[0]
    const yaw = relativeYaw(baseBody, knuckleBody)
    assert.ok(Math.abs(steering.targetAngle) > THREE.MathUtils.degToRad(20), `target=${THREE.MathUtils.radToDeg(steering.targetAngle)}°`)
    assert.ok(Math.abs(yaw) > THREE.MathUtils.degToRad(4), `physical yaw=${THREE.MathUtils.radToDeg(yaw)}°`)
    assert.ok(Math.abs(yaw) <= steering.maxSteerRadians + THREE.MathUtils.degToRad(3), 'joint limit caps steering travel')
  } finally {
    session.dispose()
  }
})

await dom.happyDOM.close()
