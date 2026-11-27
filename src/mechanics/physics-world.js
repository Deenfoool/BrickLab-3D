import { Box3, Quaternion, Vector3 } from 'three'

export const metersPerLdu = .01
export const gravity = 9.81
export const physicsStep = 1 / 120
export const vectorFrom = value => new Vector3(value.x, value.y, value.z)

let ready
export function loadRapier() {
  const source = 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.19.3/rapier.mjs'
  ready ??= import(source).then(async ({ default: rapier }) => {
    await rapier.init()
    return rapier
  }).catch(error => {
    ready = undefined
    throw error
  })
  return ready
}

export function physicsWorld(rapier, terrain) {
  const world = new rapier.World({ x: 0, y: -gravity, z: 0 })
  world.timestep = physicsStep
  try {
    if (!terrain) {
      world.createCollider(new rapier.ColliderDesc(new rapier.HalfSpace({ x: 0, y: 1, z: 0 })).setFriction(.8))
      return world
    }
    for (const mesh of terrain.collisionMeshes) {
      const positions = mesh.geometry.getAttribute('position')
      if (!positions || positions.count < 3) continue
      if (mesh.userData.type === 'box') {
        const center = mesh.geometry.boundingBox.getCenter(new Vector3()).applyMatrix4(mesh.matrixWorld)
        const size = mesh.geometry.boundingBox.getSize(new Vector3())
          .multiply(mesh.getWorldScale(new Vector3())).multiplyScalar(metersPerLdu / 2)
        const desc = rapier.ColliderDesc.cuboid(size.x, size.y, size.z)
          .setTranslation(center.x * metersPerLdu, center.y * metersPerLdu, center.z * metersPerLdu)
          .setRotation(mesh.getWorldQuaternion(new Quaternion()))
        world.createCollider(desc.setFriction(Number.isFinite(mesh.userData.friction)?mesh.userData.friction:.8))
        continue
      }
      const vertices = new Float32Array(positions.count * 3)
      const point = new Vector3()
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).multiplyScalar(metersPerLdu)
          .toArray(vertices, i * 3)
      }
      const index = mesh.geometry.index
      const indices = index ? Uint32Array.from(index.array) : Uint32Array.from({ length: positions.count }, (_, i) => i)
      const desc = rapier.ColliderDesc.trimesh(vertices, indices)
      world.createCollider(desc.setFriction(Number.isFinite(mesh.userData.friction)?mesh.userData.friction:.8))
    }
    return world
  } catch (error) {
    world.free()
    throw error
  }
}

export function assemblyBounds(parts, models, origin, basis) {
  const hull = new Box3()
  for (const part of parts) {
    const bounds = models.get(part.design)?.bounds
    if (!bounds || bounds.isEmpty()) continue
    const rotation = new Quaternion().fromArray(part.rotation)
    const center = new Vector3().fromArray(part.position).sub(origin)
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          hull.expandByPoint(new Vector3(x, y, z).applyQuaternion(rotation).add(center).applyQuaternion(basis))
        }
      }
    }
  }
  return hull
}
