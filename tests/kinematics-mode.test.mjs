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
import {
  angularVelocityFromDelta,
  circularDragDegrees,
  decayAngularVelocity,
  linearDragDegrees,
  normalizePointerAngleDelta,
} from '../kinematics/drag-v1.js'

test('Kinematics pointer drag follows the visible rotation direction without wrap jumps', () => {
  assert.ok(Math.abs(normalizePointerAngleDelta(Math.PI * 2 - .1) + .1) < 1e-12)
  assert.ok(circularDragDegrees(0, Math.PI / 2, 1) < 0)
  assert.ok(circularDragDegrees(0, Math.PI / 2, -1) > 0)
  assert.equal(linearDragDegrees(20, 2, 1), 13)
})

test('Kinematics release inertia derives bounded angular velocity and decays smoothly', () => {
  const velocity = angularVelocityFromDelta(12, 16, 0, .42, 1440)
  assert.ok(velocity > 0 && velocity <= 1440)
  const decayed = decayAngularVelocity(velocity, .5, 2.65)
  assert.ok(decayed > 0 && decayed < velocity)
  assert.ok(Math.abs(decayAngularVelocity(-velocity, .5, 2.65) + decayed) < 1e-9)
})

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

test('Production Kinematics is direct-manipulation, inertial and no-Rapier', async () => {
  const activation = await readFile(new URL('../kinematics/activation-v1.js', import.meta.url), 'utf8')
  const runtime = await readFile(new URL('../kinematics/runtime-v1.js', import.meta.url), 'utf8')
  const rackRuntime = await readFile(new URL('../kinematics/rack-pinion-runtime-v1.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../kinematics/kinematics-v1.css', import.meta.url), 'utf8')
  const lifecycle = await readFile(new URL('../kinematics/lifecycle-guard-v1.js', import.meta.url), 'utf8')
  const bootstrap = await readFile(new URL('../bootstrap.js', import.meta.url), 'utf8')
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8')
  const app = await readFile(new URL('../app.js', import.meta.url), 'utf8')
  const editorAdapter = await readFile(new URL('../architecture/editor-adapter-v1.js', import.meta.url), 'utf8')

  assert.match(activation, /dataset\.mode = 'kinematics'/)
  assert.match(activation, /runtime-v1\.js\?v=kinematics-interactive-20260915-v1/)
  assert.match(activation, /kinematics-v1\.css\?v=kinematics-interactive-20260915-v1/)
  assert.match(activation, /lifecycle-guard-v1\.js\?v=kinematics-recovery-20260914-v2/)
  assert.match(activation, /rack-pinion-runtime-v1\.js\?v=kinematics-rack-pinion-20260915-v1/)
  assert.ok(
    activation.indexOf('rack-pinion-runtime-v1.js') < activation.indexOf('await api.enter()'),
    'rack follower must subscribe before the kinematicsenter event fires',
  )
  assert.match(activation, /BrickLabKinematics\?\.exit\?\.\(\{ restore:true \}\)/, 'failed activation must defensively restore BUILD')
  assert.match(activation, /captureKinematicsEscape/, 'activation must own Escape before the project menu')
  assert.match(activation, /kinematicsState = 'entering'/)
  assert.match(activation, /event\.stopImmediatePropagation\(\)/)
  assert.match(activation, /api\.exit\?\.\(\{ restore:true \}\)/)
  const activationOrder = bootstrap.indexOf('./kinematics/activation-v1.js')
  const projectMenuOrder = bootstrap.indexOf('./menu/project-menu-v1.js')
  assert.ok(activationOrder >= 0 && projectMenuOrder > activationOrder, 'Kinematics Escape capture must register before Project Menu capture')
  assert.match(bootstrap, /kinematics\/activation-v1\.js\?v=kinematics-rack-pinion-20260915-v1/)

  assert.match(lifecycle, /rollback\('enter-failed', error\)/)
  assert.match(lifecycle, /core\.exit\(\{ restore:true \}\)/)
  assert.match(lifecycle, /stale-enter-completed-after-exit/)
  assert.match(lifecycle, /Object\.isFrozen\(current\)/)
  assert.match(lifecycle, /mutableFacade\(current\)/)
  assert.doesNotMatch(lifecycle, /new Proxy\(/, 'lifecycle guard itself must never proxy a frozen runtime API')
  assert.equal((index.match(/bootstrap\.js\?v=[^"']+/g) ?? []).length, 2)

  assert.match(runtime, /buildPhysicsPlanV4/)
  assert.match(runtime, /drivetrainSemanticLinksV4/)
  assert.match(runtime, /subsystems\.mechanics\.analyze/)
  assert.match(runtime, /updateEditor'\) return \(\) => undefined/)
  assert.match(runtime, /pickedMechanicalObject/)
  assert.match(runtime, /setPointerCapture/)
  assert.match(runtime, /mechanics\?\.gear \|\| mechanics\?\.shaft \|\| mechanics\?\.wheel/)
  assert.match(runtime, /solveShaftRatios\(driver\.shaftId/)
  assert.match(runtime, /angularVelocityFromDelta/)
  assert.match(runtime, /decayAngularVelocity/)
  assert.match(runtime, /requestAnimationFrame\(frame\)/)
  assert.match(runtime, /entryBaseline = captureBaseline/)
  assert.match(runtime, /baseline = captureBaseline\(objects\(\)\)/, 'switching drivers must rebase from the current temporary pose')
  assert.match(runtime, /restoreEntryBaseline/, 'exit/reset must still restore the original BUILD pose')
  assert.match(runtime, /kinematics-selection-marker/)
  assert.doesNotMatch(runtime, /<section class="kinematics-panel"/)
  assert.doesNotMatch(runtime, /data-kinematics-angle|data-kinematics-driver|renderPanel\(/, 'direct Kinematics must not render control-panel sliders/selects')

  assert.match(rackRuntime, /detectRackPinionMeshesV1/)
  assert.match(rackRuntime, /signedQuaternionDelta/)
  assert.match(rackRuntime, /angleRad \* Number\(mesh\.pitchRadius/)
  assert.match(rackRuntime, /maxTravelStud/)
  assert.match(rackRuntime, /rack-pinion-conflict|kinematicsrackconflict/)
  assert.match(rackRuntime, /bricklab:kinematicsenter/)
  assert.match(rackRuntime, /bricklab:kinematicsexit/)
  assert.doesNotMatch(rackRuntime, /PhysicsSession|Rapier|createSession\(/, 'rack follower must remain deterministic and no-Rapier')
  assert.doesNotMatch(rackRuntime, /commitHistory|saveLocal|localStorage\.setItem/, 'rack follower must not persist temporary motion')

  assert.match(styles, /\.kinematics-selection-marker/)
  assert.doesNotMatch(styles, /\.kinematics-panel\s*\{/)
  assert.match(app, /BrickLabViewportV1/)
  assert.match(editorAdapter, /BrickLabViewportV1\?\.camera/)
  assert.match(runtime, /BrickLabViewportV1\?\.camera/)
  assert.match(runtime, /Exit Kinematics before changing or saving the project/)
  assert.match(runtime, /event\.code === 'Tab'/)
  assert.doesNotMatch(runtime, /PhysicsSession|Rapier|createSession\(/, 'KINEMATICS must not start dynamic physics')
  assert.doesNotMatch(runtime, /commitHistory|saveLocal|localStorage\.setItem/, 'temporary kinematic poses must never be persisted')
})
