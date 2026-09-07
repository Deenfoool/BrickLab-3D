import * as THREE from 'three'
import { findPart } from './parts.js'

const COMPATIBLE = {
  stud: ['tube'],
  tube: ['stud'],
  pin: ['pin-hole'],
  'pin-hole': ['pin', 'axle'],
  axle: ['axle-hole', 'pin-hole'],
  'axle-hole': ['axle'],
}

export function connectorWorldPosition(object, connector) {
  object.updateWorldMatrix(true, false)
  return new THREE.Vector3(...connector.position).applyMatrix4(object.matrixWorld)
}

export function connectorWorldAxis(object, connector) {
  const quaternion = object.getWorldQuaternion(new THREE.Quaternion())
  return new THREE.Vector3(...connector.axis).normalize().applyQuaternion(quaternion).normalize()
}

function directionalPair(sourceType, targetType) {
  return (sourceType === 'stud' && targetType === 'tube') ||
    (sourceType === 'tube' && targetType === 'stud')
}

export function findSnapCandidate(selected, objects, options = {}) {
  // Connector snapping is intentionally suspended while TransformControls owns
  // a shared multi-selection pivot. Otherwise only the active part would snap
  // away from the rest of the selection on mouse-up.
  if (globalThis.__bricklabMultiTransformActive) return null

  const maxDistance = typeof options === 'number' ? options : (options.maxDistance ?? 0.72)
  const minAlignment = typeof options === 'object' ? (options.minAlignment ?? 0) : 0
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
        if (alignment < minAlignment) continue

        const orientationPenalty = (1 - alignment) * 0.32
        const score = distance + orientationPenalty
        if (score < bestScore) {
          bestScore = score
          best = { source, target, targetObject: object, targetWorld, distance, alignment }
        }
      }
    }
  }

  return best
}

export function orientForSnap(selected, candidate) {
  selected.updateWorldMatrix(true, false)
  candidate.targetObject.updateWorldMatrix(true, false)

  const sourceAxis = connectorWorldAxis(selected, candidate.source)
  const targetAxis = connectorWorldAxis(candidate.targetObject, candidate.target)
  const desiredAxis = targetAxis.clone()

  if (directionalPair(candidate.source.type, candidate.target.type)) {
    desiredAxis.multiplyScalar(-1)
  } else if (sourceAxis.dot(desiredAxis) < 0) {
    desiredAxis.multiplyScalar(-1)
  }

  const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(sourceAxis, desiredAxis)
  const worldQuaternion = selected.getWorldQuaternion(new THREE.Quaternion())
  const alignedWorldQuaternion = alignQuaternion.multiply(worldQuaternion)

  if (!selected.parent) {
    selected.quaternion.copy(alignedWorldQuaternion)
    return
  }

  const parentWorldQuaternion = selected.parent.getWorldQuaternion(new THREE.Quaternion())
  selected.quaternion.copy(parentWorldQuaternion.invert().multiply(alignedWorldQuaternion))
  selected.updateMatrixWorld(true)
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
