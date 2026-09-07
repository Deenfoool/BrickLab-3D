import * as THREE from 'three'
import { PhysicsSession } from './physics.js'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function vec(value) {
  return { x: value.x, y: value.y, z: value.z }
}

const previousBuildScenario = PhysicsSession.prototype.buildScenario
PhysicsSession.prototype.buildScenario = function buildExtendedScenario() {
  if (this.scenario !== 'torque-pull') return previousBuildScenario.call(this)

  this.scenarioData = {
    name: 'Pull / Torque Bench',
    startForce: 1.5,
    maxForce: 18,
    rampRate: 1.35,
    currentForce: 1.5,
  }

  const scene = this.objects[0]?.parent?.parent
  if (!scene?.add) return
  const root = new THREE.Group()
  root.name = 'BrickLab Pull Torque Bench'

  const anchorMaterial = new THREE.MeshStandardMaterial({ color: 0x555e67, roughness: 0.9 })
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xffb65c, roughness: 0.65 })
  const anchor = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.8), anchorMaterial)
  anchor.position.set(0, 0.6, -5)
  root.add(anchor)

  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 4.2), accentMaterial)
  cable.position.set(0, 0.65, -2.5)
  root.add(cable)

  for (let z = 2; z <= 14; z += 2) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.025, 0.08), accentMaterial)
    marker.position.set(0, 0.015, z)
    root.add(marker)
  }

  scene.add(root)
  this.scenarioVisualRoot = root
}

const previousResetTorques = PhysicsSession.prototype.resetCustomTorques
PhysicsSession.prototype.resetCustomTorques = function resetForcesAndTorques(...args) {
  const result = previousResetTorques.apply(this, args)
  for (const component of this.components ?? []) component.body.resetForces?.(true)
  return result
}

const previousApplyMotorTorques = PhysicsSession.prototype.applyMotorTorques
PhysicsSession.prototype.applyMotorTorques = function applyMotorAndPullLoad(dt, ...args) {
  const result = previousApplyMotorTorques.call(this, dt, ...args)
  if (this.scenario !== 'torque-pull' || !this.chassisMonitor || !this.scenarioData) return result

  const elapsedForce = this.scenarioData.startForce + this.simulationTime * this.scenarioData.rampRate
  const force = Math.min(this.scenarioData.maxForce, elapsedForce)
  this.scenarioData.currentForce = force
  this.chassisMonitor.body.addForce(vec(new THREE.Vector3(0, 0, -force)), true)
  return result
}

const previousVehicleMetrics = PhysicsSession.prototype.updateVehicleMetrics
PhysicsSession.prototype.updateVehicleMetrics = function updateTorqueBenchMetrics(dt, ...args) {
  if (this.scenario !== 'torque-pull') return previousVehicleMetrics.call(this, dt, ...args)
  if (!this.chassisMonitor || !this.scenarioData) return

  const velocity = this.chassisMonitor.body.linvel()
  const speed = Math.hypot(velocity.x, velocity.z)
  this.chassisMonitor.acceleration = (speed - this.lastVehicleSpeed) / Math.max(dt, 0.001)
  this.chassisMonitor.speed = speed
  this.lastVehicleSpeed = speed

  const position = this.chassisMonitor.body.translation()
  this.chassisMonitor.altitude = position.y - this.chassisMonitor.startPosition.y
  const forceRange = Math.max(0.01, this.scenarioData.maxForce - this.scenarioData.startForce)
  this.chassisMonitor.progress = clamp((this.scenarioData.currentForce - this.scenarioData.startForce) / forceRange, 0, 1)

  const maxLoad = Math.max(0, ...this.motorDrives.map(drive => drive.load))
  const forwardSpeed = velocity.z
  const stalled = this.simulationTime > 2 && forwardSpeed < 0.04 && maxLoad > 0.8
  this.stallTimer = stalled ? this.stallTimer + dt : 0

  if (this.scenarioData.currentForce >= this.scenarioData.maxForce && forwardSpeed > -0.15) {
    this.testStatus = 'PASSED'
  } else if (this.stallTimer > 1.6) {
    this.testStatus = 'STALLED'
  } else {
    this.testStatus = 'RUNNING'
  }
}

const previousTelemetryUpdate = PhysicsSession.prototype.updateTelemetryReadings
PhysicsSession.prototype.updateTelemetryReadings = function updateTorqueBenchTelemetry(...args) {
  const result = previousTelemetryUpdate.apply(this, args)
  if (this.scenario !== 'torque-pull' || !this.scenarioData) return result

  const altitude = document.querySelector('[data-test-altitude]')
  const percent = document.querySelector('[data-test-percent]')
  if (altitude) altitude.textContent = `${this.scenarioData.currentForce.toFixed(1)} F`
  if (percent) percent.textContent = `${Math.round((this.chassisMonitor?.progress ?? 0) * 100)}% load`
  return result
}
