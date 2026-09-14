import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Window } from 'happy-dom'
import { PHYSICS_UNITS } from '../physical-parts.js'
import { parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { connectorToBrickLabV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { activationForMatchV4 } from '../connectors-v4/activation-v4.js'
import { buildPhysicsPlanV4 } from '../connectors-v4/physics-policy-v4.js'
import {
  installConnectorPhysicsV4,
  PHYSICS_ADAPTER_VERSION_V4,
} from '../connectors-v4/physics-adapter-v4.js'

const dom = new Window()
for (const key of ['window', 'document', 'CustomEvent', 'HTMLElement']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
await RAPIER.init()

const STUD = PHYSICS_UNITS.studMeters
const MASS_KG = 0.002
const DT = 1 / 120

function endpoint(meta, id) {
  const connector = parseShadowTextV4(`0 !LDCAD ${meta}`).operations[0].connector
  connector.endpointId = id
  return connectorToBrickLabV4(connector)
}

function object(instanceId, partId, yStud = 0) {
  const value = new THREE.Group()
  value.userData = { instanceId, partId }
  value.position.y = yStud
  value.updateMatrixWorld(true)
  return value
}

function createMember(world, value) {
  value.updateMatrixWorld(true)
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  value.matrixWorld.decompose(position, rotation, scale)

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x * STUD, position.y * STUD, position.z * STUD)
      .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w }),
  )
  world.createCollider(RAPIER.ColliderDesc.ball(0.0001).setMass(MASS_KG), body)

  const matrix = value.matrixWorld.clone()
  const component = {
    body,
    massKg: MASS_KG,
    bodyWorldMatrix: matrix,
    bodyWorldInverse: matrix.clone().invert(),
    bodyWorldRotation: rotation.clone(),
    bodyWorldRotationInverse: rotation.clone().invert(),
  }
  return { object: value, body, member: { body, component } }
}

function runtimeFor() {
  return {
    worldFrame(value, connector) {
      const position = new THREE.Vector3(...connector.frame.positionStud).applyMatrix4(value.matrixWorld)
      const orientation = new THREE.Matrix3().fromArray(connector.frame.orientationBrickLab)
      const axis = new THREE.Vector3(0, -1, 0).applyMatrix3(orientation).transformDirection(value.matrixWorld)
      const reference = new THREE.Vector3(1, 0, 0).applyMatrix3(orientation).transformDirection(value.matrixWorld)
      return { position, axis, reference }
    },
  }
}

function connection(id, pin, beam, male, female, family, match) {
  return {
    schemaVersion: 4,
    graphVersion: 'connection-graph-v4.0.1',
    id,
    a: { instanceId: pin.userData.instanceId, partId: pin.userData.partId, endpointId: male.endpointId },
    b: { instanceId: beam.userData.instanceId, partId: beam.userData.partId, endpointId: female.endpointId },
    activation: { family },
    metadata: { activation: { family } },
    match,
  }
}

function velocity(body) {
  const v = body.linvel()
  return new THREE.Vector3(v.x, v.y, v.z)
}

function translationalEnergy(entries) {
  return entries.reduce((sum, entry) => sum + 0.5 * MASS_KG * velocity(entry.body).lengthSq(), 0)
}

function relativeAxialSpeed(a, b) {
  return Math.abs(velocity(b).y - velocity(a).y)
}

test('3749 axle-pin between two 32140 receivers cannot gain energy from V4 axial resistance', () => {
  // Official LDCad Shadow profiles used by the reported reproduction:
  // 3749.dat — Technic Axle Pin; 32140.dat uses connhole.dat receivers.
  const male = endpoint(
    'SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2 R 6 16 R 8 2 A 6 20] [center=true] [slide=true]',
    '3749-axle-pin',
  )
  const female = endpoint(
    'SNAP_CYL [gender=F] [caps=none] [secs=R 8 2 R 6 16 R 8 2] [center=true] [slide=true]',
    '32140-connhole',
  )

  const match = matchConnectorV4(male, female)
  assert.equal(match.compatible, true)
  const activation = activationForMatchV4(male, female, match)
  assert.equal(activation.family, 'technic-pin-hole')

  const pin = object('pin-3749', 'ldraw-3749', 0)
  // The 40-LDU centered male spans two 20-LDU receivers at +/-10 LDU offsets.
  const beamTop = object('beam-32140-top', 'ldraw-32140', 0.5)
  const beamBottom = object('beam-32140-bottom', 'ldraw-32140', -0.5)

  const records = [
    connection('3749-to-top', pin, beamTop, male, female, activation.family, match),
    connection('3749-to-bottom', pin, beamBottom, male, female, activation.family, match),
  ]
  const connectors = new Map([
    [`${pin.userData.partId}:${male.endpointId}`, male],
    [`${beamTop.userData.partId}:${female.endpointId}`, female],
  ])
  const objects = [pin, beamTop, beamBottom]
  const plan = buildPhysicsPlanV4({
    objects,
    connections: records,
    getConnector: (partId, endpointId) => connectors.get(`${partId}:${endpointId}`),
  })
  assert.equal(plan.pass, true)
  assert.equal(plan.joints.length, 2)
  assert.ok(plan.joints.every(item => item.rule.kind === 'cylindrical'))
  assert.ok(plan.joints.every(item => item.rule.resistance?.axialDamping === 2.4))

  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  const entries = objects.map(value => createMember(world, value))
  const byId = new Map(entries.map(entry => [entry.object.userData.instanceId, entry]))
  const session = {
    RAPIER,
    world,
    members: new Map(entries.map(entry => [entry.object.userData.instanceId, entry.member])),
    simulationTime: 0,
    applyMotorTorques() {},
    syncObjects() {},
    dispose() { world.free?.() },
  }

  const state = installConnectorPhysicsV4(session, plan, runtimeFor())
  assert.equal(PHYSICS_ADAPTER_VERSION_V4, 'connector-rapier-adapter-v4.4.0')
  assert.equal(state.active, 2)
  assert.equal(state.resistance.mode, 'effective-mass-bounded-impulse')
  assert.ok(state.resistance.maxCancellationFraction < 1)

  // This is the old explicit-force integrator's relative-velocity multiplier for
  // two 2 g bodies. |gain| >> 1 proves why tiny solver noise could become a launch.
  const oldGain = 1 - 2.4 * DT * (1 / MASS_KG + 1 / MASS_KG)
  assert.equal(oldGain, -19)

  const pinBody = byId.get(pin.userData.instanceId).body
  const topBody = byId.get(beamTop.userData.instanceId).body
  const bottomBody = byId.get(beamBottom.userData.instanceId).body
  pinBody.setLinvel({ x: 0, y: 0, z: 0 }, true)
  topBody.setLinvel({ x: 0, y: 0.01, z: 0 }, true)
  bottomBody.setLinvel({ x: 0, y: -0.01, z: 0 }, true)

  const initialEnergy = translationalEnergy(entries)
  const initialTopRelative = relativeAxialSpeed(pinBody, topBody)
  const initialBottomRelative = relativeAxialSpeed(pinBody, bottomBody)

  for (let step = 0; step < 60; step += 1) {
    const beforeResistance = translationalEnergy(entries)
    session.applyMotorTorques(DT)
    const afterResistance = translationalEnergy(entries)
    assert.ok(
      afterResistance <= beforeResistance + 1e-12,
      `resistance added energy at step ${step}: ${beforeResistance} -> ${afterResistance}`,
    )

    world.timestep = DT
    world.step()
    for (const entry of entries) {
      const v = velocity(entry.body)
      assert.ok([v.x, v.y, v.z].every(Number.isFinite), `non-finite velocity at step ${step}`)
      assert.ok(v.length() < 0.02, `launch velocity ${v.length()} m/s at step ${step}`)
    }
  }

  assert.ok(translationalEnergy(entries) <= initialEnergy + 1e-12)
  assert.ok(relativeAxialSpeed(pinBody, topBody) < initialTopRelative)
  assert.ok(relativeAxialSpeed(pinBody, bottomBody) < initialBottomRelative)
  assert.equal(state.released, 0)
  session.dispose()
})

await dom.happyDOM.close()
