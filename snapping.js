import * as THREE from 'three'
import { findPart } from './parts.js'

const COMPATIBLE = {
  stud: ['tube'],
  tube: ['stud'],
  pin: ['pin-hole'],
  'pin-hole': ['pin'],
  axle: ['axle-hole'],
  'axle-hole': ['axle'],
}

export function connectorWorldPosition(object, connector) {
  object.updateWorldMatrix(true, false)
  return new THREE.Vector3(...connector.position).applyMatrix4(object.matrixWorld)
}

function connectorWorldAxis(object, connector) {
  const quaternion = object.getWorldQuaternion(new THREE.Quaternion())
  return new THREE.Vector3(...connector.axis).normalize().applyQuaternion(quaternion).normalize()
}

export function findSnapCandidate(selected, objects, options = {}) {
  const maxDistance = typeof options === 'number' ? options : (options.maxDistance ?? 0.72)
  const isAvailable = typeof options === 'object' && options.isAvailable
    ? options.isAvailable
    : () => true

  const sourceDef = findPart(selected.userData.partId)
  if (!sourceDef?.connectors?.length) return null

  let best = null
  let bestScore = Infinity

  for (const source of sourceDef.connectors) {
    if (!isAvailable(selected, source)) continue

    const sourceWorld = connectorWorldPosition(selected, source)
    const sourceAxis = connectorWorldAxis(selected, source)

    for (const object of objects) {
      if (object === selected) continue
      const targetDef = findPart(object.userData.partId)
      if (!targetDef?.connectors?.length) continue

      for (const target of targetDef.connectors) {
        if (!isAvailable(object, target)) continue
        if (!COMPATIBLE[source.type]?.includes(target.type)) continue

        const targetWorld = connectorWorldPosition(object, target)
        const distance = sourceWorld.distanceTo(targetWorld)
        if (distance > maxDistance) continue

        const targetAxis = connectorWorldAxis(object, target)
        const alignment = Math.abs(sourceAxis.dot(targetAxis))
        if (alignment < 0.8) continue

        const score = distance + (1 - alignment) * 0.25
        if (score < bestScore) {
          bestScore = score
          best = { source, target, targetObject: object, targetWorld, distance, alignment }
        }
      }
    }
  }

  return best
}

export function applySnap(selected, candidate) {
  const currentSource = connectorWorldPosition(selected, candidate.source)
  const currentTarget = connectorWorldPosition(candidate.targetObject, candidate.target)
  const worldDelta = currentTarget.sub(currentSource)

  if (!selected.parent) {
    selected.position.add(worldDelta)
    return
  }

  const parentRotation = selected.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
  selected.position.add(worldDelta.applyQuaternion(parentRotation))
}
