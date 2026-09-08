import * as THREE from 'three'
import { PhysicsSession } from './physics.js'

export const VEHICLE_PERFORMANCE_VERSION = 'vehicle-performance-v1'
const STOP_SPEED = 0.01
const ACCEL_TARGET_SPEED = 0.5

function horizontalDistance(a, b) {
  if (!a || !b) return 0
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0))
}

function bodyPosition(body) {
  const p = body?.translation?.()
  return p ? new THREE.Vector3(p.x, p.y, p.z) : null
}

function bodySpeed(body) {
  const v = body?.linvel?.()
  return v ? Math.hypot(v.x, v.z) : 0
}

function ensurePerformance(session) {
  const body = session.chassisMonitor?.body
  if (!body) return null
  if (!session.vehiclePerformanceV1) {
    const position = bodyPosition(body)
    session.vehiclePerformanceV1 = {
      version: VEHICLE_PERFORMANCE_VERSION,
      startPosition: position?.clone?.() ?? null,
      lastPosition: position?.clone?.() ?? null,
      distanceM: 0,
      topSpeedMps: 0,
      accelTargetMps: ACCEL_TARGET_SPEED,
      accelTimeToTarget: null,
      braking: false,
      brakeStartPosition: null,
      brakeStartSpeedMps: 0,
      lastBrakingDistanceM: null,
      lastBrakingTimeS: null,
      brakeStartTimeS: null,
    }
  }
  return session.vehiclePerformanceV1
}

PhysicsSession.prototype.updateVehiclePerformanceV1 = function updateVehiclePerformanceV1() {
  const performance = ensurePerformance(this)
  const body = this.chassisMonitor?.body
  if (!performance || !body) return

  const position = bodyPosition(body)
  const speed = bodySpeed(body)
  if (position && performance.lastPosition) performance.distanceM += horizontalDistance(position, performance.lastPosition)
  if (position) performance.lastPosition = position.clone()
  performance.topSpeedMps = Math.max(performance.topSpeedMps, speed)

  if (performance.accelTimeToTarget == null && speed >= performance.accelTargetMps) {
    performance.accelTimeToTarget = this.simulationTime ?? 0
  }

  const brakeActive = Boolean((this.vehicleControlV1?.brakeInput ?? 0) >= 0.5 || this.vehicleControlV1?.parkingBrake)
  if (brakeActive && !performance.braking && speed > STOP_SPEED) {
    performance.braking = true
    performance.brakeStartPosition = position?.clone?.() ?? null
    performance.brakeStartSpeedMps = speed
    performance.brakeStartTimeS = this.simulationTime ?? 0
  }

  if (performance.braking && speed <= STOP_SPEED) {
    performance.lastBrakingDistanceM = horizontalDistance(position, performance.brakeStartPosition)
    performance.lastBrakingTimeS = Math.max(0, (this.simulationTime ?? 0) - (performance.brakeStartTimeS ?? this.simulationTime ?? 0))
    performance.braking = false
    performance.brakeStartPosition = null
    performance.brakeStartTimeS = null
  }
}
PhysicsSession.prototype.updateVehiclePerformanceV1.__bricklabOwner = VEHICLE_PERFORMANCE_VERSION

globalThis.BrickLabVehiclePerformance = {
  version: VEHICLE_PERFORMANCE_VERSION,
  get: () => {
    const session = globalThis.__bricklabPhysicsSession
    const p = session?.vehiclePerformanceV1
    if (!p) return null
    return {
      version: p.version,
      distanceM: p.distanceM,
      topSpeedMps: p.topSpeedMps,
      accelTargetMps: p.accelTargetMps,
      accelTimeToTarget: p.accelTimeToTarget,
      braking: p.braking,
      brakeStartSpeedMps: p.brakeStartSpeedMps,
      lastBrakingDistanceM: p.lastBrakingDistanceM,
      lastBrakingTimeS: p.lastBrakingTimeS,
    }
  },
}
