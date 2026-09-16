import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  rackPinionSurfaceSpeedV1,
  solveRackPinionContactForceV1,
} from '../technic/rack-pinion-physics-math-v1.js'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('rack-pinion surface speed uses pitch radius, stud scale and direction', () => {
  const stud = 0.008
  assert.ok(Math.abs(rackPinionSurfaceSpeedV1(10, 1, stud, 1) - 0.08) < 1e-12)
  assert.ok(Math.abs(rackPinionSurfaceSpeedV1(10, 0.5, stud, -1) + 0.04) < 1e-12)
  assert.equal(rackPinionSurfaceSpeedV1(10, 0, stud, 1), null)
})

test('effective-mass contact force removes slip without crossing through zero', () => {
  const result = solveRackPinionContactForceV1({
    relativeSpeedMps:1,
    inverseEffectiveMassPinion:200,
    inverseEffectiveMassRack:250,
    dt:1 / 120,
    maxForceN:100,
    correctionFraction:0.92,
  })
  assert.ok(result.forceN < 0)
  assert.ok(result.predictedRelativeSpeedMps > 0)
  assert.ok(result.predictedRelativeSpeedMps < 1)
  assert.equal(result.limited, false)

  const reverse = solveRackPinionContactForceV1({
    relativeSpeedMps:-1,
    inverseEffectiveMassPinion:200,
    inverseEffectiveMassRack:250,
    dt:1 / 120,
    maxForceN:100,
    correctionFraction:0.92,
  })
  assert.ok(reverse.forceN > 0)
  assert.ok(reverse.predictedRelativeSpeedMps < 0)
  assert.ok(reverse.predictedRelativeSpeedMps > -1)
})

test('rack-pinion contact force respects the explicit force ceiling', () => {
  const result = solveRackPinionContactForceV1({
    relativeSpeedMps:4,
    inverseEffectiveMassPinion:20,
    inverseEffectiveMassRack:30,
    dt:1 / 120,
    maxForceN:0.5,
    correctionFraction:0.92,
  })
  assert.equal(Math.abs(result.forceN), 0.5)
  assert.equal(result.limited, true)
  assert.ok(result.predictedRelativeSpeedMps > 0)
})

test('SIMULATE rack-pinion runtime stays inside the authoritative physics microstep', async () => {
  const source = await text('technic/rack-pinion-physics-v1.js')
  assert.match(source, /addForceAtPoint/)
  assert.match(source, /effectiveInverseMassAtPoint/)
  assert.match(source, /rack-not-prismatic-guided/)
  assert.match(source, /session\.prismaticJoints/)
  assert.match(source, /session\.connectorV4Physics\?\.monitors/)
  assert.match(source, /mesh-disengaged/)
  assert.doesNotMatch(source, /world\.step\s*\(/)
  assert.doesNotMatch(source, /setLinvel|setAngvel|createImpulseJoint/)
})

test('Connector V4 guide installation happens before rack-pinion rescan', async () => {
  const guard = await text('connectors-v4/physics-guard-v4.js')
  const v4Install = guard.indexOf('installConnectorPhysicsV4(session, plan, v4)')
  const rackInstall = guard.indexOf('installRackPinionPhysicsV1(session, { force:true })')
  assert.ok(v4Install >= 0)
  assert.ok(rackInstall > v4Install)
})

test('rack detector exports the full moving contact frame for physics validation', async () => {
  const detector = await text('technic/rack-pinion-detect-v1.js')
  assert.match(detector, /pinionCenterWorld/)
  assert.match(detector, /rackPitchOriginWorld/)
  assert.match(detector, /rackNormalWorld/)
  assert.match(detector, /rackWidthAxisWorld/)
})

test('rack-pinion capability advertises guided simulation but keeps arbitrary LDraw fail-closed', async () => {
  const capabilities = await import('../technic/capabilities-v1.js')
  const rack = capabilities.technicCapabilityV1('rack-pinion')
  assert.equal(rack.simulate, 'active')
  assert.equal(rack.arbitraryLDraw, 'semantic')
  assert.match(rack.source, /guided Rapier pitch-contact coupling/)
})
