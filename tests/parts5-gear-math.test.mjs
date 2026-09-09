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
  solveSpurSnap,
} from '../parts5/gear-mesh-math-v1.js'

function spur(teeth, x, y = 0, z = 0) {
  return {
    teeth,
    pitchRadius: gearPitchRadius(teeth),
    center: new THREE.Vector3(x, y, z),
    axis: new THREE.Vector3(0, 1, 0),
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

test('bevel 12T ↔ 20T snap solves one exact shared pitch-cone apex', () => {
  const moving = {
    teeth: 12,
    pitchRadius: gearPitchRadius(12),
    // Close to the valid center (+1.25, 0, +0.75) for this perpendicular pair.
    center: new THREE.Vector3(1.30, 0.05, 0.68),
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
