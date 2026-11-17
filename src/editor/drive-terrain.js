import { Quaternion, Vector3 } from 'three'

const up = new Vector3(0, 1, 0)

export function terrainPose(terrain, origin, state, contacts, position, yaw) {
  const previous = new Quaternion().setFromAxisAngle(up, state.yaw).premultiply(state.tilt)
  const samples = []
  for (const { position: center, wheel } of contacts) {
    const bottom = center.clone().sub(origin).addScaledVector(up, -wheel.radius)
    const oldFoot = bottom.clone().applyQuaternion(previous).add(origin).add(state.position)
    const next = bottom.clone().applyAxisAngle(up, yaw)
    const height = terrain.heightAt(origin.x + position.x + next.x, origin.z + position.z + next.z,
      oldFoot.y + wheel.radius * .65, oldFoot.y - wheel.radius)
    if (!Number.isFinite(height)) return null
    samples.push(new Vector3(next.x, height - origin.y - next.y, next.z))
  }

  if (!samples.length) return null
  const mean = samples.reduce((sum, point) => sum.add(point), new Vector3()).divideScalar(samples.length)
  let xx = 0, zz = 0, xz = 0, xy = 0, zy = 0
  for (const sample of samples) {
    const { x, y, z } = sample.sub(mean)
    xx += x * x
    zz += z * z
    xz += x * z
    xy += x * y
    zy += z * y
  }
  // Fit a support plane. Two collinear wheels constrain only the slope along their line.
  const determinant = xx * zz - xz * xz
  const spread = xx + zz
  const slopeX = determinant > spread ** 2 * 1e-8 ? (xy * zz - zy * xz) / determinant : spread ? xy / spread : 0
  const slopeZ = determinant > spread ** 2 * 1e-8 ? (zy * xx - xy * xz) / determinant : spread ? zy / spread : 0
  if (Math.hypot(slopeX, slopeZ) > 1.35) return null
  const normal = new Vector3(-slopeX, 1, -slopeZ).normalize()
  return {
    height: mean.y - slopeX * mean.x - slopeZ * mean.z,
    tilt: new Quaternion().setFromUnitVectors(up, normal),
  }
}
