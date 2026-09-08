import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

if (!globalThis.window) globalThis.window = globalThis
if (!globalThis.document) globalThis.document = { body: { dataset: {} } }

const runtimes = new Map([
  ['drive-motor', { type: 'motor', rpm: 120, direction: 1 }],
  ['accessory-motor', { type: 'motor', rpm: 300, direction: 1 }],
])
const configs = new Map([
  ['drive-motor', { type: 'motor', motor: { baseRpm: 120, maxRpm: 600, initialDirection: 1 } }],
  ['accessory-motor', { type: 'motor', motor: { baseRpm: 300, maxRpm: 900, initialDirection: 1 } }],
])
const writes = []

globalThis.BrickLabControls = {
  getConfig: id => configs.get(id) ?? null,
  getRuntime: id => runtimes.get(id) ?? null,
  setMotorRpm(id, rpm) { writes.push(['rpm', id, rpm]); runtimes.get(id).rpm = rpm },
  setMotorDirection(id, direction) { writes.push(['dir', id, direction]); runtimes.get(id).direction = direction },
}

const { PhysicsSession } = await import('../physics.js')
await import('../vehicle-drive-v2.js')

const rotation = { x: 0, y: 0, z: 0, w: 1 }
function body({ linvel = { x: 0, y: 0, z: 0 } } = {}) {
  return {
    _linvel: { ...linvel },
    rotation: () => rotation,
    linvel() { return this._linvel },
  }
}

function makeSession() {
  const session = Object.create(PhysicsSession.prototype)
  const chassisBody = body()
  const rearLeftBody = body()
  const rearRightBody = body()
  const frontLeftBody = body()
  const frontRightBody = body()
  const axis = new THREE.Vector3(1, 0, 0)

  session.chassisMonitor = { body: chassisBody }
  session.vehicleControlV1 = { brakeInput: 0, manualBrakeInput: 0 }
  session.wheelMonitors = [
    { id: 'fl', object: { userData: { instanceId: 'wheel-fl' } }, axleRole: 'front', body: frontLeftBody, localAxis: axis.clone() },
    { id: 'fr', object: { userData: { instanceId: 'wheel-fr' } }, axleRole: 'front', body: frontRightBody, localAxis: axis.clone() },
    { id: 'rl', object: { userData: { instanceId: 'wheel-rl' } }, axleRole: 'rear', body: rearLeftBody, localAxis: axis.clone() },
    { id: 'rr', object: { userData: { instanceId: 'wheel-rr' } }, axleRole: 'rear', body: rearRightBody, localAxis: axis.clone() },
  ]
  session.drivetrain = {
    shafts: [
      { id: 'front', memberIds: ['wheel-fl', 'wheel-fr'], sourceMotorId: null, ratioFromMotor: null, axisWorld: axis.clone() },
      { id: 'rear', memberIds: ['wheel-rl', 'wheel-rr'], sourceMotorId: 'drive-motor', ratioFromMotor: 1, axisWorld: axis.clone() },
      { id: 'accessory', memberIds: ['fan'], sourceMotorId: 'accessory-motor', ratioFromMotor: 1, axisWorld: axis.clone() },
    ],
  }
  return session
}

test('vehicle drive preserves configured auto-start until W/S takes ownership', () => {
  writes.length = 0
  runtimes.set('drive-motor', { type: 'motor', rpm: 120, direction: 1 })
  runtimes.set('accessory-motor', { type: 'motor', rpm: 300, direction: 1 })
  const session = makeSession()
  globalThis.__bricklabPhysicsSession = session

  session.updateVehicleDriveV2(1 / 120)
  assert.equal(session.vehicleDriveV2.armed, false)
  assert.deepEqual(writes, [])

  globalThis.BrickLabVehicleDrive.setThrottle(1)
  for (let i = 0; i < 20; i += 1) session.updateVehicleDriveV2(1 / 120)
  assert.equal(session.vehicleDriveV2.armed, true)
  assert.ok(runtimes.get('drive-motor').rpm > 0)
  assert.equal(runtimes.get('drive-motor').direction, 1)
  assert.deepEqual(runtimes.get('accessory-motor'), { type: 'motor', rpm: 300, direction: 1 })
  assert.ok(!writes.some(([, id]) => id === 'accessory-motor'))
})

test('reverse request applies service brake before motor direction flips', () => {
  writes.length = 0
  runtimes.set('drive-motor', { type: 'motor', rpm: 120, direction: 1 })
  const session = makeSession()
  globalThis.__bricklabPhysicsSession = session

  globalThis.BrickLabVehicleDrive.setThrottle(1)
  for (let i = 0; i < 30; i += 1) session.updateVehicleDriveV2(1 / 120)

  session.chassisMonitor.body._linvel.z = 0.4
  globalThis.BrickLabVehicleDrive.setThrottle(-1)
  for (let i = 0; i < 80; i += 1) session.updateVehicleDriveV2(1 / 120)
  assert.equal(session.vehicleDriveV2.reverseInterlock, true)
  assert.equal(session.vehicleControlV1.brakeInput, 1)
  assert.equal(runtimes.get('drive-motor').direction, 0)

  session.chassisMonitor.body._linvel.z = 0.02
  session.updateVehicleDriveV2(1 / 120)
  assert.equal(session.vehicleDriveV2.reverseInterlock, false)
  assert.equal(session.vehicleControlV1.brakeInput, 0)
  assert.equal(runtimes.get('drive-motor').direction, -1)
})

test.after(() => { globalThis.__bricklabPhysicsSession = null })
