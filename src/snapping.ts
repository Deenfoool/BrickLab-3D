import * as THREE from 'three'
import { findPart } from './parts'
import type { ConnectorDefinition, ConnectorType } from './types'

export type SnapCandidate = {
  source: ConnectorDefinition
  target: ConnectorDefinition
  targetObject: THREE.Object3D
  sourceWorld: THREE.Vector3
  targetWorld: THREE.Vector3
  distance: number
}

const COMPATIBLE: Record<ConnectorType, ConnectorType[]> = {
  stud: ['tube'],
  tube: ['stud'],
  pin: ['pin-hole'],
  'pin-hole': ['pin'],
  axle: ['axle-hole'],
  'axle-hole': ['axle'],
}

function compatible(a: ConnectorType, b: ConnectorType) {
  return COMPATIBLE[a].includes(b)
}

export function connectorWorldPosition(object: THREE.Object3D, connector: ConnectorDefinition) {
  object.updateWorldMatrix(true, false)
  return new THREE.Vector3(...connector.position).applyMatrix4(object.matrixWorld)
}

function connectorWorldAxis(object: THREE.Object3D, connector: ConnectorDefinition) {
  const quaternion = object.getWorldQuaternion(new THREE.Quaternion())
  return new THREE.Vector3(...connector.axis).normalize().applyQuaternion(quaternion).normalize()
}

export function findSnapCandidate(
  selected: THREE.Object3D,
  objects: THREE.Object3D[],
  maxDistance = 0.72,
): SnapCandidate | null {
  const selectedDefinition = findPart(selected.userData.partId)
  if (!selectedDefinition?.connectors.length) return null

  let best: SnapCandidate | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const source of selectedDefinition.connectors) {
    const sourceWorld = connectorWorldPosition(selected, source)
    const sourceAxis = connectorWorldAxis(selected, source)

    for (const object of objects) {
      if (object === selected) continue
      const targetDefinition = findPart(object.userData.partId)
      if (!targetDefinition?.connectors.length) continue

      for (const target of targetDefinition.connectors) {
        if (!compatible(source.type, target.type)) continue
        const targetWorld = connectorWorldPosition(object, target)
        const distance = sourceWorld.distanceTo(targetWorld)
        if (distance > maxDistance) continue

        const targetAxis = connectorWorldAxis(object, target)
        const alignment = Math.abs(sourceAxis.dot(targetAxis))
        if (alignment < 0.8) continue

        const score = distance + (1 - alignment) * 0.25
        if (score >= bestScore) continue
        bestScore = score
        best = { source, target, targetObject: object, sourceWorld, targetWorld, distance }
      }
    }
  }

  return best
}

export function applySnap(selected: THREE.Object3D, candidate: SnapCandidate) {
  const currentSource = connectorWorldPosition(selected, candidate.source)
  const currentTarget = connectorWorldPosition(candidate.targetObject, candidate.target)
  const worldDelta = currentTarget.sub(currentSource)

  if (!selected.parent) {
    selected.position.add(worldDelta)
    return
  }

  const parentWorldRotation = selected.parent.getWorldQuaternion(new THREE.Quaternion())
  const localDelta = worldDelta.applyQuaternion(parentWorldRotation.invert())
  selected.position.add(localDelta)
}
