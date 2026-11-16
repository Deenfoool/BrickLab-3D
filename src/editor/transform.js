import { Plane, Quaternion, Vector3 } from 'three'
import { snapGrid } from './model.js'

export const axes = {
  X: new Vector3(1, 0, 0),
  Y: new Vector3(0, 1, 0),
  Z: new Vector3(0, 0, 1),
}
const vector = position => new Vector3().fromArray(position)

function dragPoint(scene, pointer, pivot, normal) {
  const plane = new Plane().setFromNormalAndCoplanarPoint(normal, pivot)
  return scene.pointer(pointer, false).ray.intersectPlane(plane, new Vector3())
}

export function transformPose(scene, operation, pointer) {
  const { kind, part, start, axis, input } = operation
  const pivot = vector(part.position)
  const view = scene.camera.getWorldDirection(new Vector3())
  const direction = axes[axis]
  const number = input !== '' && Number.isFinite(Number(input)) ? Number(input) : null

  if (kind === 'rotate') {
    const rotateAxis = direction ?? view.clone().negate()
    const before = dragPoint(scene, start, pivot, rotateAxis)?.sub(pivot)
    const after = dragPoint(scene, pointer, pivot, rotateAxis)?.sub(pivot)
    let angle = (pointer.clientX - start.clientX) * .012
    if (before?.lengthSq() > 1 && after?.lengthSq() > 1) {
      angle = Math.atan2(rotateAxis.dot(before.clone().cross(after)), before.dot(after))
    }
    if (number !== null) angle = number * Math.PI / 180
    else if (pointer.ctrlKey) angle = Math.round(angle / (Math.PI / 12)) * Math.PI / 12
    const quaternion = new Quaternion().setFromAxisAngle(rotateAxis, angle)
      .multiply(new Quaternion().fromArray(part.rotation))
    return { ...part, rotation: quaternion.toArray() }
  }

  // Intersect on a plane containing the constrained axis when viewed off-axis.
  const normal = direction ? view.clone().addScaledVector(direction, -view.dot(direction)).normalize() : view
  const before = dragPoint(scene, start, pivot, normal)
  const after = dragPoint(scene, pointer, pivot, normal)
  const delta = before && after ? after.sub(before) : new Vector3()
  if (direction) delta.copy(direction).multiplyScalar(number ?? direction.dot(delta))
  if (pointer.ctrlKey && number === null) delta.set(...delta.toArray().map(value => Math.round(value / snapGrid) * snapGrid))
  return { ...part, position: pivot.add(delta).toArray() }
}

export function samePose(a, b) {
  const position = vector(a.position).distanceToSquared(vector(b.position))
  const rotation = Math.abs(new Quaternion().fromArray(a.rotation).dot(new Quaternion().fromArray(b.rotation)))
  return position < 1e-10 && rotation > 1 - 1e-10
}
