import * as THREE from 'three'
import { findPart } from './parts.js'
import { connectorRule, stageConnectionBundle } from './connections.js'

const STRUCTURAL_CONTACT_TOLERANCE = 0.105
const STRUCTURAL_AXIS_DOT = -0.96

export function connectorWorldPosition(object, connector) {
  object.updateWorldMatrix(true, false)
  return new THREE.Vector3(...connector.position).applyMatrix4(object.matrixWorld)
}

export function connectorWorldAxis(object, connector) {
  const quaternion = object.getWorldQuaternion(new THREE.Quaternion())
  return new THREE.Vector3(...connector.axis).normalize().applyQuaternion(quaternion).normalize()
}

function localReference(axisArray) {
  const axis = new THREE.Vector3(...axisArray).normalize()
  const basis = Math.abs(axis.y) < 0.8 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  return basis.sub(axis.clone().multiplyScalar(basis.dot(axis))).normalize()
}

function connectorWorldReference(object, connector) {
  const quaternion = object.getWorldQuaternion(new THREE.Quaternion())
  return localReference(connector.axis).applyQuaternion(quaternion).normalize()
}

function desiredAxisForRule(sourceAxis, targetAxis, rule) {
  if (rule.axis === 'opposed') return targetAxis.clone().multiplyScalar(-1)
  return sourceAxis.dot(targetAxis) >= 0 ? targetAxis.clone() : targetAxis.clone().multiplyScalar(-1)
}

function signedAngleAround(from, to, axis) {
  const a = from.clone().projectOnPlane(axis).normalize()
  const b = to.clone().projectOnPlane(axis).normalize()
  if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 0
  const cross = a.clone().cross(b)
  return Math.atan2(axis.dot(cross), THREE.MathUtils.clamp(a.dot(b), -1, 1))
}

function snapKeyedTwist(selected, source, targetObject, target, alignedWorldQuaternion, desiredAxis, alignQuaternion) {
  const sourceReference = connectorWorldReference(selected, source).applyQuaternion(alignQuaternion).normalize()
  const targetReference = connectorWorldReference(targetObject, target)
  const angle = signedAngleAround(sourceReference, targetReference, desiredAxis)
  const quarter = Math.PI / 2
  const correction = angle - Math.round(angle / quarter) * quarter
  if (Math.abs(correction) < 1e-6) return alignedWorldQuaternion
  const twist = new THREE.Quaternion().setFromAxisAngle(desiredAxis, correction)
  return twist.multiply(alignedWorldQuaternion)
}

function predictedStructuralContactCount(selected, source, targetObject, target, rule, isAvailable) {
  if (!rule.multiContact) return 1
  const sourceDef = findPart(selected.userData.partId)
  const targetDef = findPart(targetObject.userData.partId)
  if (!sourceDef?.connectors?.length || !targetDef?.connectors?.length) return 1

  const sourceWorld = connectorWorldPosition(selected, source)
  const sourceAxis = connectorWorldAxis(selected, source)
  const targetWorld = connectorWorldPosition(targetObject, target)
  const targetAxis = connectorWorldAxis(targetObject, target)
  const desiredAxis = desiredAxisForRule(sourceAxis, targetAxis, rule)
  const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(sourceAxis, desiredAxis)
  const origin = selected.getWorldPosition(new THREE.Vector3())
  const rotatedPrimary = sourceWorld.clone().sub(origin).applyQuaternion(alignQuaternion).add(origin)
  const translation = targetWorld.clone().sub(rotatedPrimary)

  const targets = targetDef.connectors.filter(connector =>
    connectorRule(source.type, connector.type)?.kind === 'fixed' && isAvailable(targetObject, connector)
  )
  const usedTargets = new Set()
  let matches = 0

  for (const sourceConnector of sourceDef.connectors) {
    if (sourceConnector.type !== source.type || !isAvailable(selected, sourceConnector)) continue
    const currentPosition = connectorWorldPosition(selected, sourceConnector)
    const predictedPosition = currentPosition.sub(origin).applyQuaternion(alignQuaternion).add(origin).add(translation)
    const predictedAxis = connectorWorldAxis(selected, sourceConnector).applyQuaternion(alignQuaternion).normalize()

    let bestIndex = -1
    let bestDistance = Infinity
    for (let index = 0; index < targets.length; index += 1) {
      if (usedTargets.has(index)) continue
      const targetConnector = targets[index]
      const targetPosition = connectorWorldPosition(targetObject, targetConnector)
      const distance = predictedPosition.distanceTo(targetPosition)
      if (distance > STRUCTURAL_CONTACT_TOLERANCE || distance >= bestDistance) continue
      const axisDot = predictedAxis.dot(connectorWorldAxis(targetObject, targetConnector))
      if (axisDot > STRUCTURAL_AXIS_DOT) continue
      bestDistance = distance
      bestIndex = index
    }
    if (bestIndex >= 0) {
      usedTargets.add(bestIndex)
      matches += 1
    }
  }
  return Math.max(1, matches)
}

export function findSnapCandidate(selected, objects, options = {}) {
  if (globalThis.__bricklabMultiTransformActive) return null

  const explicitMaxDistance = typeof options === 'number' ? options : options.maxDistance
  const explicitMinAlignment = typeof options === 'object' ? options.minAlignment : undefined
  const isAvailable = typeof options === 'object' && options.isAvailable ? options.isAvailable : () => true

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
        const rule = connectorRule(source.type, target.type)
        if (!rule) continue

        const targetWorld = connectorWorldPosition(object, target)
        const distance = sourceWorld.distanceTo(targetWorld)
        const maxDistance = explicitMaxDistance ?? rule.captureDistance
        if (distance > maxDistance) continue

        const targetAxis = connectorWorldAxis(object, target)
        const alignment = Math.abs(sourceAxis.dot(targetAxis))
        const minAlignment = explicitMinAlignment ?? rule.minAlignment
        if (alignment < minAlignment) continue

        const contactCount = predictedStructuralContactCount(selected, source, object, target, rule, isAvailable)
        const orientationPenalty = (1 - alignment) * 0.55
        const multiContactBonus = rule.multiContact ? Math.min(0.30, Math.max(0, contactCount - 1) * 0.055) : 0
        const score = distance + orientationPenalty - multiContactBonus

        if (score < bestScore) {
          bestScore = score
          best = {
            source,
            target,
            targetObject: object,
            targetWorld,
            distance,
            alignment,
            rule,
            predictedContactCount: contactCount,
            isAvailable,
          }
        }
      }
    }
  }

  return best
}

export function orientForSnap(selected, candidate) {
  selected.updateWorldMatrix(true, false)
  candidate.targetObject.updateWorldMatrix(true, false)

  const rule = candidate.rule ?? connectorRule(candidate.source.type, candidate.target.type)
  if (!rule) return

  const sourceAxis = connectorWorldAxis(selected, candidate.source)
  const targetAxis = connectorWorldAxis(candidate.targetObject, candidate.target)
  const desiredAxis = desiredAxisForRule(sourceAxis, targetAxis, rule)
  const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(sourceAxis, desiredAxis)
  const worldQuaternion = selected.getWorldQuaternion(new THREE.Quaternion())
  let alignedWorldQuaternion = alignQuaternion.clone().multiply(worldQuaternion)

  if (rule.keyed) {
    alignedWorldQuaternion = snapKeyedTwist(
      selected,
      candidate.source,
      candidate.targetObject,
      candidate.target,
      alignedWorldQuaternion,
      desiredAxis,
      alignQuaternion,
    )
  }

  if (!selected.parent) {
    selected.quaternion.copy(alignedWorldQuaternion)
  } else {
    const parentWorldQuaternion = selected.parent.getWorldQuaternion(new THREE.Quaternion())
    selected.quaternion.copy(parentWorldQuaternion.invert().multiply(alignedWorldQuaternion))
  }
  selected.updateMatrixWorld(true)
}

function collectStructuralContacts(selected, candidate) {
  const rule = candidate.rule ?? connectorRule(candidate.source.type, candidate.target.type)
  if (!rule?.multiContact) return []
  const sourceDef = findPart(selected.userData.partId)
  const targetDef = findPart(candidate.targetObject.userData.partId)
  const isAvailable = candidate.isAvailable ?? (() => true)
  const targets = targetDef.connectors.filter(connector =>
    connectorRule(candidate.source.type, connector.type)?.kind === 'fixed' && isAvailable(candidate.targetObject, connector)
  )
  const usedTargets = new Set()
  const contacts = []

  for (const sourceConnector of sourceDef.connectors) {
    if (sourceConnector.type !== candidate.source.type || !isAvailable(selected, sourceConnector)) continue
    const sourcePosition = connectorWorldPosition(selected, sourceConnector)
    const sourceAxis = connectorWorldAxis(selected, sourceConnector)
    let bestIndex = -1
    let bestDistance = Infinity

    for (let index = 0; index < targets.length; index += 1) {
      if (usedTargets.has(index)) continue
      const targetConnector = targets[index]
      const distance = sourcePosition.distanceTo(connectorWorldPosition(candidate.targetObject, targetConnector))
      if (distance > STRUCTURAL_CONTACT_TOLERANCE || distance >= bestDistance) continue
      const axisDot = sourceAxis.dot(connectorWorldAxis(candidate.targetObject, targetConnector))
      if (axisDot > STRUCTURAL_AXIS_DOT) continue
      bestIndex = index
      bestDistance = distance
    }

    if (bestIndex >= 0) {
      usedTargets.add(bestIndex)
      const targetConnector = targets[bestIndex]
      contacts.push({
        a: {
          instanceId: selected.userData.instanceId,
          connectorId: sourceConnector.id,
          connectorType: sourceConnector.type,
        },
        b: {
          instanceId: candidate.targetObject.userData.instanceId,
          connectorId: targetConnector.id,
          connectorType: targetConnector.type,
        },
      })
    }
  }
  return contacts
}

export function applySnap(selected, candidate) {
  const currentSource = connectorWorldPosition(selected, candidate.source)
  const currentTarget = connectorWorldPosition(candidate.targetObject, candidate.target)
  const worldDelta = currentTarget.sub(currentSource)

  if (!selected.parent) {
    selected.position.add(worldDelta)
  } else {
    const parentRotation = selected.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
    selected.position.add(worldDelta.applyQuaternion(parentRotation))
  }
  selected.updateMatrixWorld(true)

  const contacts = collectStructuralContacts(selected, candidate)
  if (contacts.length) {
    candidate.contactCount = contacts.length
    stageConnectionBundle(selected, candidate.source, candidate.targetObject, candidate.target, contacts)
  }
}
