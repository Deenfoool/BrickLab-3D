import * as THREE from 'three'

export const GEAR_MESH_MATH_VERSION = 'gear-mesh-math-v1'

function stablePerpendicular(axis) {
  const basis = Math.abs(axis.y) < 0.82 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  return basis.sub(axis.clone().multiplyScalar(basis.dot(axis))).normalize()
}

function normalizedAxis(value) {
  return value.clone().normalize()
}

export function evaluateSpurMesh(a, b, options = {}) {
  const axisA = normalizedAxis(a.axis)
  const axisB = normalizedAxis(b.axis)
  const axisDot = axisA.dot(axisB)
  const axisAlignment = Math.abs(axisDot)
  const minAlignment = options.minAlignment ?? options.axisTolerance ?? 0.985
  const delta = b.center.clone().sub(a.center)
  const axialOffset = Math.abs(delta.dot(axisA))
  const radialVector = delta.clone().sub(axisA.clone().multiplyScalar(delta.dot(axisA)))
  const centerDistance = radialVector.length()
  const targetDistance = a.pitchRadius + b.pitchRadius
  const distanceError = Math.abs(centerDistance - targetDistance)
  const axialTolerance = options.axialTolerance ?? 0.16
  const distanceTolerance = options.distanceTolerance ?? 0.08

  return {
    kind: 'spur',
    axisDot,
    axisAlignment,
    axialOffset,
    centerDistance,
    targetDistance,
    distanceError,
    radialVector,
    compatibleAxes: axisAlignment >= minAlignment,
    valid: axisAlignment >= minAlignment && axialOffset <= axialTolerance && distanceError <= distanceTolerance,
  }
}

export function solveSpurSnap(moving, fixed, options = {}) {
  const axisA = normalizedAxis(moving.axis)
  const axisB = normalizedAxis(fixed.axis)
  const axisAlignment = Math.abs(axisA.dot(axisB))
  const minAlignment = options.minAlignment ?? 0.965
  if (axisAlignment < minAlignment) return null

  const targetDistance = moving.pitchRadius + fixed.pitchRadius
  const delta = moving.center.clone().sub(fixed.center)
  let radial = delta.clone().sub(axisB.clone().multiplyScalar(delta.dot(axisB)))
  if (radial.lengthSq() < 1e-8) radial = stablePerpendicular(axisB)
  else radial.normalize()

  const desiredCenter = fixed.center.clone().addScaledVector(radial, targetDistance)
  const translation = desiredCenter.clone().sub(moving.center)
  const error = translation.length()
  const captureDistance = options.captureDistance ?? Math.max(0.24, Math.min(0.48, targetDistance * 0.22))
  if (error > captureDistance) return null

  const contactPoint = fixed.center.clone().addScaledVector(radial, fixed.pitchRadius)
  return {
    kind: 'spur',
    desiredCenter,
    translation,
    error,
    captureDistance,
    axisAlignment,
    targetDistance,
    contactPoint,
    radialDirection: radial,
  }
}

export function evaluateBevelMesh(a, b, options = {}) {
  const axisA = normalizedAxis(a.axis)
  const axisB = normalizedAxis(b.axis)
  const axisDot = axisA.dot(axisB)
  const axisOrthogonality = Math.abs(axisDot)
  const maxAxisDot = options.maxAxisDot ?? options.bevelAxisDotTolerance ?? 0.12

  let best = null
  for (const signA of [-1, 1]) {
    const apexA = a.center.clone().addScaledVector(axisA, signA * b.pitchRadius)
    for (const signB of [-1, 1]) {
      const apexB = b.center.clone().addScaledVector(axisB, signB * a.pitchRadius)
      const apexError = apexA.distanceTo(apexB)
      if (!best || apexError < best.apexError) best = { signA, signB, apexA, apexB, apexError }
    }
  }

  const tolerance = options.apexTolerance ?? options.bevelApexTolerance ?? 0.08
  const targetDistance = Math.hypot(a.pitchRadius, b.pitchRadius)
  return {
    kind: 'bevel',
    axisDot,
    axisOrthogonality,
    targetDistance,
    centerDistance: a.center.distanceTo(b.center),
    ...best,
    compatibleAxes: axisOrthogonality <= maxAxisDot,
    valid: axisOrthogonality <= maxAxisDot && Boolean(best) && best.apexError <= tolerance,
  }
}

export function solveBevelSnap(moving, fixed, options = {}) {
  const axisA = normalizedAxis(moving.axis)
  const axisB = normalizedAxis(fixed.axis)
  const axisOrthogonality = Math.abs(axisA.dot(axisB))
  const maxAxisDot = options.maxAxisDot ?? 0.18
  if (axisOrthogonality > maxAxisDot) return null

  let best = null
  for (const signA of [-1, 1]) {
    for (const signB of [-1, 1]) {
      const apex = fixed.center.clone().addScaledVector(axisB, signB * moving.pitchRadius)
      const desiredCenter = apex.clone().addScaledVector(axisA, -signA * fixed.pitchRadius)
      const translation = desiredCenter.clone().sub(moving.center)
      const error = translation.length()
      if (!best || error < best.error) best = { signA, signB, apex, desiredCenter, translation, error }
    }
  }

  const captureDistance = options.captureDistance ?? Math.max(0.28, Math.min(0.52, Math.hypot(moving.pitchRadius, fixed.pitchRadius) * 0.24))
  if (!best || best.error > captureDistance) return null

  return {
    kind: 'bevel',
    ...best,
    captureDistance,
    axisOrthogonality,
    targetDistance: Math.hypot(moving.pitchRadius, fixed.pitchRadius),
    contactPoint: best.apex.clone(),
  }
}
