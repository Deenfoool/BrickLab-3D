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
import { solveConstraintBundle } from '../mechanics-next/constraints/bundle-solver.js'
import {
  differentialEquation,
  gearMeshEquation,
  rigidRotationEquation,
} from '../mechanics-next/transmission/equations.js'
import { createKinematicSolver } from '../mechanics-next/solver/kinematic-solver.js'
import { legacyV4ConnectorToEndpoint, snapshotLegacyV4 } from '../mechanics-next/adapters/legacy-v4-readonly.js'
import {
  frictionPinDynamics,
  mechanicalInterfaceRule,
  TRANSMISSION_SEMANTICS,
} from '../mechanics-next/intelligence/interface-rules.js'
import { classifyEndpointSemantics, enrichEndpointSemantics } from '../mechanics-next/intelligence/endpoint-semantics.js'
import { buildMechanicalFingerprint } from '../mechanics-next/intelligence/fingerprint.js'
import { createPartMechanicalDescriptor, instantiatePartMechanicalDescriptor } from '../mechanics-next/intelligence/part-descriptor.js'

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


test('two separated revolute contacts between the same bodies become rigid geometrically', () => {
  const a = createConstraint({
    id:'pin-a',
    bodyA:'beam-a',
    bodyB:'beam-b',
    kind:'revolute',
    referenceFrame:{ position:[0,0,0], axis:[0,1,0] },
  })
  const b = createConstraint({
    id:'pin-b',
    bodyA:'beam-a',
    bodyB:'beam-b',
    kind:'revolute',
    referenceFrame:{ position:[1,0,0], axis:[0,1,0] },
  })

  const bundle = solveConstraintBundle([a, b])
  assert.equal(bundle.rigid, true)
  assert.equal(bundle.remainingDof, 0)
})

test('two coaxial revolute contacts preserve one rotational DOF', () => {
  const a = createConstraint({
    id:'hinge-a',
    bodyA:'a',
    bodyB:'b',
    kind:'revolute',
    referenceFrame:{ position:[0,0,0], axis:[0,1,0] },
  })
  const b = createConstraint({
    id:'hinge-b',
    bodyA:'a',
    bodyB:'b',
    kind:'revolute',
    referenceFrame:{ position:[0,2,0], axis:[0,1,0] },
  })

  const bundle = solveConstraintBundle([a, b])
  assert.equal(bundle.rigid, false)
  assert.equal(bundle.remainingDof, 1)
  assert.equal(bundle.kind, 'revolute')
})

test('two separated spherical joints reduce to a revolute axis instead of fixed', () => {
  const a = createConstraint({
    id:'ball-a',
    bodyA:'a',
    bodyB:'b',
    kind:'spherical',
    referenceFrame:{ position:[0,0,0] },
  })
  const b = createConstraint({
    id:'ball-b',
    bodyA:'a',
    bodyB:'b',
    kind:'spherical',
    referenceFrame:{ position:[0,2,0] },
  })

  const bundle = solveConstraintBundle([a, b])
  assert.equal(bundle.remainingDof, 1)
  assert.equal(bundle.kind, 'revolute')
})

test('assembly graph uses contact bundles when deciding rigid islands', () => {
  const graph = createAssemblyGraph()
  graph.addBody(createBodyDescriptor({ id:'beam-a' }))
  graph.addBody(createBodyDescriptor({ id:'beam-b' }))
  graph.addConstraint(createConstraint({
    id:'pin-a',
    bodyA:'beam-a',
    bodyB:'beam-b',
    kind:'revolute',
    referenceFrame:{ position:[0,0,0], axis:[0,1,0] },
  }))
  graph.addConstraint(createConstraint({
    id:'pin-b',
    bodyA:'beam-a',
    bodyB:'beam-b',
    kind:'revolute',
    referenceFrame:{ position:[1,0,0], axis:[0,1,0] },
  }))
  assert.deepEqual(graph.rigidIslands(), [['beam-a','beam-b']])
})

test('normalized A6 connector is independently recognized as Technic axle', () => {
  const raw = {
    endpointId:'axle-main',
    family:'cylinder',
    gender:'male',
    frame:{ positionLdu:[0,0,0], orientation:[1,0,0,0,1,0,0,0,1] },
    geometry:{
      centered:true,
      caps:'none',
      sections:[{ shape:'A', radiusLdu:6, lengthLdu:40, elastic:false }],
    },
    snap:{ slide:true },
  }
  const endpoint = enrichEndpointSemantics(legacyV4ConnectorToEndpoint(raw, {
    bodyId:'template',
    partId:'ldraw-test',
  }))
  assert.equal(classifyEndpointSemantics(endpoint).semanticKind, 'technic-axle')
})

test('mechanical fingerprint is stable regardless of endpoint input order', () => {
  const endpoints = [
    enrichEndpointSemantics(legacyV4ConnectorToEndpoint({
      endpointId:'a', family:'sphere', gender:'male',
      frame:{ positionLdu:[0,0,0], orientation:[1,0,0,0,1,0,0,0,1] },
      geometry:{ radiusLdu:10 }, snap:{},
    }, { bodyId:'t', partId:'p' })),
    enrichEndpointSemantics(legacyV4ConnectorToEndpoint({
      endpointId:'b', family:'sphere', gender:'female',
      frame:{ positionLdu:[0,20,0], orientation:[1,0,0,0,1,0,0,0,1] },
      geometry:{ radiusLdu:10 }, snap:{},
    }, { bodyId:'t', partId:'p' })),
  ]
  const classification = {
    role:'ball-joint',
    bodyPolicy:'rigid-atomic',
    properties:{},
  }
  assert.equal(
    buildMechanicalFingerprint({ classification, endpoints }).id,
    buildMechanicalFingerprint({ classification, endpoints:[...endpoints].reverse() }).id,
  )
})

test('part intelligence recognizes the differential and keeps it as a rigid atomic housing part', () => {
  const descriptor = createPartMechanicalDescriptor({
    observation:{
      id:'ldraw-diff',
      name:'Technic Differential with One Gear 28 Tooth Bevel',
      description:'Technic Differential with One Gear 28 Tooth Bevel',
      category:'Technic',
      tags:[],
      ldraw:{ code:'diff-test', file:'diff-test.dat' },
    },
    endpoints:[],
  })
  assert.equal(descriptor.classification.role, 'differential')
  assert.equal(descriptor.classification.properties.toothCount, 28)
  assert.equal(descriptor.bodyPolicy, 'rigid-atomic')
  assert.ok(descriptor.transmissionHints.some(hint => hint.equationFamily === 'gear-mesh' && hint.toothCount === 28))
  assert.ok(descriptor.transmissionHints.some(hint => hint.equationFamily === 'three-port-differential'))
})

test('20 tooth double bevel gear gets gear transmission semantics without a part-ID rule', () => {
  const descriptor = createPartMechanicalDescriptor({
    observation:{
      id:'ldraw-gear20',
      name:'Technic Gear 20 Tooth Double Bevel Reinforced',
      description:'Technic Gear 20 Tooth Double Bevel Reinforced',
      category:'Technic',
      tags:[],
      ldraw:{ code:'unknown-revision', file:'unknown-revision.dat' },
    },
    endpoints:[],
  })
  assert.equal(descriptor.classification.role, 'bevel-gear')
  assert.equal(descriptor.classification.properties.toothCount, 20)
  assert.equal(descriptor.transmissionHints[0].kind, 'bevel-gear')
})

test('part instance IDs and endpoint IDs remain deterministic across reload', () => {
  const raw = {
    endpointId:'axle-hole',
    family:'cylinder',
    gender:'female',
    frame:{ positionLdu:[0,0,0], orientation:[1,0,0,0,1,0,0,0,1] },
    geometry:{ centered:true, caps:'none', sections:[{ shape:'A', radiusLdu:6, lengthLdu:20 }] },
    snap:{ slide:true },
  }
  const templateEndpoint = legacyV4ConnectorToEndpoint(raw, { bodyId:'template', partId:'gear' })
  const descriptor = createPartMechanicalDescriptor({
    observation:{ id:'gear', name:'Technic Gear 12 Tooth Bevel', category:'Technic', tags:[] },
    endpoints:[templateEndpoint],
  })
  const first = instantiatePartMechanicalDescriptor(descriptor, { instanceId:'instance-123' })
  const second = instantiatePartMechanicalDescriptor(descriptor, { instanceId:'instance-123' })
  assert.equal(first.body.id, second.body.id)
  assert.equal(first.endpoints[0].id, second.endpoints[0].id)
  assert.equal(first.endpoints[0].metadata.semantics.semanticKind, 'technic-axle-hole')
})


test('diffhouse context does not turn an internal bevel gear into a differential body', () => {
  const endpoint = legacyV4ConnectorToEndpoint({
    endpointId:'diff-seat',
    family:'generic',
    gender:'male',
    group:'diffhouse',
    frame:{ positionLdu:[0,0,0], orientation:[1,0,0,0,1,0,0,0,1] },
    geometry:{},
    snap:{ match:'group', placement:'aligned' },
  }, { bodyId:'template', partId:'gear12' })

  const descriptor = createPartMechanicalDescriptor({
    observation:{
      id:'gear12',
      name:'Technic Gear 12 Tooth Bevel',
      description:'Technic Gear 12 Tooth Bevel',
      category:'Technic',
      tags:[],
    },
    endpoints:[endpoint],
  })

  assert.equal(descriptor.classification.role, 'bevel-gear')
  assert.equal(descriptor.classification.properties.toothCount, 12)
  assert.ok(descriptor.classification.contexts.includes('differential'))
})
