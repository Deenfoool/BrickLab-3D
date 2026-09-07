import * as THREE from 'three'
import { findPart } from './parts.js'
import {
  analyzeDrivetrain,
  isRigidAxleConnection,
  motorConnectionInfo,
} from './drivetrain.js'

const RAPIER_CDN = 'https://cdn.skypack.dev/@dimforge/rapier3d-compat@0.20.0'
let rapierPromise = null
const WORLD_UP = new THREE.Vector3(0, 1, 0)

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
      friction: 1.35,
    }]
  }

  const gear = definition?.mechanics?.gear
  if (gear) {
    return [{
      shape: 'cylinder',
      halfHeight: 0.18,
      radius: (gear.pitchRadius ?? Math.max(0.45, gear.teeth * 0.055)) * 0.7,
      center: new THREE.Vector3(0, 0.4, 0),
      rotation: new THREE.Quaternion(),
      friction: 0.5,
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
    .setRestitution(0.03)
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

export class PhysicsSession {
  static async create(objects, connections) {
    const RAPIER = await loadRapier()
    const session = new PhysicsSession(RAPIER, objects, connections)
    session.build()
    return session
  }

  constructor(RAPIER, objects, connections) {
    this.RAPIER = RAPIER
    this.objects = objects
    this.connections = connections
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
    this.gearVelocityTargets = []
    this.shaftMonitors = []
    this.wheelMonitors = []
    this.telemetryTick = 0
  }

  build() {
    const RAPIER = this.RAPIER
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.world.timestep = 1 / 60

    const ground = RAPIER.ColliderDesc.cuboid(40, 0.12, 40)
      .setTranslation(0, -0.12, 0)
      .setFriction(1.1)
      .setRestitution(0.02)
    this.world.createCollider(ground)

    const groups = buildRigidComponents(this.objects, this.connections)
    for (const objects of groups) this.createCompoundBody(objects)

    for (const connection of this.connections) {
      if (connection.kind === 'fixed') continue
      if (isRigidAxleConnection(connection, this.objects)) continue
      this.createJoint(connection)
    }

    this.drivetrain = analyzeDrivetrain(this.objects, this.connections)
    this.buildGearVelocityTargets()
    this.buildShaftMonitors()
    this.buildWheelMonitors()
    this.mountTelemetry()
  }

  createCompoundBody(objects) {
    const RAPIER = this.RAPIER
    const rootObject = objects[0]
    if (!rootObject) return

    for (const object of objects) object.updateWorldMatrix(true, false)
    rootObject.updateWorldMatrix(true, false)

    const bodyWorldMatrix = rootObject.matrixWorld.clone()
    const bodyWorldInverse = bodyWorldMatrix.clone().invert()
    const { position: bodyPosition, rotation: bodyRotation } = matrixPose(bodyWorldMatrix)

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
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
        const colliderDesc = createColliderDescriptor(this.RAPIER, spec, relativeMatrix, relativeRotation, relativeScale)
        this.world.createCollider(colliderDesc, body)
      }

      const member = { object, body, component, relativeMatrix }
      component.members.push(member)
      this.members.set(object.userData.instanceId, member)
    }

    this.components.push(component)
  }

  bodyLocalPoint(member, connector) {
    const worldPoint = new THREE.Vector3(...connector.position).applyMatrix4(member.object.matrixWorld)
    return worldPoint.applyMatrix4(member.component.bodyWorldInverse)
  }

  bodyLocalAxis(member, connector) {
    const objectWorldRotation = member.object.getWorldQuaternion(new THREE.Quaternion())
    const worldAxis = new THREE.Vector3(...connector.axis).normalize().applyQuaternion(objectWorldRotation)
    return worldAxis.applyQuaternion(member.component.bodyWorldRotation.clone().invert()).normalize()
  }

  createJoint(connection) {
    const RAPIER = this.RAPIER
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
        params = RAPIER.JointData.revolute(vector3(anchorA), vector3(anchorB), vector3(axisA))
      } else if (connection.kind === 'axle' && motorConnectionInfo(connection, this.objects)) {
        params = RAPIER.JointData.revolute(vector3(anchorA), vector3(anchorB), vector3(axisA))
      }

      if (!params) return
      const joint = this.world.createImpulseJoint(params, memberA.body, memberB.body, true)
      joint.setContactsEnabled?.(false)

      if (connection.kind === 'bearing') this.bearingCount += 1
      if (connection.kind === 'axle') this.configureMotor(connection, memberA, memberB, connectorA, connectorB, axisA, joint)
      this.jointCount += 1
    } catch (error) {
      this.failedJointCount += 1
      console.warn('BrickLab could not create physics joint', connection, error)
    }
  }

  configureMotor(connection, memberA, memberB, connectorA, connectorB, axisA, joint) {
    if (!joint?.configureMotorVelocity) return

    const info = motorConnectionInfo(connection, this.objects)
    if (!info) return

    const motorIsA = info.motorObject.userData.instanceId === memberA.object.userData.instanceId
    const motorMember = motorIsA ? memberA : memberB
    const motorConnector = motorIsA ? connectorA : connectorB
    const motor = findPart(motorMember.object.userData.partId)?.mechanics?.motor
    if (!motor) return

    const jointAxisWorld = axisA.clone().applyQuaternion(memberA.component.bodyWorldRotation).normalize()
    const motorObjectRotation = motorMember.object.getWorldQuaternion(new THREE.Quaternion())
    const motorAxisWorld = new THREE.Vector3(...motorConnector.axis).normalize().applyQuaternion(motorObjectRotation)
    const axisSign = jointAxisWorld.dot(motorAxisWorld) >= 0 ? 1 : -1
    const sideSign = motorIsA ? 1 : -1
    const radiansPerSecond = (motor.rpm ?? 120) * Math.PI * 2 / 60
    const targetVelocity = radiansPerSecond * (motor.direction ?? 1) * axisSign * sideSign

    joint.configureMotorVelocity(targetVelocity, motor.damping ?? 1.0)
    this.motorCount += 1
  }

  buildGearVelocityTargets() {
    this.gearVelocityTargets = []
    if (!this.drivetrain) return

    for (const shaft of this.drivetrain.shafts) {
      if (shaft.rpm == null || shaft.sourceType !== 'gear') continue

      const member = shaft.memberIds
        .map(instanceId => this.members.get(instanceId))
        .find(Boolean)
      if (!member) continue

      const localAxis = shaft.axisWorld
        .clone()
        .applyQuaternion(member.component.bodyWorldRotation.clone().invert())
        .normalize()

      this.gearVelocityTargets.push({
        shaftId: shaft.id,
        body: member.body,
        localAxis,
        rpm: shaft.rpm,
      })
    }
  }

  buildShaftMonitors() {
    this.shaftMonitors = []
    if (!this.drivetrain) return

    for (const shaft of this.drivetrain.shafts) {
      if (shaft.rpm == null) continue
      const member = shaft.memberIds
        .map(instanceId => this.members.get(instanceId))
        .find(Boolean)
      if (!member) continue

      const localAxis = shaft.axisWorld
        .clone()
        .applyQuaternion(member.component.bodyWorldRotation.clone().invert())
        .normalize()

      this.shaftMonitors.push({
        shaftId: shaft.id,
        body: member.body,
        localAxis,
        targetRpm: shaft.rpm,
        ratioFromMotor: shaft.ratioFromMotor,
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

      const localAxis = shaft.axisWorld
        .clone()
        .applyQuaternion(member.component.bodyWorldRotation.clone().invert())
        .normalize()

      this.wheelMonitors.push({
        id: `wheel-${index++}`,
        name: definition.name,
        body: member.body,
        localAxis,
        radius: wheel.radius,
      })
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

    const driven = this.drivetrain.shafts.filter(shaft => shaft.rpm != null)
    const shaftRows = driven.slice(0, 8).map(shaft => {
      const rpm = Math.round(shaft.rpm)
      const ratio = shaft.ratioFromMotor == null ? '—' : `${shaft.ratioFromMotor >= 0 ? '+' : ''}${shaft.ratioFromMotor.toFixed(2)}×`
      return `<div class="telemetry-row" data-shaft-id="${shaft.id}"><span>${shaft.id}</span><b title="Target RPM">${rpm >= 0 ? '+' : ''}${rpm}</b><small data-actual-rpm title="Actual RPM">0</small><em>${ratio}</em></div>`
    }).join('')

    const gearRows = this.drivetrain.gearMeshes.slice(0, 5).map(mesh => {
      const ratio = Math.abs(mesh.ratioAB)
      return `<div class="telemetry-gear"><span>${mesh.a.teeth}T</span><i data-lucide="move-right"></i><span>${mesh.b.teeth}T</span><b>${ratio.toFixed(2)}:1</b></div>`
    }).join('')

    const wheelRows = this.wheelMonitors.slice(0, 6).map(wheel => `
      <div class="telemetry-wheel" data-wheel-id="${wheel.id}">
        <span>${wheel.name}</span>
        <b data-wheel-speed>0.00 u/s</b>
        <small data-wheel-slip>0%</small>
      </div>
    `).join('')

    panel.innerHTML = `
      <div class="telemetry-head">
        <div><small>DRIVETRAIN</small><strong>Target / Actual RPM</strong></div>
        <i data-lucide="gauge"></i>
      </div>
      <div class="telemetry-summary">
        <span><b>${this.drivetrain.stats.motors}</b> motors</span>
        <span><b>${this.drivetrain.stats.drivenShafts}</b> driven shafts</span>
        <span><b>${this.drivetrain.stats.gearMeshes}</b> gear meshes</span>
      </div>
      <div class="telemetry-section">
        <label>SHAFT · TARGET · ACTUAL · RATIO</label>
        ${shaftRows || '<div class="telemetry-empty">No powered shaft. Connect a Lab Motor output to an axle-hole.</div>'}
      </div>
      <div class="telemetry-section">
        <label>GEARS</label>
        ${gearRows || '<div class="telemetry-empty">Place two powered gears at their pitch distance to mesh them automatically.</div>'}
      </div>
      <div class="telemetry-section">
        <label>WHEELS · GROUND SPEED · SLIP</label>
        ${wheelRows || '<div class="telemetry-empty">Add an Off-road Wheel to measure rolling speed and slip.</div>'}
      </div>
      ${this.drivetrain.conflicts.length ? `<div class="telemetry-warning">${this.drivetrain.conflicts.length} drivetrain conflict${this.drivetrain.conflicts.length === 1 ? '' : 's'} detected</div>` : ''}
    `

    host.append(panel)
    window.lucide?.createIcons?.({ attrs: { 'stroke-width': 1.8, 'aria-hidden': 'true' } })
    this.updateTelemetryReadings(true)
  }

  removeTelemetry() {
    document.getElementById('drivetrainTelemetry')?.remove()
  }

  enforceGearVelocityTargets() {
    for (const target of this.gearVelocityTargets) {
      const rotation = target.body.rotation()
      const bodyRotation = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
      const worldAxis = target.localAxis.clone().applyQuaternion(bodyRotation).normalize()
      const radiansPerSecond = target.rpm * Math.PI * 2 / 60
      const angularVelocity = worldAxis.multiplyScalar(radiansPerSecond)
      target.body.setAngvel(vector3(angularVelocity), true)
    }
  }

  updateTelemetryReadings(force = false) {
    this.telemetryTick += 1
    if (!force && this.telemetryTick % 6 !== 0) return

    for (const monitor of this.shaftMonitors) {
      const angularVelocity = monitor.body.angvel()
      const rotation = monitor.body.rotation()
      const bodyRotation = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
      const worldAxis = monitor.localAxis.clone().applyQuaternion(bodyRotation).normalize()
      const projectedRadians = new THREE.Vector3(
        angularVelocity.x,
        angularVelocity.y,
        angularVelocity.z,
      ).dot(worldAxis)
      const actualRpm = projectedRadians * 60 / (Math.PI * 2)

      const row = document.querySelector(`[data-shaft-id="${monitor.shaftId}"]`)
      const actual = row?.querySelector('[data-actual-rpm]')
      if (!actual) continue

      actual.textContent = `${actualRpm >= 0 ? '+' : ''}${Math.round(actualRpm)}`
      const tolerance = Math.max(5, Math.abs(monitor.targetRpm) * 0.12)
      actual.classList.toggle('off-target', Math.abs(actualRpm - monitor.targetRpm) > tolerance)
      actual.title = `Actual ${actualRpm.toFixed(1)} RPM · target ${monitor.targetRpm.toFixed(1)} RPM`
    }

    for (const wheel of this.wheelMonitors) {
      const angularVelocity = wheel.body.angvel()
      const linearVelocity = wheel.body.linvel()
      const rotation = wheel.body.rotation()
      const bodyRotation = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)
      const worldAxis = wheel.localAxis.clone().applyQuaternion(bodyRotation).normalize()
      const angular = new THREE.Vector3(angularVelocity.x, angularVelocity.y, angularVelocity.z)
      const projectedRadians = angular.dot(worldAxis)
      const rimSpeed = projectedRadians * wheel.radius

      const rollingDirection = worldAxis.clone().cross(WORLD_UP)
      let groundSpeed = 0
      if (rollingDirection.lengthSq() > 0.001) {
        rollingDirection.normalize()
        groundSpeed = new THREE.Vector3(
          linearVelocity.x,
          linearVelocity.y,
          linearVelocity.z,
        ).dot(rollingDirection)
      }

      const referenceSpeed = Math.max(Math.abs(rimSpeed), Math.abs(groundSpeed), 0.25)
      const slipPercent = Math.min(999, Math.abs(rimSpeed - groundSpeed) / referenceSpeed * 100)
      const row = document.querySelector(`[data-wheel-id="${wheel.id}"]`)
      const speed = row?.querySelector('[data-wheel-speed]')
      const slip = row?.querySelector('[data-wheel-slip]')
      if (!speed || !slip) continue

      speed.textContent = `${groundSpeed >= 0 ? '+' : ''}${groundSpeed.toFixed(2)} u/s`
      speed.title = `Ground speed ${groundSpeed.toFixed(2)} units/s · rim speed ${rimSpeed.toFixed(2)} units/s`
      slip.textContent = `${Math.round(slipPercent)}%`
      slip.classList.toggle('slipping', slipPercent > 25 && Math.abs(rimSpeed) > 0.5)
      slip.title = `Wheel slip ${slipPercent.toFixed(1)}%`
    }
  }

  step() {
    if (!this.world || !this.running) return
    this.enforceGearVelocityTargets()
    this.world.step()
    this.syncObjects()
    this.updateTelemetryReadings()
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
          const { position, rotation: worldRotation, scale } = matrixPose(objectWorldMatrix)
          member.object.position.copy(position)
          member.object.quaternion.copy(worldRotation)
          member.object.scale.copy(scale)
          continue
        }

        parent.updateWorldMatrix(true, false)
        const localMatrix = parent.matrixWorld.clone().invert().multiply(objectWorldMatrix)
        const { position, rotation: localRotation, scale } = matrixPose(localMatrix)
        member.object.position.copy(position)
        member.object.quaternion.copy(localRotation)
        member.object.scale.copy(scale)
      }
    }
  }

  setRunning(running) {
    this.running = Boolean(running)
  }

  dispose() {
    try {
      this.world?.free?.()
    } catch (error) {
      console.warn('Could not free Rapier world', error)
    }
    this.removeTelemetry()
    this.world = null
    this.members.clear()
    this.components = []
    this.gearVelocityTargets = []
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
            memberIds: shaft.memberIds,
            sourceType: shaft.sourceType,
          })),
          gearMeshes: this.drivetrain.gearMeshes.map(mesh => ({
            id: mesh.id,
            teethA: mesh.a.teeth,
            teethB: mesh.b.teeth,
            ratio: mesh.ratioAB,
            error: mesh.error,
          })),
          motors: this.drivetrain.motors.map(motor => ({
            id: motor.id,
            rpm: motor.rpm,
            shaftId: motor.shaftId,
          })),
          wheels: this.wheelMonitors.map(wheel => ({ id: wheel.id, radius: wheel.radius })),
          conflicts: [...this.drivetrain.conflicts],
        }
      : { shafts: [], gearMeshes: [], motors: [], wheels: [], conflicts: [] }
  }

  get stats() {
    const drivetrainStats = this.drivetrain?.stats ?? {
      shafts: 0,
      drivenShafts: 0,
      motors: 0,
      gearMeshes: 0,
      conflicts: 0,
    }

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
      gearVelocityTargets: this.gearVelocityTargets.length,
      wheels: this.wheelMonitors.length,
    }
  }
}
