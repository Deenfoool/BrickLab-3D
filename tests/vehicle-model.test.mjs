import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ackermannAngles,
  approachVehicle,
  boundedBrakeTorque,
  classifyDrivenWheels,
  classifyWheelAxles,
  resolveDriveRequest,
  stepDriveCommand,
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

test('reverse drive request brakes before changing motor direction', () => {
  const forward = resolveDriveRequest({ throttle: 1, longitudinalSpeed: 0 })
  assert.equal(forward.direction, 1)
  assert.equal(forward.throttle, 1)
  assert.equal(forward.autoBrake, 0)
  assert.equal(forward.reverseInterlock, false)

  const interlocked = resolveDriveRequest({ throttle: -1, longitudinalSpeed: 0.45, reverseSpeedThreshold: 0.08 })
  assert.equal(interlocked.direction, 0)
  assert.equal(interlocked.throttle, 0)
  assert.equal(interlocked.autoBrake, 1)
  assert.equal(interlocked.reverseInterlock, true)

  const slowEnough = resolveDriveRequest({ throttle: -1, longitudinalSpeed: 0.03, reverseSpeedThreshold: 0.08 })
  assert.equal(slowEnough.direction, -1)
  assert.equal(slowEnough.autoBrake, 0)
})

test('fixed-step drive policy brakes immediately on forward-to-reverse request', () => {
  const reversing = stepDriveCommand({
    currentThrottle: 0.8,
    targetThrottle: -1,
    longitudinalSpeed: 0.7,
    dt: 1 / 120,
    reverseSpeedThreshold: 0.08,
  })
  assert.equal(reversing.reversingAgainstMotion, true)
  assert.equal(reversing.command.reverseInterlock, true)
  assert.equal(reversing.command.direction, 0)
  assert.equal(reversing.command.autoBrake, 1)
  assert.ok(reversing.nextThrottle < 0.8 && reversing.nextThrottle >= 0)

  const stopped = stepDriveCommand({
    currentThrottle: 0,
    targetThrottle: -1,
    longitudinalSpeed: 0.03,
    dt: 1 / 120,
    reverseSpeedThreshold: 0.08,
  })
  assert.equal(stopped.reversingAgainstMotion, false)
  assert.equal(stopped.command.autoBrake, 0)
  assert.equal(stopped.command.direction, -1)
  assert.ok(stopped.nextThrottle < 0)
})

test('fixed-step drive policy releases throttle toward zero', () => {
  const released = stepDriveCommand({ currentThrottle: 0.6, targetThrottle: 0, longitudinalSpeed: 0.4, dt: 0.1 })
  assert.ok(released.nextThrottle >= 0)
  assert.ok(released.nextThrottle < 0.6)
  assert.equal(released.command.direction, Math.sign(released.nextThrottle))
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

test('drive layout follows only motors that actually reach wheel shafts', () => {
  const drive = classifyDrivenWheels([
    { id: 'fl', instanceId: 'wheel-fl', axle: 'front' },
    { id: 'fr', instanceId: 'wheel-fr', axle: 'front' },
    { id: 'rl', instanceId: 'wheel-rl', axle: 'rear' },
    { id: 'rr', instanceId: 'wheel-rr', axle: 'rear' },
  ], [
    { id: 'shaft-front', memberIds: ['wheel-fl', 'wheel-fr', 'axle-front'], sourceMotorId: 'drive-motor' },
    { id: 'shaft-rear', memberIds: ['wheel-rl', 'wheel-rr', 'axle-rear'], sourceMotorId: null },
    { id: 'accessory-shaft', memberIds: ['fan'], sourceMotorId: 'accessory-motor' },
  ])

  assert.equal(drive.layout, 'FWD')
  assert.equal(drive.drivenWheelCount, 2)
  assert.deepEqual(drive.motorIds, ['drive-motor'])
  assert.equal(drive.wheels.find(w => w.id === 'rl').driven, false)
})
