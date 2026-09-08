import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ackermannAngles,
  approachVehicle,
  boundedBrakeTorque,
  classifyWheelAxles,
} from '../vehicle-model-v1.js'

test('Ackermann gives the inner front wheel a larger angle', () => {
  const left = ackermannAngles({ input: 1, wheelbase: 0.12, track: 0.08, maxSteerRadians: Math.PI / 6 })
  assert.ok(left.left > left.right)
  assert.ok(left.right > 0)
  assert.ok(Number.isFinite(left.radius) && left.radius > 0)

  const right = ackermannAngles({ input: -1, wheelbase: 0.12, track: 0.08, maxSteerRadians: Math.PI / 6 })
  assert.ok(right.right < right.left)
  assert.ok(right.left < 0)
  assert.ok(Math.abs(right.right) > Math.abs(right.left))

  const straight = ackermannAngles({ input: 0, wheelbase: 0.12, track: 0.08 })
  assert.deepEqual({ left: straight.left, right: straight.right, center: straight.center }, { left: 0, right: 0, center: 0 })
})

test('brake torque cannot numerically reverse wheel angular velocity', () => {
  for (const omega of [-30, -2, 2, 30]) {
    const invI = 125
    const dt = 1 / 120
    const torque = boundedBrakeTorque({ omega, input: 1, maxTorque: 10, inverseInertia: invI, dt })
    const after = omega + torque * invI * dt
    assert.ok(Math.abs(after) <= Math.abs(omega) + 1e-12)
    assert.ok(after === 0 || Math.sign(after) === Math.sign(omega))
  }
})

test('vehicle steering input approaches the target at a finite rate', () => {
  assert.equal(approachVehicle(0, 1, 0.25), 0.25)
  assert.equal(approachVehicle(0.9, 1, 0.25), 1)
  assert.equal(approachVehicle(0, -1, 0.4), -0.4)
})

test('four wheel layout classifies front/rear and left/right axles', () => {
  const layout = classifyWheelAxles([
    { id: 'fl', x: -0.04, z: 0.06 },
    { id: 'fr', x: 0.04, z: 0.06 },
    { id: 'rl', x: -0.04, z: -0.06 },
    { id: 'rr', x: 0.04, z: -0.06 },
  ])
  assert.ok(Math.abs(layout.wheelbase - 0.12) < 1e-12)
  assert.ok(Math.abs(layout.track - 0.08) < 1e-12)
  const byId = Object.fromEntries(layout.wheels.map(w => [w.id, w]))
  assert.equal(byId.fl.axle, 'front')
  assert.equal(byId.fr.axle, 'front')
  assert.equal(byId.rl.axle, 'rear')
  assert.equal(byId.rr.axle, 'rear')
  assert.equal(byId.fl.side, 'left')
  assert.equal(byId.fr.side, 'right')
})
