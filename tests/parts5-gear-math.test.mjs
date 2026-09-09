import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  GEAR_MODULE_STUD,
  gearMetrics,
  gearPitchRadius,
} from '../parts5/part-geometry-metrics-v1.js'
import {
  evaluateBevelMesh,
  evaluateSpurMesh,
  solveBevelSnap,
  solveSpurPhaseAlignment,
  solveSpurSnap,
} from '../parts5/gear-mesh-math-v1.js'

function spur(teeth, x, y = 0, z = 0, reference = new THREE.Vector3(1, 0, 0)) {
  return {
    teeth,
    pitchRadius: gearPitchRadius(teeth),
    center: new THREE.Vector3(x, y, z),
    axis: new THREE.Vector3(0, 1, 0),
    reference: reference.clone(),
  }
}

test('all spur gears share one module and canonical pitch radius', () => {
  assert.equal(GEAR_MODULE_STUD, 1 / 8)
  for (const teeth of [8, 12, 16, 20, 24, 36, 40]) {
    const metrics = gearMetrics(teeth)
    assert.equal(metrics.teeth, teeth)
    assert.equal(metrics.module, 1 / 8)
    assert.equal(metrics.pitchRadius, teeth / 16)
    assert.equal(gearPitchRadius(teeth), teeth / 16)
    assert.ok(metrics.rootRadius < metrics.pitchRadius)
    assert.ok(metrics.outerRadius > metrics.pitchRadius)
  }
})

for (const [aTeeth, bTeeth] of [[8, 24], [12, 12], [12, 20]]) {
  test(`${aTeeth}T ↔ ${bTeeth}T spur snap lands on exact pitch-circle distance`, () => {
    const fixed = spur(bTeeth, 0)
    const target = gearPitchRadius(aTeeth) + gearPitchRadius(bTeeth)
    const moving = spur(aTeeth, target + 0.19, 0.04, 0.03)
    const solution = solveSpurSnap(moving, fixed, { captureDistance: 0.4 })
    assert.ok(solution)
    assert.ok(solution.error > 0)

    const snapped = { ...moving, center: solution.desiredCenter.clone() }
    const result = evaluateSpurMesh(snapped, fixed, {
      minAlignment: 0.999999,
      axialTolerance: 1e-9,
      distanceTolerance: 1e-9,
    })
    assert.equal(result.valid, true)
    assert.ok(Math.abs(result.centerDistance - target) < 1e-9)
    assert.ok(result.distanceError < 1e-9)
    assert.ok(result.axialOffset < 1e-9)
  })
}

test('spur phase solver turns a tooth-to-tooth contact into tooth-to-gap', () => {
  const fixed = spur(20, 0)
  const target = gearPitchRadius(12) + gearPitchRadius(20)
  const moving = spur(12, target)
  const radial = new THREE.Vector3(1, 0, 0)
  const phase = solveSpurPhaseAlignment(moving, fixed, radial)
  assert.ok(phase)
  assert.ok(Math.abs(Math.abs(phase.correction) - Math.PI / 12) < 1e-9)
  assert.ok(Math.abs(phase.fixedPhase) < 1e-9)
  assert.ok(Math.abs(phase.movingPhaseAfter - 0.5) < 1e-9)
})

test('spur snap carries phase correction from the same contact line', () => {
  const fixed = spur(24, 0)
  const target = gearPitchRadius(8) + gearPitchRadius(24)
  const moving = spur(8, target + 0.12, 0.02, 0.01)
  const solution = solveSpurSnap(moving, fixed, { captureDistance: 0.4 })
  assert.ok(solution)
  assert.ok(solution.phase)
  assert.ok(Number.isFinite(solution.phaseCorrection))
  assert.ok(solution.phaseAxis.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-9)
})

test('bevel 12T ↔ 20T snap solves one exact shared pitch-cone apex', () => {
  const moving = {
    teeth: 12,
    pitchRadius: gearPitchRadius(12),
    center: new THREE.Vector3(1.30, 0.07, 0.02),
    axis: new THREE.Vector3(1, 0, 0),
  }
  const fixed = {
    teeth: 20,
    pitchRadius: gearPitchRadius(20),
    center: new THREE.Vector3(0, 0, 0),
    axis: new THREE.Vector3(0, 0, 1),
  }

  const solution = solveBevelSnap(moving, fixed, { captureDistance: 0.6, maxAxisDot: 1e-9 })
  assert.ok(solution)
  const snapped = { ...moving, center: solution.desiredCenter.clone() }
  const result = evaluateBevelMesh(snapped, fixed, { maxAxisDot: 1e-9, apexTolerance: 1e-9 })
  assert.equal(result.valid, true)
  assert.ok(result.apexError < 1e-9)
  assert.ok(Math.abs(result.centerDistance - Math.hypot(moving.pitchRadius, fixed.pitchRadius)) < 1e-9)
})
