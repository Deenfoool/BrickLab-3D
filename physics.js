import { stepPhysicsSession, STEP_OWNER } from './simulation-time.js'
import * as THREE from 'three'
import { findPart } from './parts.js'
import {
  analyzeDrivetrain,
  isRigidAxleConnection,
  motorConnectionInfo,
} from './drivetrain.js'

const RAPIER_CDN = 'https://cdn.skypack.dev/@dimforge/rapier3d-compat@0.20.0'
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const TWO_PI = Math.PI * 2
const DEFAULT_STALL_TORQUE = 5.5
let rapierPromise = null

async function loadRapier() {
  if (!rapierPromise) {
    rapierPromise = import(RAPIER_CDN).then(async module => {
      const RAPIER = module.default ?? module
      await RAPIER.init()
      return RAPIER
    })
  }
  return rapierPromise
}

function vector3(value) {
  return { x: value.x, y: value.y, z: value.z }
}

function quaternion(value) {
  return { x: value.x, y: value.y, z: value.z, w: value.w }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function rpmToRadians(rpm) {
  return rpm * TWO_PI / 60
}

function radiansToRpm(radians) {
  return radians * 60 / TWO_PI
}

function bodyRotation(body) {
  const rotation = body.rotation()
  return new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
}

function bodyAngularVelocity(body) {
  const value = body.angvel()
  return new THREE.Vector3(value.x, value.y, value.z)
}

function localBounds(object) {
  const clone = object.clone(true)
  clone.position.set(0, 0, 0)
  clone.quaternion.identity()
  clone.scale.set(1, 1, 1)
  clone.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(clone)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  size.x = Math.max(size.x, 0.12)
  size.y = Math.max(size.y, 0.12)
  size.z = Math.max(size.z, 0.12)
  return { size, center }
}

function connectorFor(object, connectorId) {
  return findPart(object?.userData.partId)?.connectors?.find(connector => connector.id === connectorId) ?? null
}

function localColliderSpecs(object) {
  const definition = findPart(object?.userData.partId)
  const wheel = definition?.mechanics?.wheel
  if (wheel) {
    return [{
      shape: 'cylinder',
      halfHeight: 0.34,
      radius: wheel.radius,
      center: new THREE.Vector3(0, 1.15, 0),
      rotation: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)),
      friction: 1.45,
    }]
  }

  const gear = definition?.mechanics?.gear
  if (gear) {
    return [{
      shape: 'cylinder',
      halfHeight: 0.18,
      radius: (gear.pitchRadius ?? gear.teeth / 16) * 0.68,
      center: new THREE.Vector3(0, 0.4, 0),
      rotation: new THREE.Quaternion(),
      friction: 0.35,
    }]
  }

  const { size, center } = localBounds(object)
  return [{ shape: 'cuboid', size, center, rotation: new THREE.Quaternion(), friction: 0.9 }]
}

function createColliderDescriptor(RAPIER, spec, relativeMatrix, relativeRotation, relativeScale) {
  const center = spec.center.clone().applyMatrix4(relativeMatrix)
  const rotation = relativeRotation.clone().multiply(spec.rotation)
  let collider

  if (spec.shape === 'cylinder') {
    const radialScale = Math.max(Math.abs(relativeScale.x), Math.abs(relativeScale.z))
    collider = RAPIER.ColliderDesc.cylinder(
      spec.halfHeight * Math.abs(relativeScale.y),
      spec.radius * radialScale,
    )
  } else {
    collider = RAPIER.ColliderDesc.cuboid(
      spec.size.x * Math.abs(relativeScale.x) / 2,
      spec.size.y * Math.abs(relativeScale.y) / 2,
      spec.size.z * Math.abs(relativeScale.z) / 2,
    )
  }

  return collider
    .setTranslation(center.x, center.y, center.z)
    .setRotation(quaternion(rotation))
    .setFriction(spec.friction ?? 0.9)
    .setRestitution(0.02)
    .setDensity(0.7)
}

function buildRigidComponents(objects, connections) {
  const byId = new Map(objects.map(object => [object.userData.instanceId, object]))
  const parent = new Map([...byId.keys()].map(id => [id, id]))

  const find = id => {
    let root = parent.get(id)
    if (!root) return null
    while (root !== parent.get(root)) root = parent.get(root)
    let cursor = id
    while (cursor !== root) {
      const next = parent.get(cursor)
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }

  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (!rootA || !rootB || rootA === rootB) return
    parent.set(rootB, rootA)
  }

  for (const connection of connections) {
    const rigid = connection.kind === 'fixed' || isRigidAxleConnection(connection, byId)
    if (!rigid) continue
    if (!byId.has(connection.a.instanceId) || !byId.has(connection.b.instanceId)) continue
    union(connection.a.instanceId, connection.b.instanceId)
  }

  const groups = new Map()
  for (const object of objects) {
    const root = find(object.userData.instanceId)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(object)
  }
  return [...groups.values()]
}

function matrixPose(matrix) {
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  matrix.decompose(position, rotation, scale)
  return { position, rotation, scale }
}

function structuralScore(component) {
  let score = 0
  for (const member of component.members) {
    const mechanics = findPart(member.object.userData.partId)?.mechanics
    if (mechanics?.wheel || mechanics?.gear || mechanics?.shaft) continue
    score += mechanics?.motor ? 2 : 1
  }
  return score
}

export class PhysicsSession {
  static async create(objects, connections) {
    const RAPIER = await loadRapier()
    const scenario = window.__bricklabNextScenario || 'flat'
    window.__bricklabNextScenario = null
    const session = new PhysicsSession(RAPIER, objects, connections, scenario)
    session.build()
    return session
  }

  constructor(RAPIER, objects, connections, scenario = 'flat') {
    this.RAPIER = RAPIER
    this.objects = objects
    this.connections = connections
    this.scenario = scenario
    this.isTestSession = scenario !== 'flat' || Boolean(document.body.dataset.bricklabTest)
    this.world = null
    this.members = new Map()
    this.components = []
    this.running = true
    this.jointCount = 0
    this.failedJointCount = 0
    this.internalJointCount = 0
    this.motorCount = 0
    this.bearingCount = 0
    this.drivetrain = null
    this.motorDrives = []
    this.gearCouplers = []
    this.shaftMonitors = []
    this.wheelMonitors = []
    this.chassisMonitor = null
    this.scenarioVisualRoot = null
    this.scenarioData = null
    this.telemetryTick = 0
    this.simulationTime = 0
    this.lastVehicleSpeed = 0
    this.stallTimer = 0
    this.testStatus = 'RUNNING'
  }

  build() {
    const RAPIER = this.RAPIER
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.world.timestep = 1 / 60

    const ground = RAPIER.ColliderDesc.cuboid(40, 0.12, 40)
      .setTranslation(0, -0.12, 0)
      .setFriction(1.15)
      .setRestitution(0.01)
    this.world.createCollider(ground)
    this.buildScenario()

    const groups = buildRigidComponents(this.objects, this.connections)
    for (const objects of groups) this.createCompoundBody(objects)

    for (const connection of this.connections) {
      if (connection.kind === 'fixed') continue
      if (isRigidAxleConnection(connection, this.objects)) continue
      this.createJoint(connection)
    }

    this.drivetrain = analyzeDrivetrain(this.objects, this.connections)
    this.buildGearCouplers()
    this.buildShaftMonitors()
    this.buildWheelMonitors()
    this.buildChassisMonitor()
    this.mountTelemetry()
  }

  buildScenario() {
    if (this.scenario !== 'hill-climb') return

    const angle = THREE.MathUtils.degToRad(22)
    const length = 18
    const width = 8
    const thickness = 0.5
    const startZ = 3
    const centerZ = startZ + Math.cos(angle) * length / 2
    const centerY = thickness / 2 + Math.sin(angle) * length / 2
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-angle, 0, 0))

    const collider = this.RAPIER.ColliderDesc.cuboid(width / 2, thickness / 2, length / 2)
      .setTranslation(0, centerY, centerZ)
      .setRotation(quaternion(rotation))
      .setFriction(1.35)
      .setRestitution(0)
    this.world.createCollider(collider)

    this.scenarioData = {
      name: 'Hill Climb 22°',
      angle,
      length,
      startZ,
      finishZ: startZ + Math.cos(angle) * length * 0.9,
      height: Math.sin(angle) * length,
    }

    const scene = this.objects[0]?.parent?.parent
    if (!scene?.add) return

    const root = new THREE.Group()
    root.name = 'BrickLab Hill Climb'
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(width, thickness, length),
      new THREE.MeshStandardMaterial({ color: 0x3c4349, roughness: 0.94 }),
    )
    ramp.position.set(0, centerY, centerZ)
    ramp.quaternion.copy(rotation)
    ramp.receiveShadow = true
    root.add(ramp)

    const finishMaterial = new THREE.MeshStandardMaterial({ color: 0x74e6a6, roughness: 0.55 })
    const finishY = Math.sin(angle) * length * 0.9 + 0.5
    const finishZ = this.scenarioData.finishZ
    for (const x of [-width / 2 + 0.3, width / 2 - 0.3]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), finishMaterial)
      post.position.set(x, finishY + 1.2, finishZ)
      root.add(post)
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width - 0.5, 0.12, 0.12), finishMaterial)
    bar.position.set(0, finishY + 2.45, finishZ)
    root.add(bar)

    scene.add(root)
    this.scenarioVisualRoot = root
  }

  createCompoundBody(objects) {
    const rootObject = objects[0]
    if (!rootObject) return

    for (const object of objects) object.updateWorldMatrix(true, false)
    rootObject.updateWorldMatrix(true, false)

    const bodyWorldMatrix = rootObject.matrixWorld.clone()
    const bodyWorldInverse = bodyWorldMatrix.clone().invert()
    const { position: bodyPosition, rotation: bodyRotation } = matrixPose(bodyWorldMatrix)

    const bodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(bodyPosition.x, bodyPosition.y, bodyPosition.z)
      .setRotation(quaternion(bodyRotation))
      .setCanSleep(false)
    const body = this.world.createRigidBody(bodyDesc)

    const component = {
      id: rootObject.userData.instanceId,
      body,
      bodyWorldMatrix,
      bodyWorldInverse,
      bodyWorldRotation: bodyRotation.clone(),
      members: [],
    }

    for (const object of objects) {
      const relativeMatrix = bodyWorldInverse.clone().multiply(object.matrixWorld)
      const { rotation: relativeRotation, scale: relativeScale } = matrixPose(relativeMatrix)
      for (const spec of localColliderSpecs(object)) {
        this.world.createCollider(
          createColliderDescriptor(this.RAPIER, spec, relativeMatrix, relativeRotation, relativeScale),
          body,
        )
      }

      const member = { object, body, component, relativeMatrix }
      component.members.push(member)
      this.members.set(object.userData.instanceId, member)
    }
    this.components.push(component)
  }

  bodyLocalPoint(member, connector) {
    return new THREE.Vector3(...connector.position)
      .applyMatrix4(member.object.matrixWorld)
      .applyMatrix4(member.component.bodyWorldInverse)
  }

  bodyLocalAxis(member, connector) {
    const objectWorldRotation = member.object.getWorldQuaternion(new THREE.Quaternion())
    return new THREE.Vector3(...connector.axis)
      .normalize()
      .applyQuaternion(objectWorldRotation)
      .applyQuaternion(member.component.bodyWorldRotation.clone().invert())
      .normalize()
  }

  revoluteJointData(memberA, memberB, anchorA, anchorB, axisA) {
    // Rapier's three-argument revolute interprets its axis in BOTH body frames.
    // Connector-local X on an axle can be world-aligned with local Z on a brick.
    // Express one physical axis independently in each rigid body's local frame.
    const axisB = axisA.clone()
      .applyQuaternion(new THREE.Quaternion().copy(memberA.body.rotation()))
      .applyQuaternion(new THREE.Quaternion().copy(memberB.body.rotation()).invert())
      .normalize()
    return this.RAPIER.JointData.revoluteWithAxes(
      vector3(anchorA), vector3(anchorB), vector3(axisA), vector3(axisB),
    )
  }

  createJoint(connection) {
    const memberA = this.members.get(connection.a.instanceId)
    const memberB = this.members.get(connection.b.instanceId)
    if (!memberA || !memberB) return
    if (memberA.body === memberB.body) {
      this.internalJointCount += 1
      return
    }

    const connectorA = connectorFor(memberA.object, connection.a.connectorId)
    const connectorB = connectorFor(memberB.object, connection.b.connectorId)
    if (!connectorA || !connectorB) return

    try {
      const anchorA = this.bodyLocalPoint(memberA, connectorA)
      const anchorB = this.bodyLocalPoint(memberB, connectorB)
      const axisA = this.bodyLocalAxis(memberA, connectorA)
      let params = null

      if (connection.kind === 'hinge' || connection.kind === 'bearing') {
        params = this.revoluteJointData(memberA, memberB, anchorA, anchorB, axisA)
      } else if (connection.kind === 'axle' && motorConnectionInfo(connection, this.objects)) {
        params = this.revoluteJointData(memberA, memberB, anchorA, anchorB, axisA)
      }
      if (!params) return

      const joint = this.world.createImpulseJoint(params, memberA.body, memberB.body, true)
      joint.setContactsEnabled?.(false)

      if (connection.kind === 'bearing') this.bearingCount += 1
      if (connection.kind === 'axle') this.registerMotorDrive(connection, memberA, memberB, connectorA, connectorB, axisA)
      this.jointCount += 1
    } catch (error) {
      this.failedJointCount += 1
      console.warn('BrickLab could not create physics joint', connection, error)
    }
  }

  registerMotorDrive(connection, memberA, memberB, connectorA, connectorB, axisA) {
    const info = motorConnectionInfo(connection, this.objects)
    if (!info) return

    const motorIsA = info.motorObject.userData.instanceId === memberA.object.userData.instanceId
    const motorMember = motorIsA ? memberA : memberB
    const motorConnector = motorIsA ? connectorA : connectorB
    const motor = findPart(motorMember.object.userData.partId)?.mechanics?.motor ?? {}

    const jointAxisWorld = axisA.clone().applyQuaternion(memberA.component.bodyWorldRotation).normalize()
    const motorObjectRotation = motorMember.object.getWorldQuaternion(new THREE.Quaternion())
    const motorAxisWorld = new THREE.Vector3(...motorConnector.axis).normalize().applyQuaternion(motorObjectRotation)
    const axisSign = jointAxisWorld.dot(motorAxisWorld) >= 0 ? 1 : -1
    const sideSign = motorIsA ? 1 : -1
    const nominalRpm = motor.rpm ?? 120
    const targetRpm = nominalRpm * (motor.direction ?? 1) * axisSign * sideSign

    this.motorDrives.push({
      id: info.motorObject.userData.instanceId,
      name: findPart(info.motorObject.userData.partId)?.name ?? 'Motor',
      bodyA: memberA.body,
      bodyB: memberB.body,
      localAxisA: axisA.clone(),
      targetRpm,
      nominalRpm,
      stallTorque: motor.stallTorque ?? DEFAULT_STALL_TORQUE,
      freeCurrent: motor.freeCurrent ?? 0.15,
      stallCurrent: motor.stallCurrent ?? 2.2,
      actualRpm: 0,
      load: 0,
      torque: 0,
      current: motor.freeCurrent ?? 0.15,
      stalled: false,
      stallTime: 0,
    })
    this.motorCount += 1
  }

  buildGearCouplers() {
    this.gearCouplers = []
    if (!this.drivetrain) return
    const shaftMap = new Map(this.drivetrain.shafts.map(shaft => [shaft.id, shaft]))

    for (const mesh of this.drivetrain.gearMeshes) {
      const memberA = this.members.get(mesh.a.instanceId)
      const memberB = this.members.get(mesh.b.instanceId)
      if (!memberA || !memberB || memberA.body === memberB.body) continue

      const shaftA = shaftMap.get(mesh.shaftA)
      const shaftB = shaftMap.get(mesh.shaftB)
      if (!shaftA || !shaftB) continue

      const localAxisA = shaftA.axisWorld.clone()
        .applyQuaternion(memberA.component.bodyWorldRotation.clone().invert()).normalize()
      const localAxisB = shaftB.axisWorld.clone()
        .applyQuaternion(memberB.component.bodyWorldRotation.clone().invert()).normalize()

      this.gearCouplers.push({
        id: mesh.id,
        bodyA: memberA.body,
        bodyB: memberB.body,
        localAxisA,
        localAxisB,
        factor: mesh.ratioAB,
        maxTorqueA: shaftA.torqueCapacity ?? 4,
        maxTorqueB: shaftB.torqueCapacity ?? 4,
        efficiency: mesh.efficiency ?? 0.92,
        errorRpm: 0,
        transferTorque: 0,
      })
    }
  }

  buildShaftMonitors() {
    this.shaftMonitors = []
    if (!this.drivetrain) return

    for (const shaft of this.drivetrain.shafts) {
      if (shaft.rpm == null) continue
      const member = shaft.memberIds.map(id => this.members.get(id)).find(Boolean)
      if (!member) continue
      const localAxis = shaft.axisWorld.clone()
        .applyQuaternion(member.component.bodyWorldRotation.clone().invert()).normalize()

      this.shaftMonitors.push({
        shaftId: shaft.id,
        body: member.body,
        localAxis,
        targetRpm: shaft.rpm,
        ratioFromMotor: shaft.ratioFromMotor,
        torqueCapacity: shaft.torqueCapacity,
        efficiency: shaft.efficiency,
      })
    }
  }

  buildWheelMonitors() {
    this.wheelMonitors = []
    if (!this.drivetrain) return
    let index = 1

    for (const object of this.objects) {
      const definition = findPart(object.userData.partId)
      const wheel = definition?.mechanics?.wheel
      if (!wheel) continue
      const shaft = this.drivetrain.shaftByPart.get(object.userData.instanceId)
      const member = this.members.get(object.userData.instanceId)
      if (!shaft || !member) continue

      const localAxis = shaft.axisWorld.clone()
        .applyQuaternion(member.component.bodyWorldRotation.clone().invert()).normalize()
      this.wheelMonitors.push({
        id: `wheel-${index++}`,
        name: definition.name,
        body: member.body,
        localAxis,
        radius: wheel.radius,
        groundSpeed: 0,
        rimSpeed: 0,
        slipPercent: 0,
      })
    }
  }

  buildChassisMonitor() {
    if (!this.components.length) return
    const component = [...this.components].sort((a, b) => structuralScore(b) - structuralScore(a))[0]
    const position = component.body.translation()
    this.chassisMonitor = {
      body: component.body,
      startPosition: new THREE.Vector3(position.x, position.y, position.z),
      speed: 0,
      acceleration: 0,
      progress: 0,
      altitude: 0,
    }
  }

  resetCustomTorques() {
    for (const component of this.components) component.body.resetTorques?.(true)
  }

  relativeMotorRpm(drive) {
    const axisWorld = drive.localAxisA.clone().applyQuaternion(bodyRotation(drive.bodyA)).normalize()
    const relative = bodyAngularVelocity(drive.bodyB).sub(bodyAngularVelocity(drive.bodyA))
    return radiansToRpm(relative.dot(axisWorld))
  }

  applyMotorTorques(dt) {
    for (const drive of this.motorDrives) {
      const actualRpm = this.relativeMotorRpm(drive)
      const targetOmega = rpmToRadians(drive.targetRpm)
      const actualOmega = rpmToRadians(actualRpm)
      const error = targetOmega - actualOmega
      const normalizedError = targetOmega === 0 ? 0 : clamp(Math.abs(error) / Math.abs(targetOmega), 0, 1)
      const torqueMagnitude = drive.stallTorque * normalizedError
      const torqueSign = Math.sign(error || targetOmega || 1)
      const axisWorld = drive.localAxisA.clone().applyQuaternion(bodyRotation(drive.bodyA)).normalize()
      const torqueVector = axisWorld.multiplyScalar(torqueMagnitude * torqueSign)

      drive.bodyB.addTorque(vector3(torqueVector), true)
      drive.bodyA.addTorque(vector3(torqueVector.clone().multiplyScalar(-1)), true)

      drive.actualRpm = actualRpm
      drive.torque = torqueMagnitude
      drive.load = drive.stallTorque > 0 ? clamp(torqueMagnitude / drive.stallTorque, 0, 1) : 0
      drive.current = drive.freeCurrent + (drive.stallCurrent - drive.freeCurrent) * drive.load

      const lowSpeed = Math.abs(drive.targetRpm) > 10 && Math.abs(actualRpm) < Math.abs(drive.targetRpm) * 0.12
      drive.stallTime = lowSpeed && drive.load > 0.82 ? drive.stallTime + dt : 0
      drive.stalled = drive.stallTime > 0.65
    }
  }

  applyGearCouplingTorques() {
    for (const coupling of this.gearCouplers) {
      const axisA = coupling.localAxisA.clone().applyQuaternion(bodyRotation(coupling.bodyA)).normalize()
      const axisB = coupling.localAxisB.clone().applyQuaternion(bodyRotation(coupling.bodyB)).normalize()
      const omegaA = bodyAngularVelocity(coupling.bodyA).dot(axisA)
      const omegaB = bodyAngularVelocity(coupling.bodyB).dot(axisB)
      const desiredB = omegaA * coupling.factor
      const error = desiredB - omegaB
      const maxTorqueB = Math.max(0.4, coupling.maxTorqueB)
      const torqueB = clamp(error * 1.6, -maxTorqueB, maxTorqueB)
      const torqueA = -torqueB * coupling.factor / Math.max(coupling.efficiency, 0.1)

      coupling.bodyB.addTorque(vector3(axisB.multiplyScalar(torqueB)), true)
      coupling.bodyA.addTorque(vector3(axisA.multiplyScalar(clamp(torqueA, -coupling.maxTorqueA, coupling.maxTorqueA))), true)
      coupling.errorRpm = radiansToRpm(error)
      coupling.transferTorque = Math.abs(torqueB)
    }
  }

  updateVehicleMetrics(dt) {
    if (!this.chassisMonitor) return
    const velocity = this.chassisMonitor.body.linvel()
    const speed = Math.hypot(velocity.x, velocity.z)
    this.chassisMonitor.acceleration = (speed - this.lastVehicleSpeed) / Math.max(dt, 0.001)
    this.chassisMonitor.speed = speed
    this.lastVehicleSpeed = speed

    const position = this.chassisMonitor.body.translation()
    this.chassisMonitor.altitude = position.y - this.chassisMonitor.startPosition.y

    if (this.scenarioData) {
      const distance = position.z - this.chassisMonitor.startPosition.z
      const target = Math.max(1, this.scenarioData.finishZ - this.chassisMonitor.startPosition.z)
      this.chassisMonitor.progress = clamp(distance / target, 0, 1)

      if (this.chassisMonitor.progress >= 0.94) {
        this.testStatus = 'PASSED'
      } else {
        const maxLoad = Math.max(0, ...this.motorDrives.map(drive => drive.load))
        const stalled = this.simulationTime > 2 && speed < 0.08 && maxLoad > 0.8
        this.stallTimer = stalled ? this.stallTimer + dt : 0
        if (this.stallTimer > 2) this.testStatus = 'STALLED'
        else if (this.testStatus !== 'PASSED') this.testStatus = 'RUNNING'
      }
    }
  }

  mountTelemetry() {
    document.getElementById('drivetrainTelemetry')?.remove()
    if (!document.querySelector('link[data-bricklab-drivetrain]')) {
      const stylesheet = document.createElement('link')
      stylesheet.rel = 'stylesheet'
      stylesheet.href = './drivetrain.css'
      stylesheet.dataset.bricklabDrivetrain = 'true'
      document.head.append(stylesheet)
    }

    const host = document.querySelector('.viewport-wrap')
    if (!host || !this.drivetrain) return
    const panel = document.createElement('div')
    panel.id = 'drivetrainTelemetry'
    panel.className = 'drivetrain-telemetry'

    const motorRows = this.motorDrives.map(drive => `
      <div class="telemetry-motor" data-motor-id="${drive.id}">
        <span>${drive.name}</span><b data-motor-rpm>0 RPM</b><small data-motor-load>0%</small><em data-motor-torque>0.0 T</em>
      </div>
    `).join('')

    const shaftRows = this.drivetrain.shafts.filter(shaft => shaft.rpm != null).slice(0, 8).map(shaft => {
      const rpm = Math.round(shaft.rpm)
      const ratio = shaft.ratioFromMotor == null ? '—' : `${shaft.ratioFromMotor >= 0 ? '+' : ''}${shaft.ratioFromMotor.toFixed(2)}×`
      const torque = shaft.torqueCapacity == null ? '—' : `${shaft.torqueCapacity.toFixed(1)}T`
      return `<div class="telemetry-row" data-shaft-id="${shaft.id}"><span>${shaft.id}</span><b>${rpm >= 0 ? '+' : ''}${rpm}</b><small data-actual-rpm>0</small><em>${ratio}</em><i>${torque}</i></div>`
    }).join('')

    const gearRows = this.drivetrain.gearMeshes.slice(0, 5).map(mesh => `
      <div class="telemetry-gear"><span>${mesh.a.teeth}T</span><i data-lucide="move-right"></i><span>${mesh.b.teeth}T</span><b>${Math.abs(mesh.ratioAB).toFixed(2)}:1</b></div>
    `).join('')

    const wheelRows = this.wheelMonitors.slice(0, 6).map(wheel => `
      <div class="telemetry-wheel" data-wheel-id="${wheel.id}"><span>${wheel.name}</span><b data-wheel-speed>0.00 u/s</b><small data-wheel-slip>0%</small></div>
    `).join('')

    const scenarioBlock = this.scenarioData ? `
      <div class="telemetry-test" data-test-status="RUNNING">
        <div><span>${this.scenarioData.name}</span><b data-test-status-text>RUNNING</b></div>
        <div class="test-progress"><i data-test-progress></i></div>
        <small><span data-test-percent>0%</span><span data-test-altitude>+0.00 u</span></small>
      </div>
    ` : ''

    panel.innerHTML = `
      <div class="telemetry-head"><div><small>${this.scenarioData ? 'TEST LAB' : 'DRIVETRAIN'}</small><strong>${this.scenarioData?.name ?? 'Live mechanics'}</strong></div><i data-lucide="gauge"></i></div>
      ${scenarioBlock}
      <div class="telemetry-vehicle"><span>BODY SPEED <b data-body-speed>0.00 u/s</b></span><span>ACCEL <b data-body-accel>0.00 u/s²</b></span></div>
      <div class="telemetry-summary"><span><b>${this.drivetrain.stats.motors}</b> motors</span><span><b>${this.drivetrain.stats.drivenShafts}</b> shafts</span><span><b>${this.drivetrain.stats.gearMeshes}</b> meshes</span></div>
      <div class="telemetry-section"><label>MOTORS · RPM · LOAD · TORQUE</label>${motorRows || '<div class="telemetry-empty">Connect a Lab Motor to a shaft to measure load and stall.</div>'}</div>
      <div class="telemetry-section"><label>SHAFT · TARGET · ACTUAL · RATIO · TORQUE</label>${shaftRows || '<div class="telemetry-empty">No powered shaft.</div>'}</div>
      <div class="telemetry-section"><label>GEARS</label>${gearRows || '<div class="telemetry-empty">Place compatible gears at pitch distance to mesh them.</div>'}</div>
      <div class="telemetry-section"><label>WHEELS · GROUND SPEED · SLIP</label>${wheelRows || '<div class="telemetry-empty">Add an Off-road Wheel to measure rolling speed and slip.</div>'}</div>
      ${this.drivetrain.conflicts.length ? `<div class="telemetry-warning">${this.drivetrain.conflicts.length} drivetrain conflict${this.drivetrain.conflicts.length === 1 ? '' : 's'} detected</div>` : ''}
    `

    host.append(panel)
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
    this.updateTelemetryReadings(true)
  }

  updateTelemetryReadings(force = false) {
    this.telemetryTick += 1
    if (!force && this.telemetryTick % 6 !== 0) return

    for (const drive of this.motorDrives) {
      const row = document.querySelector(`[data-motor-id="${drive.id}"]`)
      const rpm = row?.querySelector('[data-motor-rpm]')
      const load = row?.querySelector('[data-motor-load]')
      const torque = row?.querySelector('[data-motor-torque]')
      if (!rpm || !load || !torque) continue
      rpm.textContent = `${drive.actualRpm >= 0 ? '+' : ''}${Math.round(drive.actualRpm)} RPM`
      load.textContent = drive.stalled ? 'STALL' : `${Math.round(drive.load * 100)}%`
      torque.textContent = `${drive.torque.toFixed(1)} T`
      row.classList.toggle('stalled', drive.stalled)
      row.title = `${drive.current.toFixed(2)} A estimated · ${drive.stallTorque.toFixed(1)} stall torque`
    }

    for (const monitor of this.shaftMonitors) {
      const angularVelocity = bodyAngularVelocity(monitor.body)
      const worldAxis = monitor.localAxis.clone().applyQuaternion(bodyRotation(monitor.body)).normalize()
      const actualRpm = radiansToRpm(angularVelocity.dot(worldAxis))
      const row = document.querySelector(`[data-shaft-id="${monitor.shaftId}"]`)
      const actual = row?.querySelector('[data-actual-rpm]')
      if (!actual) continue
      actual.textContent = `${actualRpm >= 0 ? '+' : ''}${Math.round(actualRpm)}`
      const tolerance = Math.max(5, Math.abs(monitor.targetRpm) * 0.15)
      actual.classList.toggle('off-target', Math.abs(actualRpm - monitor.targetRpm) > tolerance)
      actual.title = `Actual ${actualRpm.toFixed(1)} RPM · target ${monitor.targetRpm.toFixed(1)} RPM`
    }

    for (const wheel of this.wheelMonitors) {
      const angularVelocity = bodyAngularVelocity(wheel.body)
      const linearVelocity = wheel.body.linvel()
      const worldAxis = wheel.localAxis.clone().applyQuaternion(bodyRotation(wheel.body)).normalize()
      const rimSpeed = angularVelocity.dot(worldAxis) * wheel.radius
      const rollingDirection = worldAxis.clone().cross(WORLD_UP)
      let groundSpeed = 0
      if (rollingDirection.lengthSq() > 0.001) {
        rollingDirection.normalize()
        groundSpeed = new THREE.Vector3(linearVelocity.x, linearVelocity.y, linearVelocity.z).dot(rollingDirection)
      }
      const referenceSpeed = Math.max(Math.abs(rimSpeed), Math.abs(groundSpeed), 0.25)
      const slipPercent = Math.min(999, Math.abs(rimSpeed - groundSpeed) / referenceSpeed * 100)
      wheel.groundSpeed = groundSpeed
      wheel.rimSpeed = rimSpeed
      wheel.slipPercent = slipPercent

      const row = document.querySelector(`[data-wheel-id="${wheel.id}"]`)
      const speed = row?.querySelector('[data-wheel-speed]')
      const slip = row?.querySelector('[data-wheel-slip]')
      if (!speed || !slip) continue
      speed.textContent = `${groundSpeed >= 0 ? '+' : ''}${groundSpeed.toFixed(2)} u/s`
      slip.textContent = `${Math.round(slipPercent)}%`
      slip.classList.toggle('slipping', slipPercent > 25 && Math.abs(rimSpeed) > 0.5)
    }

    if (this.chassisMonitor) {
      const speed = document.querySelector('[data-body-speed]')
      const accel = document.querySelector('[data-body-accel]')
      if (speed) speed.textContent = `${this.chassisMonitor.speed.toFixed(2)} u/s`
      if (accel) accel.textContent = `${this.chassisMonitor.acceleration >= 0 ? '+' : ''}${this.chassisMonitor.acceleration.toFixed(2)} u/s²`
    }

    if (this.scenarioData && this.chassisMonitor) {
      const test = document.querySelector('.telemetry-test')
      const status = test?.querySelector('[data-test-status-text]')
      const bar = test?.querySelector('[data-test-progress]')
      const percent = test?.querySelector('[data-test-percent]')
      const altitude = test?.querySelector('[data-test-altitude]')
      const progress = Math.round(this.chassisMonitor.progress * 100)
      if (test) test.dataset.testStatus = this.testStatus
      if (status) status.textContent = this.testStatus
      if (bar) bar.style.width = `${progress}%`
      if (percent) percent.textContent = `${progress}%`
      if (altitude) altitude.textContent = `${this.chassisMonitor.altitude >= 0 ? '+' : ''}${this.chassisMonitor.altitude.toFixed(2)} u`
    }
  }

  step(now = performance.now() / 1000) {
    return stepPhysicsSession(this, now)
  }

  syncObjects() {
    for (const component of this.components) {
      const translation = component.body.translation()
      const rotation = component.body.rotation()
      const bodyWorldMatrix = new THREE.Matrix4().compose(
        new THREE.Vector3(translation.x, translation.y, translation.z),
        new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
        new THREE.Vector3(1, 1, 1),
      )

      for (const member of component.members) {
        const objectWorldMatrix = bodyWorldMatrix.clone().multiply(member.relativeMatrix)
        const parent = member.object.parent
        if (!parent) {
          const pose = matrixPose(objectWorldMatrix)
          member.object.position.copy(pose.position)
          member.object.quaternion.copy(pose.rotation)
          member.object.scale.copy(pose.scale)
          continue
        }
        parent.updateWorldMatrix(true, false)
        const localMatrix = parent.matrixWorld.clone().invert().multiply(objectWorldMatrix)
        const pose = matrixPose(localMatrix)
        member.object.position.copy(pose.position)
        member.object.quaternion.copy(pose.rotation)
        member.object.scale.copy(pose.scale)
      }
    }
  }

  setRunning(running) {
    this.physicsLastTime = performance.now() / 1000
    this.running = Boolean(running)
  }

  removeTelemetry() {
    document.getElementById('drivetrainTelemetry')?.remove()
  }

  dispose() {
    try {
      this.world?.free?.()
    } catch (error) {
      console.warn('Could not free Rapier world', error)
    }
    this.removeTelemetry()
    this.scenarioVisualRoot?.parent?.remove(this.scenarioVisualRoot)
    this.scenarioVisualRoot = null
    this.world = null
    this.members.clear()
    this.components = []
    this.motorDrives = []
    this.gearCouplers = []
    this.shaftMonitors = []
    this.wheelMonitors = []
  }

  get telemetry() {
    return this.drivetrain
      ? {
          shafts: this.drivetrain.shafts.map(shaft => ({
            id: shaft.id,
            rpm: shaft.rpm,
            ratioFromMotor: shaft.ratioFromMotor,
            torqueCapacity: shaft.torqueCapacity,
            efficiency: shaft.efficiency,
            memberIds: shaft.memberIds,
          })),
          motors: this.motorDrives.map(drive => ({
            id: drive.id,
            targetRpm: drive.targetRpm,
            actualRpm: drive.actualRpm,
            load: drive.load,
            torque: drive.torque,
            current: drive.current,
            stalled: drive.stalled,
          })),
          gearMeshes: this.drivetrain.gearMeshes.map(mesh => ({
            id: mesh.id,
            teethA: mesh.a.teeth,
            teethB: mesh.b.teeth,
            ratio: mesh.ratioAB,
            efficiency: mesh.efficiency,
          })),
          wheels: this.wheelMonitors.map(wheel => ({
            id: wheel.id,
            radius: wheel.radius,
            groundSpeed: wheel.groundSpeed,
            rimSpeed: wheel.rimSpeed,
            slipPercent: wheel.slipPercent,
          })),
          vehicle: this.chassisMonitor ? {
            speed: this.chassisMonitor.speed,
            acceleration: this.chassisMonitor.acceleration,
            altitude: this.chassisMonitor.altitude,
            progress: this.chassisMonitor.progress,
          } : null,
          scenario: this.scenarioData ? { ...this.scenarioData, status: this.testStatus } : null,
          conflicts: [...this.drivetrain.conflicts],
        }
      : { shafts: [], motors: [], gearMeshes: [], wheels: [], vehicle: null, scenario: null, conflicts: [] }
  }

  get stats() {
    const drivetrainStats = this.drivetrain?.stats ?? { shafts: 0, drivenShafts: 0, motors: 0, gearMeshes: 0, conflicts: 0, maxTorque: 0 }
    return {
      parts: this.objects.length,
      bodies: this.components.length,
      rigidMerged: Math.max(0, this.objects.length - this.components.length),
      joints: this.jointCount,
      failedJoints: this.failedJointCount,
      internalJoints: this.internalJointCount,
      motors: this.motorCount,
      bearings: this.bearingCount,
      shafts: drivetrainStats.shafts,
      drivenShafts: drivetrainStats.drivenShafts,
      gearMeshes: drivetrainStats.gearMeshes,
      drivetrainConflicts: drivetrainStats.conflicts,
      maxTorque: drivetrainStats.maxTorque,
      wheels: this.wheelMonitors.length,
      scenario: this.scenario,
      testStatus: this.testStatus,
    }
  }
}

PhysicsSession.prototype.step.__bricklabOwner = STEP_OWNER
