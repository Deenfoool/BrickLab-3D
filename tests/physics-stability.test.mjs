import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
const { resetPhysicsClock } = await import('../simulation-time.js')
await RAPIER.init()

const TAU = Math.PI * 2
const rpm = omega => omega * 60 / TAU
const axisX = new THREE.Vector3(1, 0, 0)

function makeRotor(world, massKg = 0.0005) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCanSleep(false))
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.0015, 0.0015, 0.012).setMass(massKg),
    body,
  )
  return body
}

function axisOmega(body) {
  const w = body.angvel()
  return w.x
}

test('inertia-aware gear coupling reduces ratio error without overshooting tiny rotors', () => {
  for (const factor of [1, -1, 3, -3]) {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    const bodyA = makeRotor(world, 0.00035)
    const bodyB = makeRotor(world, 0.00021)
    bodyB.setTranslation({x:1,y:0,z:0},true) // Isolate gear coupling from overlapping-collider contact impulses.
    bodyA.setAngvel({ x: 90, y: 0, z: 0 }, true)
    bodyB.setAngvel({ x: -7, y: 0, z: 0 }, true)
    const coupling = {
      id: `gear:test:${factor}`,
      bodyA,
      bodyB,
      localAxisA: axisX.clone(),
      localAxisB: axisX.clone(),
      factor,
      efficiency: 1,
      maxTorqueA: 100,
      maxTorqueB: 100,
      failed: false,
    }
    const session = Object.create(PhysicsSession.prototype)
    session.quality = { hz: 120 }
    session.gearCouplers = [coupling]
    const dt = 1 / 120
    const before = bodyA.angvel().x * factor - bodyB.angvel().x
    session.applyGearCouplingTorques(dt)
    world.timestep = dt
    world.step()
    const after = bodyA.angvel().x * factor - bodyB.angvel().x

    assert.ok(Number.isFinite(coupling.requestedTorque) && Number.isFinite(coupling.transferTorque))
    assert.ok(Math.abs(after) < Math.abs(before) * 0.02 + 1e-7, JSON.stringify({ factor, before, after }))
    assert.ok(before === 0 || Math.sign(after) === Math.sign(before) || Math.abs(after) < Math.abs(before) * 1e-6, JSON.stringify({factor,before,after}))
    world.free()
  }
})

function wheelSession() {
  localStorage.setItem('bricklab.physics.v2.settings', JSON.stringify({ quality: 'balanced', selfCollision: 'mechanical' }))
  localStorage.setItem('bricklab.physics.v2.surface', 'concrete')
  const wheel = findPart('wheel').create(0xb7c5c3)
  wheel.userData.partId = 'wheel'
  wheel.userData.instanceId = 'stability-wheel'
  wheel.position.set(0, 0.15, 0)
  const session = new PhysicsSession(RAPIER, [wheel], [], 'flat')
  session.build()
  resetPhysicsClock(session, 0)
  return session
}

test('tire force uses one wheel rotation term and cannot impulse past zero longitudinal slip', () => {
  const session = wheelSession()
  assert.ok(session.wheelMonitors.length, 'wheel monitor created')
  const wheel = session.wheelMonitors[0]
  const body = wheel.body
  body.setLinvel({ x: 0, y: 0, z: 0.25 }, true)
  body.setAngvel({ x: 160, y: 0, z: 0 }, true)
  body.resetForces(true)
  body.resetTorques(true)
  const dt = 1 / 120
  session.step(dt) // Populate Rapier broad phase before the first ray query.
  body.setLinvel({ x: 0, y: 0, z: 0.25 }, true)
  body.setAngvel({ x: 160, y: 0, z: 0 }, true)
  session.applyTireForcesV2(dt)

  assert.equal(wheel.contact, true, 'wheel must contact the test ground')
  assert.ok(Number.isFinite(wheel.contactSlipSpeed))
  assert.ok(Number.isFinite(wheel.longitudinalForceN))
  const invMass = body.invMass()
  const mass = invMass > 0 ? 1 / invMass : Infinity
  const longitudinalImpulse = Math.abs(wheel.longitudinalForceN) * dt
  const translationalUpperBound = mass * Math.abs(wheel.contactSlipSpeed)
  assert.ok(longitudinalImpulse <= translationalUpperBound + 1e-7, JSON.stringify({
    impulse: longitudinalImpulse,
    upper: translationalUpperBound,
    slip: wheel.contactSlipSpeed,
    force: wheel.longitudinalForceN,
  }))
  assert.ok(Math.abs(wheel.slipRatio) <= 999)
  session.dispose()
})

const bench = JSON.parse(await readFile(new URL('../examples/powertrain-bench.bricklab', import.meta.url), 'utf8'))
function benchSession(commandRpm = 120) {
  window.__bricklabRequestedTimeScale = 1
  localStorage.setItem('bricklab.physics.v2.settings', JSON.stringify({ quality: 'balanced', selfCollision: 'mechanical' }))
  localStorage.setItem('bricklab.physics.v2.surface', 'concrete')
  const objects = bench.parts.map(part => {
    const object = findPart(part.partId).create(part.color)
    object.userData.partId = part.partId
    object.userData.instanceId = part.instanceId
    object.position.fromArray(part.position)
    object.rotation.fromArray(part.rotation)
    return object
  })
  window.BrickLabControls.resetRuntimeForObjects(objects)
  window.BrickLabControls.updateConfig('bench-motor', {
    motor: { baseRpm: commandRpm, maxRpm: 300, stepRpm: 15, autoStart: true, initialDirection: 1 },
  })
  const session = new PhysicsSession(RAPIER, objects, bench.connections)
  session.build()
  resetPhysicsClock(session, 0)
  return session
}

test('assembled 120 RPM powertrain does not reproduce runaway 287 m/s / 88000 RPM failure', () => {
  const session = benchSession(120)
  assert.equal(session.failedJointCount, 0)
  for (let frame = 1; frame <= 180; frame++) session.step(frame / 60)

  const metrics = session.physicsStabilityMetrics
  assert.ok(metrics && Number.isFinite(metrics.peakLinearSpeed) && Number.isFinite(metrics.peakAngularRpm))
  // Regression bounds are intentionally generous; they are not runtime clamps.
  // They only reject the previously observed explosive 287 m/s / ~88k RPM state.
  assert.ok(metrics.peakLinearSpeed < 20, JSON.stringify(metrics))
  assert.ok(metrics.peakAngularRpm < 10000, JSON.stringify(metrics))
  for (const component of session.components) {
    const values = [
      ...Object.values(component.body.translation()),
      ...Object.values(component.body.linvel()),
      ...Object.values(component.body.angvel()),
    ]
    assert.ok(values.every(Number.isFinite), component.id)
  }
  for (const drive of session.motorDrives) {
    assert.ok(Number.isFinite(drive.actualRpm) && Math.abs(drive.actualRpm) < 2000, JSON.stringify({ actual: drive.actualRpm, target: drive.targetRpm }))
  }
  session.dispose()
})

test('stability layer is installed and exposes diagnostics', () => {
  assert.equal(window.BrickLabPhysicsStability?.version, 'physics-stability-v3')
  assert.equal(window.BrickLabPhysicsStability?.couplingOwner, 'inertia-aware-coupling-v3')
  assert.equal(window.BrickLabPhysicsStability?.tireOwner, 'impulse-limited-tire-v3')
})

await dom.happyDOM.close()
