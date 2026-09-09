import * as THREE from 'three'
import { findPart } from './parts.js'
import { connectorRule, stageConnectionBundle, suppressNextConnectionForEndpoint } from './connections.js'
import { solveBevelSnap, solveSpurSnap } from './parts5/gear-mesh-math-v1.js'

let stickyKey = ''
let lastGearEventKey = ''

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

function gearWorldReference(object, axis) {
  const quaternion = object.getWorldQuaternion(new THREE.Quaternion())
  let reference = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).projectOnPlane(axis)
  if (reference.lengthSq() < 1e-8) {
    const basis = Math.abs(axis.y) < 0.8 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
    reference = basis.sub(axis.clone().multiplyScalar(basis.dot(axis)))
  }
  return reference.normalize()
}

function desiredAxisForRule(sourceAxis, targetAxis, rule) {
  if (rule.axis === 'opposed') return targetAxis.clone().multiplyScalar(-1)
  return sourceAxis.dot(targetAxis) >= 0 ? targetAxis.clone() : targetAxis.clone().multiplyScalar(-1)
}

function signedAngleAround(from, to, axis) {
  const a = from.clone().projectOnPlane(axis)
  const b = to.clone().projectOnPlane(axis)
  if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 0
  a.normalize()
  b.normalize()
  const cross = a.clone().cross(b)
  return Math.atan2(axis.dot(cross), THREE.MathUtils.clamp(a.dot(b), -1, 1))
}

function keyedTwist(selected, source, targetObject, target, alignedWorldQuaternion, desiredAxis, alignQuaternion, step) {
  const sourceReference = connectorWorldReference(selected, source).applyQuaternion(alignQuaternion).normalize()
  const targetReference = connectorWorldReference(targetObject, target)
  const angle = signedAngleAround(sourceReference, targetReference, desiredAxis)
  const symmetryStep = step || Math.PI / 2
  const correction = angle - Math.round(angle / symmetryStep) * symmetryStep
  if (Math.abs(correction) < 1e-6) return alignedWorldQuaternion
  return new THREE.Quaternion().setFromAxisAngle(desiredAxis, correction).multiply(alignedWorldQuaternion)
}

function structuralTolerance(rule) {
  return rule.contactTolerance ?? 0.105
}

function structuralAxisLimit(rule) {
  return -(rule.contactAlignment ?? 0.96)
}

function predictedContactCount(selected, source, targetObject, target, rule, isAvailable) {
  if (!rule.multiContact) return 1
  const sourceDef = findPart(selected.userData.partId)
  const targetDef = findPart(targetObject.userData.partId)
  if (!sourceDef?.connectors?.length || !targetDef?.connectors?.length) return 1

  const sourceWorld = connectorWorldPosition(selected, source)
  const sourceAxis = connectorWorldAxis(selected, source)
  const targetWorld = connectorWorldPosition(targetObject, target)
  const targetAxis = connectorWorldAxis(targetObject, target)
  const desiredAxis = desiredAxisForRule(sourceAxis, targetAxis, rule)
  const rotation = new THREE.Quaternion().setFromUnitVectors(sourceAxis, desiredAxis)
  const origin = selected.getWorldPosition(new THREE.Vector3())
  const rotatedPrimary = sourceWorld.clone().sub(origin).applyQuaternion(rotation).add(origin)
  const translation = targetWorld.clone().sub(rotatedPrimary)
  const targetConnectors = targetDef.connectors.filter(connector =>
    connectorRule(source.type, connector.type)?.kind === 'fixed' && isAvailable(targetObject, connector)
  )
  const usedTargets = new Set()
  let matches = 0

  for (const sourceConnector of sourceDef.connectors) {
    if (sourceConnector.type !== source.type || !isAvailable(selected, sourceConnector)) continue
    const predictedPosition = connectorWorldPosition(selected, sourceConnector)
      .sub(origin).applyQuaternion(rotation).add(origin).add(translation)
    const predictedAxis = connectorWorldAxis(selected, sourceConnector).applyQuaternion(rotation).normalize()
    let bestIndex = -1
    let bestDistance = Infinity

    for (let index = 0; index < targetConnectors.length; index += 1) {
      if (usedTargets.has(index)) continue
      const targetConnector = targetConnectors[index]
      const distance = predictedPosition.distanceTo(connectorWorldPosition(targetObject, targetConnector))
      if (distance > structuralTolerance(rule) || distance >= bestDistance) continue
      const axisDot = predictedAxis.dot(connectorWorldAxis(targetObject, targetConnector))
      if (axisDot > structuralAxisLimit(rule)) continue
      bestIndex = index
      bestDistance = distance
    }

    if (bestIndex >= 0) {
      usedTargets.add(bestIndex)
      matches += 1
    }
  }
  return Math.max(1, matches)
}

function candidateKey(selected, source, targetObject, target) {
  return `${selected.userData.instanceId}:${source.id}>${targetObject.userData.instanceId}:${target.id}`
}

function gearDescriptor(object) {
  const definition = findPart(object?.userData?.partId)
  const gear = definition?.mechanics?.gear
  if (!gear) return null
  const connector = definition.connectors?.find(item => item.type === 'axle-hole')
  if (!connector) return null
  const axis = connectorWorldAxis(object, connector)
  return {
    object,
    definition,
    connector,
    kind: gear.kind ?? 'spur',
    teeth: Number(gear.teeth) || 0,
    pitchRadius: Number(gear.pitchRadius) || (Number(gear.teeth) || 0) / 16,
    center: connectorWorldPosition(object, connector),
    axis,
    reference: gearWorldReference(object, axis),
  }
}

function findGearSnapCandidate(selected, objects) {
  const moving = gearDescriptor(selected)
  if (!moving) return null

  let best = null
  let bestScore = Infinity
  for (const targetObject of objects) {
    if (targetObject === selected) continue
    const fixed = gearDescriptor(targetObject)
    if (!fixed || fixed.kind !== moving.kind || !moving.teeth || !fixed.teeth) continue

    const solution = moving.kind === 'bevel'
      ? solveBevelSnap(moving, fixed)
      : solveSpurSnap(moving, fixed)
    if (!solution) continue

    const axisPenalty = moving.kind === 'bevel'
      ? solution.axisOrthogonality / 0.18
      : (1 - solution.axisAlignment) / 0.035
    const score = solution.error / Math.max(solution.captureDistance, 1e-6) + Math.max(0, axisPenalty) * 0.08 - 0.10
    if (score >= bestScore) continue

    const key = `gear-mesh:${selected.userData.instanceId}>${targetObject.userData.instanceId}`
    bestScore = score
    best = {
      kind: 'gear-mesh',
      gearKind: moving.kind,
      source: moving.connector,
      target: fixed.connector,
      targetObject,
      targetWorld: solution.contactPoint.clone(),
      desiredCenter: solution.desiredCenter.clone(),
      translation: solution.translation.clone(),
      distance: solution.error,
      alignment: moving.kind === 'bevel' ? 1 - solution.axisOrthogonality : solution.axisAlignment,
      score,
      key,
      movingGear: moving,
      fixedGear: fixed,
      meshSolution: solution,
      ratio: fixed.teeth ? moving.teeth / fixed.teeth : 0,
      placementOnly: true,
    }
  }
  return best
}

function publishGearCandidate(candidate) {
  const gearCandidate = candidate?.kind === 'gear-mesh' ? candidate : null
  globalThis.__bricklabGearMeshCandidate = gearCandidate
  const key = gearCandidate?.key ?? ''
  if (key === lastGearEventKey) return
  lastGearEventKey = key
  window.dispatchEvent(new CustomEvent('bricklab:gearmeshcandidate', {
    detail: gearCandidate ? {
      key,
      kind: gearCandidate.gearKind,
      movingId: gearCandidate.movingGear.object.userData.instanceId,
      movingPartId: gearCandidate.movingGear.object.userData.partId,
      movingTeeth: gearCandidate.movingGear.teeth,
      fixedId: gearCandidate.fixedGear.object.userData.instanceId,
      fixedPartId: gearCandidate.fixedGear.object.userData.partId,
      fixedTeeth: gearCandidate.fixedGear.teeth,
      errorStud: gearCandidate.distance,
      targetDistanceStud: gearCandidate.meshSolution.targetDistance,
      ratio: gearCandidate.ratio,
      phaseCorrectionRad: gearCandidate.meshSolution.phaseCorrection ?? 0,
    } : null,
  }))
}

export function findSnapCandidate(selected, objects, options = {}) {
  if (globalThis.__bricklabMultiTransformActive) return null
  const isAvailable = typeof options === 'object' && options.isAvailable ? options.isAvailable : () => true
  const explicitMaxDistance = typeof options === 'number' ? options : options.maxDistance
  const explicitMinAlignment = typeof options === 'object' ? options.minAlignment : undefined
  const sourceDef = findPart(selected.userData.partId)
  if (!sourceDef?.connectors?.length) return null

  let best = null
  let bestScore = Infinity

  for (const source of sourceDef.connectors) {
    if (!isAvailable(selected, source)) continue
    const sourcePosition = connectorWorldPosition(selected, source)
    const sourceAxis = connectorWorldAxis(selected, source)

    for (const object of objects) {
      if (object === selected) continue
      const targetDef = findPart(object.userData.partId)
      if (!targetDef?.connectors?.length) continue

      for (const target of targetDef.connectors) {
        if (!isAvailable(object, target)) continue
        const rule = connectorRule(source.type, target.type)
        if (!rule) continue

        const maxDistance = explicitMaxDistance ?? rule.captureDistance
        const distance = sourcePosition.distanceTo(connectorWorldPosition(object, target))
        if (distance > maxDistance) continue

        const alignment = Math.abs(sourceAxis.dot(connectorWorldAxis(object, target)))
        const minAlignment = explicitMinAlignment ?? rule.minAlignment
        if (alignment < minAlignment) continue

        const contacts = predictedContactCount(selected, source, object, target, rule, isAvailable)
        const distanceScore = distance / Math.max(maxDistance, 1e-6)
        const alignmentRange = Math.max(1e-4, 1 - minAlignment)
        const alignmentScore = (1 - alignment) / alignmentRange
        const contactBonus = rule.multiContact ? Math.min(0.12, Math.max(0, contacts - 1) * 0.018) : 0
        const key = candidateKey(selected, source, object, target)
        const stickyBonus = key === stickyKey ? 0.035 : 0
        const score = distanceScore + alignmentScore * 0.16 - contactBonus - stickyBonus

        if (score < bestScore) {
          bestScore = score
          best = {
            source,
            target,
            targetObject: object,
            targetWorld: connectorWorldPosition(object, target),
            distance,
            alignment,
            rule,
            predictedContactCount: contacts,
            isAvailable,
            key,
            score,
          }
        }
      }
    }
  }

  const gearCandidate = findGearSnapCandidate(selected, objects)
  if (gearCandidate && gearCandidate.score < bestScore) {
    best = gearCandidate
    bestScore = gearCandidate.score
  }

  stickyKey = best?.key ?? ''
  publishGearCandidate(best)
  return best
}

export function orientForSnap(selected, candidate) {
  if (candidate?.kind === 'gear-mesh') return
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
    alignedWorldQuaternion = keyedTwist(
      selected,
      candidate.source,
      candidate.targetObject,
      candidate.target,
      alignedWorldQuaternion,
      desiredAxis,
      alignQuaternion,
      rule.twistStep,
    )
  }

  if (!selected.parent) selected.quaternion.copy(alignedWorldQuaternion)
  else {
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
      if (distance > structuralTolerance(rule) || distance >= bestDistance) continue
      const axisDot = sourceAxis.dot(connectorWorldAxis(candidate.targetObject, targetConnector))
      if (axisDot > structuralAxisLimit(rule)) continue
      bestIndex = index
      bestDistance = distance
    }

    if (bestIndex >= 0) {
      usedTargets.add(bestIndex)
      const targetConnector = targets[bestIndex]
      contacts.push({
        a: { instanceId: selected.userData.instanceId, connectorId: sourceConnector.id, connectorType: sourceConnector.type },
        b: { instanceId: candidate.targetObject.userData.instanceId, connectorId: targetConnector.id, connectorType: targetConnector.type },
      })
    }
  }
  return contacts
}

function applyWorldDelta(selected, worldDelta) {
  if (!selected.parent) selected.position.add(worldDelta)
  else {
    const parentRotation = selected.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
    selected.position.add(worldDelta.applyQuaternion(parentRotation))
  }
  selected.updateMatrixWorld(true)
}

function applyWorldAxisRotation(selected, worldAxis, angle) {
  if (!worldAxis || !Number.isFinite(angle) || Math.abs(angle) < 1e-7) return
  const delta = new THREE.Quaternion().setFromAxisAngle(worldAxis.clone().normalize(), angle)
  const worldQuaternion = selected.getWorldQuaternion(new THREE.Quaternion())
  const nextWorldQuaternion = delta.multiply(worldQuaternion)

  if (!selected.parent) selected.quaternion.copy(nextWorldQuaternion)
  else {
    const parentWorldQuaternion = selected.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
    selected.quaternion.copy(parentWorldQuaternion.multiply(nextWorldQuaternion))
  }
  selected.updateMatrixWorld(true)
}

export function applySnap(selected, candidate) {
  if (candidate?.kind === 'gear-mesh') {
    applyWorldDelta(selected, candidate.translation.clone())
    if (candidate.gearKind === 'spur') {
      applyWorldAxisRotation(
        selected,
        candidate.meshSolution.phaseAxis,
        candidate.meshSolution.phaseCorrection ?? 0,
      )
    }
    suppressNextConnectionForEndpoint(selected.userData.instanceId, candidate.source.id)
    window.dispatchEvent(new CustomEvent('bricklab:gearmeshsnap', {
      detail: {
        kind: candidate.gearKind,
        movingPartId: candidate.movingGear.object.userData.partId,
        movingTeeth: candidate.movingGear.teeth,
        fixedPartId: candidate.fixedGear.object.userData.partId,
        fixedTeeth: candidate.fixedGear.teeth,
        targetDistanceStud: candidate.meshSolution.targetDistance,
        finalErrorStud: 0,
        ratio: candidate.ratio,
        phaseAligned: candidate.gearKind === 'spur',
        phaseCorrectionRad: candidate.meshSolution.phaseCorrection ?? 0,
      },
    }))
    globalThis.__bricklabLastGearMeshSnap = {
      version: 'parts-5-gear-mesh-snap-v2',
      kind: candidate.gearKind,
      movingPartId: candidate.movingGear.object.userData.partId,
      fixedPartId: candidate.fixedGear.object.userData.partId,
      movingTeeth: candidate.movingGear.teeth,
      fixedTeeth: candidate.fixedGear.teeth,
      targetDistanceStud: candidate.meshSolution.targetDistance,
      phaseAligned: candidate.gearKind === 'spur',
      phaseCorrectionRad: candidate.meshSolution.phaseCorrection ?? 0,
    }
    return
  }

  const currentSource = connectorWorldPosition(selected, candidate.source)
  const currentTarget = connectorWorldPosition(candidate.targetObject, candidate.target)
  const worldDelta = currentTarget.sub(currentSource)
  applyWorldDelta(selected, worldDelta)

  const contacts = collectStructuralContacts(selected, candidate)
  if (contacts.length) {
    candidate.contactCount = contacts.length
    stageConnectionBundle(selected, candidate.source, candidate.targetObject, candidate.target, contacts)
  }
}
