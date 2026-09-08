export const VEHICLE_MODEL_VERSION = 'vehicle-model-v1'

const EPS = 1e-9

export function clampVehicle(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

export function approachVehicle(current, target, maxDelta) {
  const c = Number(current) || 0
  const t = Number(target) || 0
  const d = Math.max(0, Number(maxDelta) || 0)
  if (Math.abs(t - c) <= d) return t
  return c + Math.sign(t - c) * d
}

/**
 * Ackermann steering geometry.
 * Positive input means a left turn. `left`/`right` are wheel steering angles
 * in radians. The inner wheel always receives the larger absolute angle.
 */
export function ackermannAngles({ input = 0, wheelbase = 0, track = 0, maxSteerRadians = Math.PI / 6 } = {}) {
  const normalized = clampVehicle(input, -1, 1)
  const maxAngle = Math.max(0, Math.abs(Number(maxSteerRadians) || 0))
  const center = normalized * maxAngle
  const wb = Math.max(EPS, Math.abs(Number(wheelbase) || 0))
  const tr = Math.max(0, Math.abs(Number(track) || 0))

  if (Math.abs(center) < EPS || maxAngle < EPS) {
    return { center: 0, left: 0, right: 0, radius: Infinity }
  }

  // Bicycle-model radius measured from the vehicle centerline to the ICR.
  const radius = wb / Math.tan(Math.abs(center))
  const innerRadius = Math.max(EPS, radius - tr / 2)
  const outerRadius = radius + tr / 2
  const inner = Math.atan(wb / innerRadius)
  const outer = Math.atan(wb / outerRadius)
  const sign = Math.sign(center)

  return sign > 0
    ? { center, left: inner, right: outer, radius }
    : { center, left: -outer, right: -inner, radius }
}

/**
 * Returns a torque that opposes angular speed without numerically crossing
 * through zero during this microstep. This is an impulse bound, not a speed clamp.
 */
export function boundedBrakeTorque({ omega = 0, input = 0, maxTorque = 0, inverseInertia = 0, dt = 0 } = {}) {
  const w = Number(omega) || 0
  const amount = clampVehicle(input, 0, 1)
  const capacity = Math.max(0, Number(maxTorque) || 0) * amount
  const invI = Math.max(0, Number(inverseInertia) || 0)
  const step = Math.max(0, Number(dt) || 0)
  if (Math.abs(w) < EPS || capacity < EPS || invI < EPS || step < EPS) return 0
  const zeroingTorque = Math.abs(w) / (invI * step)
  return -Math.sign(w) * Math.min(capacity, zeroingTorque)
}

export function classifyWheelAxles(wheels = []) {
  const valid = wheels.filter(w => Number.isFinite(w?.x) && Number.isFinite(w?.z))
  if (!valid.length) return { wheelbase: 0, track: 0, centerX: 0, centerZ: 0, wheels: [] }

  const minX = Math.min(...valid.map(w => w.x))
  const maxX = Math.max(...valid.map(w => w.x))
  const minZ = Math.min(...valid.map(w => w.z))
  const maxZ = Math.max(...valid.map(w => w.z))
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2
  const wheelbase = Math.max(0, maxZ - minZ)
  const track = Math.max(0, maxX - minX)
  const axleTolerance = Math.max(0.08 * wheelbase, 0.002)

  return {
    wheelbase,
    track,
    centerX,
    centerZ,
    wheels: valid.map(wheel => ({
      ...wheel,
      side: wheel.x < centerX ? 'left' : 'right',
      axle: wheel.z >= maxZ - axleTolerance ? 'front' : wheel.z <= minZ + axleTolerance ? 'rear' : 'middle',
    })),
  }
}
