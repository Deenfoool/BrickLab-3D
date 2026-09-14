import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  constraintDofCount,
  summarizePlanDof,
  solveShaftRatios,
  dynamicJointKind,
  jointControlAxes,
} from '../kinematics/solver-v1.js'

test('Kinematics counts only free/limited certified constraint DOF', () => {
  const revolute = { dof:{ tx:{state:'locked'},ty:{state:'locked'},tz:{state:'locked'},rx:{state:'locked'},ry:{state:'free'},rz:{state:'locked'} } }
  const cylindrical = { dof:{ tx:{state:'locked'},ty:{state:'free'},tz:{state:'locked'},rx:{state:'locked'},ry:{state:'free'},rz:{state:'locked'} } }
  assert.equal(constraintDofCount(revolute), 1)
  assert.equal(constraintDofCount(cylindrical), 2)
  const summary = summarizePlanDof({ pass:true, joints:[{constraint:revolute,rule:{kind:'revolute'}},{constraint:cylindrical,rule:{kind:'cylindrical'}}], blockers:[] })
  assert.equal(summary.total, 3)
  assert.equal(summary.byKind.revolute, 1)
  assert.equal(summary.byKind.cylindrical, 2)
})

test('Kinematics propagates deterministic gear ratios from a manual driver', () => {
  const result = solveShaftRatios('a', [
    { id:'g1', kind:'gear', shaftA:'a', shaftB:'b', ratioAB:-2, ratioBA:-.5 },
    { id:'g2', kind:'gear', shaftA:'b', shaftB:'c', ratioAB:-.5, ratioBA:-2 },
  ])
  assert.deepEqual(result.ratios, { a:1, b:-2, c:1 })
  assert.equal(result.conflicts.length, 0)
})

test('Kinematics detects contradictory closed gear loops instead of forcing a pose', () => {
  const result = solveShaftRatios('a', [
    { id:'ab', kind:'gear', shaftA:'a', shaftB:'b', ratioAB:-1, ratioBA:-1 },
    { id:'bc', kind:'gear', shaftA:'b', shaftB:'c', ratioAB:-1, ratioBA:-1 },
    { id:'ca', kind:'gear', shaftA:'c', shaftB:'a', ratioAB:-1, ratioBA:-1 },
  ])
  assert.ok(result.conflicts.length > 0)
})

test('Differential branches remain explicitly under-constrained in deterministic V1 propagation', () => {
  const result = solveShaftRatios('input', [
    { id:'diff-left', kind:'differential', shaftA:'input', shaftB:'left', ratioAB:1, ratioBA:1 },
    { id:'diff-right', kind:'differential', shaftA:'input', shaftB:'right', ratioAB:1, ratioBA:1 },
  ])
  assert.deepEqual(result.ratios, { input:1 })
  assert.equal(result.ambiguous.length, 2)
})

test('Joint control shape follows certified revolute/prismatic/cylindrical semantics', () => {
  assert.equal(dynamicJointKind({rule:{kind:'revolute'}}), 'revolute')
  assert.deepEqual(jointControlAxes({rule:{kind:'revolute'}}), { angle:true, slide:false })
  assert.deepEqual(jointControlAxes({rule:{kind:'prismatic'}}), { angle:false, slide:true })
  assert.deepEqual(jointControlAxes({rule:{kind:'cylindrical'}}), { angle:true, slide:true })
  assert.deepEqual(jointControlAxes({rule:{kind:'fixed'}}), { angle:false, slide:false })
})

test('Production Kinematics is a lazy no-Rapier mode that protects project and V4 graph state', async () => {
  const activation = await readFile(new URL('../kinematics/activation-v1.js', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../kinematics/runtime-v1.js', import.meta.url), 'utf8')
  const lifecycle = await readFile(new URL('../kinematics/lifecycle-guard-v1.js', import.meta.url), 'utf8')
  const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8')

  assert.match(activation, /data\.mode = 'kinematics'/)
  assert.match(activation, /runtime-v1\.js\?v=kinematics-recovery-20260914-v1/)
  assert.match(activation, /lifecycle-guard-v1\.js\?v=kinematics-recovery-20260914-v1/)
  assert.match(activation, /BrickLabKinematics\?\.exit\?\.\(\{ restore:true \}\)/, 'failed activation must defensively restore BUILD')
  assert.match(lifecycle, /rollback\('enter-failed', error\)/)
  assert.match(lifecycle, /core\.exit\(\{ restore:true \}\)/)
  assert.match(lifecycle, /stale-enter-completed-after-exit/)
  assert.match(bootstrap, /kinematics\/activation-v1\.js\?v=/)
  assert.equal((index.match(/bootstrap\.js\?v=[^"']+/g) ?? []).length, 2, 'import map and production script must both reference versioned bootstrap')

  assert.match(runtime, /buildPhysicsPlanV4/)
  assert.match(runtime, /drivetrainSemanticLinksV4/)
  assert.match(runtime, /subsystems\.mechanics\.analyze/)
  assert.match(runtime, /updateEditor'\) return \(\) => undefined/, 'temporary poses must not invalidate the persistent V4 graph')
  assert.match(runtime, /restoreBaseline/)
  assert.match(runtime, /Exit Kinematics before changing or saving the project/)
  assert.match(runtime, /event\.code === 'Tab'/)
  assert.doesNotMatch(runtime, /PhysicsSession|Rapier|createSession\(/, 'KINEMATICS must not start dynamic physics')
  assert.doesNotMatch(runtime, /commitHistory|saveLocal|localStorage\.setItem/, 'temporary kinematic poses must never be persisted')
})
