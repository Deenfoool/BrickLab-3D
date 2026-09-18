import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createBodyDescriptor,
  deterministicId,
  mechanicalVariable,
} from '../mechanics-next/core/model.js'
import { createOwnershipLedger } from '../mechanics-next/core/ownership.js'
import {
  composeDof,
  constraintDof,
  createConstraint,
  dofEntry,
  freeDof,
} from '../mechanics-next/constraints/dof.js'
import { createAssemblyGraph } from '../mechanics-next/topology/assembly-graph.js'
import {
  differentialEquation,
  gearMeshEquation,
  rigidRotationEquation,
} from '../mechanics-next/transmission/equations.js'
import { createKinematicSolver } from '../mechanics-next/solver/kinematic-solver.js'
import { snapshotLegacyV4 } from '../mechanics-next/adapters/legacy-v4-readonly.js'
import {
  frictionPinDynamics,
  mechanicalInterfaceRule,
  TRANSMISSION_SEMANTICS,
} from '../mechanics-next/intelligence/interface-rules.js'

test('deterministic mechanical IDs are stable and namespace-sensitive', () => {
  assert.equal(deterministicId('body', 'a', 1), deterministicId('body', 'a', 1))
  assert.notEqual(deterministicId('body', 'a', 1), deterministicId('endpoint', 'a', 1))
})

test('DOF composition intersects limits instead of overwriting them', () => {
  const base = freeDof()
  base.ry = dofEntry('limited', { limits:[-1, 1] })
  const second = freeDof()
  second.ry = dofEntry('limited', { limits:[-0.25, 2] })

  const result = composeDof(base, second)
  assert.equal(result.valid, true)
  assert.deepEqual(result.dof.ry.limits, [-0.25, 1])
})

test('DOF composition reports incompatible driver and lock', () => {
  const locked = constraintDof('fixed')
  const driven = freeDof()
  driven.ry = dofEntry('driven', { value:2 })

  const result = composeDof(locked, driven)
  assert.equal(result.valid, false)
  assert.equal(result.conflicts[0].reason, 'locked-vs-driven')
})

test('assembly graph collapses only fully rigid constraints into islands', () => {
  const graph = createAssemblyGraph()
  for (const id of ['a', 'b', 'c']) graph.addBody(createBodyDescriptor({ id }))

  graph.addConstraint(createConstraint({
    id:'fixed-ab',
    bodyA:'a',
    bodyB:'b',
    kind:'fixed',
  }))
  graph.addConstraint(createConstraint({
    id:'hinge-bc',
    bodyA:'b',
    bodyB:'c',
    kind:'revolute',
  }))

  assert.deepEqual(graph.rigidIslands(), [['a', 'b'], ['c']])
  assert.deepEqual(graph.component('a'), ['a', 'b', 'c'])
})

test('external gear mesh is solved bidirectionally from a driver', () => {
  const solver = createKinematicSolver()
  solver.addEquation(gearMeshEquation({
    bodyA:'gear20',
    bodyB:'gear12',
    teethA:20,
    teethB:12,
  }))
  solver.setDriver({ id:'mouse', bodyId:'gear20', value:1 })

  const result = solver.solve()
  assert.equal(result.status, 'solved')
  assert.ok(Math.abs(result.values[mechanicalVariable('gear12', 'omega')] + (20 / 12)) < 1e-9)
})

test('rigid shaft coupling lets either attached element drive the other', () => {
  const solver = createKinematicSolver()
  solver.addEquation(rigidRotationEquation({ bodyA:'axle', bodyB:'gear' }))
  solver.setDriver({ id:'drag-gear', bodyId:'gear', value:3 })

  const result = solver.solve()
  assert.equal(result.status, 'solved')
  assert.equal(result.values[mechanicalVariable('axle', 'omega')], 3)
})

test('differential equation solves the third member when two members are known', () => {
  const solver = createKinematicSolver()
  solver.addEquation(differentialEquation({
    carrier:'carrier',
    left:'left',
    right:'right',
  }))
  solver.setDriver({ id:'carrier-driver', bodyId:'carrier', value:10 })
  solver.setDriver({ id:'left-driver', bodyId:'left', value:4 })

  const result = solver.solve()
  assert.equal(result.status, 'solved')
  assert.ok(Math.abs(result.values[mechanicalVariable('right', 'omega')] - 16) < 1e-9)
})

test('differential remains explicitly underdetermined when physics gives only one condition', () => {
  const solver = createKinematicSolver()
  solver.addEquation(differentialEquation({
    carrier:'carrier',
    left:'left',
    right:'right',
  }))
  solver.setDriver({ id:'carrier-driver', bodyId:'carrier', value:10 })

  const result = solver.solve()
  assert.equal(result.status, 'underdetermined')
  assert.equal(result.freeVariables.length, 1)
})

test('incompatible multi-driver requests produce a conflict with equation provenance', () => {
  const solver = createKinematicSolver()
  solver.addEquation(rigidRotationEquation({ id:'shaft-lock', bodyA:'a', bodyB:'b' }))
  solver.setDriver({ id:'motor-a', bodyId:'a', value:10, source:'motor-a' })
  solver.setDriver({ id:'motor-b', bodyId:'b', value:-5, source:'motor-b' })

  const result = solver.solve()
  assert.equal(result.status, 'conflict')
  assert.ok(result.conflicts.length >= 1)
  assert.ok(result.conflicts.some(conflict => conflict.equationIds.includes('shaft-lock')))
})

test('ownership cannot be transferred without migration safety gates', () => {
  const ledger = createOwnershipLedger()
  assert.equal(ledger.owner('kinematics'), 'legacy-v1')
  assert.throws(() => ledger.handoff('kinematics', 'legacy-v1', 'mechanics-next'), /missing checks/)

  ledger.handoff('kinematics', 'legacy-v1', 'mechanics-next', {
    reason:'test handoff',
    checks:{ tests:true, migration:true, diagnostics:true, rollback:true },
  })
  assert.equal(ledger.owner('kinematics'), 'mechanics-next')
})

test('legacy V4 snapshot is immutable and disconnected from live state', () => {
  const records = [{ id:'c1', metadata:{ nested:true } }]
  const provider = {
    systemVersion:'connector-system-v4-test',
    schemaVersion:4,
    mode:'test',
    connectionGraph:{
      list:() => records,
      stats:() => ({ total:records.length }),
    },
  }

  const snapshot = snapshotLegacyV4(provider)
  records[0].metadata.nested = false
  assert.equal(snapshot.connections[0].metadata.nested, true)
  assert.equal(Object.isFrozen(snapshot.connections[0].metadata), true)
})


test('single stud contact remains a revolute clutch until contact composition removes twist', () => {
  const rule = mechanicalInterfaceRule('stud', 'anti-stud')
  assert.equal(rule.kind, 'revolute')
  assert.equal(rule.topology.dof.ry.state, 'free')
  assert.equal(rule.topology.bundleCanBecomeRigid, true)
  assert.equal(rule.dynamics.clutchFriction, true)
})

test('axle in axle-hole is keyed but may slide until an axial stop is present', () => {
  const sliding = mechanicalInterfaceRule('axle', 'axle-hole')
  assert.equal(sliding.kind, 'prismatic')
  assert.equal(sliding.topology.dof.ty.state, 'free')
  assert.equal(sliding.topology.dof.ry.state, 'locked')

  const stopped = mechanicalInterfaceRule('axle', 'axle-hole', { axialLocked:true })
  assert.equal(stopped.topology.dof.ty.state, 'locked')
  assert.equal(stopped.topology.dof.ry.state, 'locked')
})

test('round hole preserves axle rotation and axial slide by default', () => {
  const rule = mechanicalInterfaceRule('axle', 'round-hole')
  assert.equal(rule.kind, 'cylindrical')
  assert.equal(rule.topology.dof.ty.state, 'free')
  assert.equal(rule.topology.dof.ry.state, 'free')
})

test('friction pin changes resistance, not joint topology', () => {
  const friction = frictionPinDynamics({ friction:true })
  const smooth = frictionPinDynamics({ friction:false })
  assert.equal(friction.topologyKind, 'revolute')
  assert.equal(friction.topologicallyFixed, false)
  assert.equal(friction.rotationalResistance, 'high')
  assert.equal(smooth.rotationalResistance, 'low')
})

test('official worm semantics default to non-backdrivable transmission', () => {
  assert.equal(TRANSMISSION_SEMANTICS.worm.defaultBackdrive, false)
  assert.equal(TRANSMISSION_SEMANTICS.worm.evidence.tier, 'A')
})
