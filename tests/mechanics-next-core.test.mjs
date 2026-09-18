import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createBodyDescriptor,
  createEndpointDescriptor,
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
  differentialSpiderEquation,
  driverEquation,
  gearMeshEquation,
  rigidRotationEquation,
  screwLinearEquation,
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
import { createShadowConnectionInterpreter, interpretObservedConnection } from '../mechanics-next/intelligence/connection-interpreter.js'
import { expandGrid, parseCylinderSections, parseLdcadShadowText } from '../mechanics-next/ldraw/ldcad-parser.js'
import { ldcadConnectorToEndpoint } from '../mechanics-next/ldraw/connector-adapter.js'
import { createNativeShadowResolver } from '../mechanics-next/ldraw/shadow-resolver.js'
import { compareNativeToLegacyConnectivity, ConnectivityParityLedger } from '../mechanics-next/diagnostics/native-v4-parity.js'
import { inheritancePolicyForChild, parseLDrawHeader, parseType1References } from '../mechanics-next/ldraw/official-parser.js'
import { createNativeLDrawInheritanceResolver } from '../mechanics-next/ldraw/official-inheritance.js'
import { solveMechanicalPlacement } from '../mechanics-next/connectors/placement-solver.js'
import { worldConnectorFrame } from '../mechanics-next/connectors/world-frame.js'
import { OccupancyLedger, occupancyPlanForPlacement } from '../mechanics-next/connectors/occupancy.js'
import { findMechanicalCandidates } from '../mechanics-next/connectors/candidate-search.js'
import { commitPlacementTransaction } from '../mechanics-next/connectors/placement-transaction.js'
import { discoverMechanicalTransmissions } from '../mechanics-next/transmission/discovery.js'
import { createTransmissionCompiler } from '../mechanics-next/transmission/compiler.js'
import { evaluateBevelGearPair, evaluateSpurGearPair } from '../mechanics-next/transmission/gear-geometry.js'
import { createUniversalJointRelation, universalJointOutputDelta, universalJointInputDelta, universalJointVelocityRatio } from '../mechanics-next/compounds/universal-joint.js'
import { solveLinearWithNonlinearRelations } from '../mechanics-next/solver/nonlinear-relations.js'
import { discoverCompoundMechanisms } from '../mechanics-next/compounds/discovery.js'
import { createCompoundStateRegistry } from '../mechanics-next/compounds/state.js'
import { screenDragAngle, solveRotationalDrag } from '../mechanics-next/interaction/drag-driver.js'
import { buildMotionPlan } from '../mechanics-next/interaction/motion-plan.js'
import { applyMotionPlanToBaseline, captureMotionBaseline, restoreMotionBaseline } from '../mechanics-next/interaction/scene-motion-adapter.js'
import { buildMechanicsPhysicsPlan } from '../mechanics-next/physics/plan.js'
import { buildMechanicsCouplingPlan } from '../mechanics-next/physics/coupling-plan.js'
import { materializeRapierMechanicsPlan, preflightRapierMechanicsPlan } from '../mechanics-next/physics/rapier-adapter.js'
import * as THREE from 'three'

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


function identityObject() {
  return {
    position:{ x:0, y:0, z:0 },
    matrixWorld:{ elements:[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
    updateMatrixWorld() {},
  }
}

test('shadow interpreter derives keyed prismatic axle coupling independently of V4 constraint hint', () => {
  const maleRaw = {
    endpointId:'male-axle',
    family:'cylinder',
    gender:'male',
    frame:{ positionLdu:[0,0,0], orientation:[1,0,0,0,1,0,0,0,1] },
    geometry:{ centered:true, caps:'none', sections:[{ shape:'A', radiusLdu:6, lengthLdu:40 }] },
    snap:{ slide:true },
  }
  const femaleRaw = {
    endpointId:'female-axle-hole',
    family:'cylinder',
    gender:'female',
    frame:{ positionLdu:[0,0,0], orientation:[1,0,0,0,1,0,0,0,1] },
    geometry:{ centered:true, caps:'none', sections:[{ shape:'A', radiusLdu:6, lengthLdu:20 }] },
    snap:{ slide:true },
  }

  const maleDescriptor = createPartMechanicalDescriptor({
    observation:{ id:'axle-part', name:'Technic Axle 4L', tags:[] },
    endpoints:[legacyV4ConnectorToEndpoint(maleRaw, { bodyId:'tm', partId:'axle-part' })],
  })
  const femaleDescriptor = createPartMechanicalDescriptor({
    observation:{ id:'beam-part', name:'Technic Beam', tags:[] },
    endpoints:[legacyV4ConnectorToEndpoint(femaleRaw, { bodyId:'tf', partId:'beam-part' })],
  })
  const male = instantiatePartMechanicalDescriptor(maleDescriptor, { instanceId:'axle-1' })
  const female = instantiatePartMechanicalDescriptor(femaleDescriptor, { instanceId:'beam-1' })
  const instances = new Map([['axle-1', male], ['beam-1', female]])
  const objects = new Map([['axle-1', identityObject()], ['beam-1', identityObject()]])

  const result = interpretObservedConnection({
    id:'legacy-connection',
    a:{ instanceId:'axle-1', endpointId:'male-axle' },
    b:{ instanceId:'beam-1', endpointId:'female-axle-hole' },
    // Deliberately wrong/irrelevant old hint: Mechanics Next must derive its own type.
    constraint:{ kindHint:'fixed' },
    match:{ family:'cylinder' },
  }, {
    sceneObserver:{ instance:id => instances.get(id) },
    objectById:id => objects.get(id),
  })

  assert.equal(result.valid, true)
  assert.equal(result.type, 'constraint')
  assert.equal(result.constraint.kind, 'prismatic')
  assert.equal(result.constraint.dof.ty.state, 'free')
  assert.equal(result.constraint.dof.ry.state, 'locked')
})

test('two observed stud contacts become a rigid island through geometric bundle solving', () => {
  const stud = (id, x) => ({
    endpointId:id,
    family:'cylinder',
    gender:'male',
    frame:{ positionLdu:[x,0,0], orientation:[1,0,0,0,1,0,0,0,1] },
    geometry:{ centered:false, caps:'one', sections:[{ shape:'R', radiusLdu:6, lengthLdu:4 }] },
    snap:{ slide:false },
  })
  const anti = (id, x) => ({
    endpointId:id,
    family:'cylinder',
    gender:'female',
    frame:{ positionLdu:[x,0,0], orientation:[1,0,0,0,1,0,0,0,1] },
    geometry:{ centered:false, caps:'one', sections:[{ shape:'R', radiusLdu:6, lengthLdu:4 }] },
    snap:{ slide:false },
  })

  const topDescriptor = createPartMechanicalDescriptor({
    observation:{ id:'brick-top', name:'Brick 2 x 1', tags:[] },
    endpoints:[
      legacyV4ConnectorToEndpoint(stud('s0', 0), { bodyId:'t', partId:'brick-top' }),
      legacyV4ConnectorToEndpoint(stud('s1', 20), { bodyId:'t', partId:'brick-top' }),
    ],
  })
  const bottomDescriptor = createPartMechanicalDescriptor({
    observation:{ id:'brick-bottom', name:'Brick 2 x 1', tags:[] },
    endpoints:[
      legacyV4ConnectorToEndpoint(anti('a0', 0), { bodyId:'b', partId:'brick-bottom' }),
      legacyV4ConnectorToEndpoint(anti('a1', 20), { bodyId:'b', partId:'brick-bottom' }),
    ],
  })
  const top = instantiatePartMechanicalDescriptor(topDescriptor, { instanceId:'top' })
  const bottom = instantiatePartMechanicalDescriptor(bottomDescriptor, { instanceId:'bottom' })
  const instances = new Map([['top',top],['bottom',bottom]])
  const objects = new Map([['top',identityObject()],['bottom',identityObject()]])

  const graph = createAssemblyGraph()
  graph.addBody(top.body)
  graph.addBody(bottom.body)
  const interpreter = createShadowConnectionInterpreter({
    graph,
    sceneObserver:{ instance:id => instances.get(id) },
    objectById:id => objects.get(id),
  })
  const result = interpreter.sync([
    { id:'c0', a:{instanceId:'top',endpointId:'s0'}, b:{instanceId:'bottom',endpointId:'a0'}, match:{family:'cylinder'} },
    { id:'c1', a:{instanceId:'top',endpointId:'s1'}, b:{instanceId:'bottom',endpointId:'a1'}, match:{family:'cylinder'} },
  ])

  assert.equal(result.constraints, 2)
  assert.deepEqual(graph.rigidIslands(), [[top.body.id, bottom.body.id].sort()])
})


test('native LDCad parser preserves multi-step keyed profiles and motion flags', () => {
  const parsed = parseLdcadShadowText(
    '0 !LDCAD SNAP_CYL [id=axleHole] [gender=F] [caps=none] [secs=R 8 4 A 6 20 R 8 4] [center=true] [slide=true] [group=test] [pos=1 2 3]',
    { file:'parts/test.dat' },
  )
  assert.equal(parsed.warnings.length, 0)
  assert.equal(parsed.operations.length, 1)
  const connector = parsed.operations[0].connector
  assert.equal(connector.family, 'cylinder')
  assert.equal(connector.gender, 'female')
  assert.equal(connector.geometry.sections.length, 3)
  assert.deepEqual(connector.geometry.sections.map(section => section.shape), ['R','A','R'])
  assert.equal(connector.geometry.centered, true)
  assert.equal(connector.snap.slide, true)
  assert.deepEqual(connector.frame.positionLdu, [1,2,3])
})

test('native LDCad parser emits include and clear as operations instead of hiding inheritance semantics', () => {
  const parsed = parseLdcadShadowText([
    '0 !LDCAD SNAP_INCL [id=bundle] [ref=s/shared.dat] [pos=0 10 0] [scale=1 2 1]',
    '0 !LDCAD SNAP_CLEAR [id=bundle]',
  ].join('\n'), { file:'parts/root.dat' })
  assert.equal(parsed.warnings.length, 0)
  assert.deepEqual(parsed.operations.map(operation => operation.type), ['include','clear'])
  assert.equal(parsed.operations[0].ref, 's/shared.dat')
  assert.deepEqual(parsed.operations[0].scale, [1,2,1])
  assert.equal(parsed.operations[1].id, 'bundle')
})

test('native LDCad grid expansion supports centered connector arrays', () => {
  const parsed = parseLdcadShadowText(
    '0 !LDCAD SNAP_CYL [gender=M] [secs=R 6 4] [grid=C 3 C 2 20 20]',
  )
  assert.equal(parsed.warnings.length, 0)
  const points = expandGrid(parsed.operations[0].grid)
  assert.equal(points.length, 6)
  assert.deepEqual(points[0], [-20,0,-10])
  assert.deepEqual(points.at(-1), [20,0,10])
})

test('native LDCad connector adapter feeds the same semantic intelligence without V4', () => {
  const parsed = parseLdcadShadowText(
    '0 !LDCAD SNAP_CYL [id=ax] [gender=M] [caps=none] [secs=A 6 40] [center=true] [slide=true]',
    { file:'parts/native.dat' },
  )
  const endpoint = enrichEndpointSemantics(ldcadConnectorToEndpoint(parsed.operations[0].connector, {
    bodyId:'native-template',
    partId:'native-part',
  }))
  assert.equal(endpoint.metadata.parser, 'mechanics-next')
  assert.equal(endpoint.metadata.semantics.semanticKind, 'technic-axle')
})

test('native parser quarantines malformed metadata instead of inventing a connector', () => {
  const parsed = parseLdcadShadowText(
    '0 !LDCAD SNAP_CYL [gender=M] [secs=A 6 nope] [slide=true]',
  )
  assert.equal(parsed.operations.length, 0)
  assert.equal(parsed.warnings.length, 1)
  assert.equal(parsed.warnings[0].code, 'invalid-snap-meta')
})


test('native Shadow resolver applies nested include transforms and axial scale', async () => {
  const files = new Map([
    ['parts/root.dat', [
      '0 !LDCAD SNAP_CYL [id=local] [gender=M] [secs=R 6 4] [caps=one] [pos=0 0 0]',
      '0 !LDCAD SNAP_INCL [id=shaftBundle] [ref=shared.dat] [pos=20 0 0] [scale=1 2 1]',
    ].join('\n')],
    ['parts/shared.dat',
      '0 !LDCAD SNAP_CYL [id=shaft] [gender=M] [caps=none] [secs=A 6 10] [center=true] [slide=true] [pos=0 5 0]'],
  ])
  const resolver = createNativeShadowResolver({
    fetchShadowText:async path => files.get(path) ?? null,
  })
  const result = await resolver.resolve('parts/root.dat')
  assert.equal(result.warnings.length, 0)
  assert.equal(result.connectors.length, 2)

  const included = result.connectors.find(connector => connector.id === 'shaft')
  assert.ok(included)
  assert.deepEqual(included.frame.positionLdu, [20,10,0])
  assert.equal(included.geometry.sections[0].lengthLdu, 20)
  assert.ok(included.clearIds.includes('shaftBundle'))
})

test('native Shadow resolver executes SNAP_CLEAR after include', async () => {
  const files = new Map([
    ['parts/root.dat', [
      '0 !LDCAD SNAP_CYL [id=local] [gender=M] [secs=R 6 4] [caps=one]',
      '0 !LDCAD SNAP_INCL [id=temporary] [ref=shared.dat]',
      '0 !LDCAD SNAP_CLEAR [id=temporary]',
    ].join('\n')],
    ['parts/shared.dat',
      '0 !LDCAD SNAP_CYL [id=included] [gender=M] [secs=A 6 20] [slide=true]'],
  ])
  const resolver = createNativeShadowResolver({
    fetchShadowText:async path => files.get(path) ?? null,
  })
  const result = await resolver.resolve('parts/root.dat')
  assert.deepEqual(result.connectors.map(connector => connector.id), ['local'])
})

test('native Shadow resolver detects include cycles without recursion overflow', async () => {
  const files = new Map([
    ['parts/a.dat', '0 !LDCAD SNAP_INCL [ref=b.dat]'],
    ['parts/b.dat', '0 !LDCAD SNAP_INCL [ref=a.dat]'],
  ])
  const resolver = createNativeShadowResolver({
    fetchShadowText:async path => files.get(path) ?? null,
  })
  const result = await resolver.resolve('parts/a.dat')
  assert.equal(result.connectors.length, 0)
  assert.ok(result.warnings.some(warning => warning.code === 'include-cycle'))
})

test('native Shadow resolver rejects nonuniform sphere scaling instead of distorting semantics', async () => {
  const files = new Map([
    ['parts/root.dat', '0 !LDCAD SNAP_INCL [ref=sphere.dat] [scale=1 2 1]'],
    ['parts/sphere.dat', '0 !LDCAD SNAP_SPH [id=ball] [gender=M] [radius=10]'],
  ])
  const resolver = createNativeShadowResolver({
    fetchShadowText:async path => files.get(path) ?? null,
  })
  const result = await resolver.resolve('parts/root.dat')
  assert.equal(result.connectors.length, 0)
  assert.ok(result.warnings.some(warning => warning.code === 'geometry-scale-rejected'))
})

test('native Shadow resolver keeps explicit capability boundary for official inheritance', () => {
  const resolver = createNativeShadowResolver({ fetchShadowText:async () => null })
  assert.equal(resolver.capabilities.directShadow, true)
  assert.equal(resolver.capabilities.includes, true)
  assert.equal(resolver.capabilities.officialInheritance, false)
})


test('native/V4 parity accepts equivalent source connectors despite V4 BrickLab frame decoration', () => {
  const base = {
    id:'axle',
    endpointId:'legacy-axle',
    family:'cylinder',
    gender:'male',
    group:'drive',
    frame:{
      positionLdu:[10,20,30],
      orientation:[1,0,0,0,1,0,0,0,1],
      positionStud:[.5,-1,-1.5],
      orientationBrickLab:[1,0,0,0,-1,0,0,0,-1],
    },
    geometry:{
      centered:true,
      caps:'none',
      sections:[{shape:'A',radiusLdu:6,lengthLdu:40,elastic:false}],
    },
    snap:{slide:true},
  }
  const native = {
    ...base,
    endpointId:undefined,
    frame:{
      positionLdu:[10,20,30],
      orientation:[1,0,0,0,1,0,0,0,1],
    },
  }
  const result = compareNativeToLegacyConnectivity({
    partId:'part',
    nativeConnectors:[native],
    legacyConnectors:[base],
  })
  assert.equal(result.semanticParity, true)
  assert.equal(result.geometryParity, true)
})

test('native/V4 parity exposes missing semantics instead of hiding migration gaps', () => {
  const legacy = {
    endpointId:'stud',
    family:'cylinder',
    gender:'male',
    group:null,
    frame:{positionLdu:[0,0,0],orientation:[1,0,0,0,1,0,0,0,1]},
    geometry:{centered:false,caps:'one',sections:[{shape:'R',radiusLdu:6,lengthLdu:4}]},
    snap:{slide:false},
  }
  const result = compareNativeToLegacyConnectivity({
    partId:'part',
    nativeConnectors:[],
    legacyConnectors:[legacy],
  })
  assert.equal(result.semanticParity, false)
  assert.equal(result.semanticMissingFromNative.length, 1)

  const ledger = new ConnectivityParityLedger()
  ledger.record(result)
  assert.deepEqual(ledger.summary(), {
    parts:1,
    semanticPass:0,
    geometryPass:0,
    semanticFail:1,
    geometryFail:1,
  })
})


test('official parser distinguishes physical Shortcut from geometric Subpart', () => {
  const shortcut=parseLDrawHeader([
    '0 Technic Universal Joint Complete',
    '0 !LDRAW_ORG Shortcut UPDATE 2025-01',
  ].join('\n'))
  const subpart=parseLDrawHeader([
    '0 ~Technic Housing Subpart',
    '0 !LDRAW_ORG Subpart UPDATE 2025-01',
  ].join('\n'))
  assert.equal(shortcut.type,'shortcut')
  assert.equal(subpart.type,'subpart')
  assert.equal(inheritancePolicyForChild(shortcut,'parts/x.dat').compound,true)
  assert.equal(inheritancePolicyForChild(subpart,'parts/s/x.dat').inherit,true)
})

test('official parser reads type-1 transform without treating color as geometry', () => {
  const refs=parseType1References('1 16 10 20 30 1 0 0 0 2 0 0 0 1 s/child.dat')
  assert.equal(refs.length,1)
  assert.deepEqual(refs[0].transform.translation,[10,20,30])
  assert.deepEqual(refs[0].transform.linear,[1,0,0,0,2,0,0,0,1])
  assert.equal(refs[0].ref,'s/child.dat')
})

test('official inheritance transforms Subpart connectors and preserves them without parent Shadow file', async () => {
  const official=new Map([
    ['parts/root.dat',[
      '0 Root Part',
      '0 !LDRAW_ORG Part UPDATE 2025-01',
      '1 16 20 0 0 1 0 0 0 2 0 0 0 1 s/child.dat',
    ].join('\n')],
    ['parts/s/child.dat',[
      '0 ~Child',
      '0 !LDRAW_ORG Subpart UPDATE 2025-01',
    ].join('\n')],
  ])
  const shadow=new Map([
    ['parts/s/child.dat','0 !LDCAD SNAP_CYL [id=ax] [gender=M] [caps=none] [secs=A 6 10] [center=true] [slide=true] [pos=0 5 0]'],
  ])
  const nativeShadow=createNativeShadowResolver({fetchShadowText:async path=>shadow.get(path)??null})
  const inheritance=createNativeLDrawInheritanceResolver({
    fetchOfficialText:async path=>official.get(path)??null,
    shadowResolver:nativeShadow,
  })
  const result=await inheritance.resolve('parts/root.dat')
  assert.equal(result.warnings.length,0)
  assert.equal(result.connectors.length,1)
  assert.deepEqual(result.connectors[0].frame.positionLdu,[20,10,0])
  assert.equal(result.connectors[0].geometry.sections[0].lengthLdu,20)
})

test('official inheritance keeps Shortcut references as compound boundaries instead of flattening bodies', async () => {
  const official=new Map([
    ['parts/root.dat',[
      '0 Parent Part',
      '0 !LDRAW_ORG Part UPDATE 2025-01',
      '1 16 0 0 0 1 0 0 0 1 0 0 0 1 assembly.dat',
    ].join('\n')],
    ['parts/assembly.dat',[
      '0 Preassembled Mechanism',
      '0 !LDRAW_ORG Shortcut UPDATE 2025-01',
      '1 16 0 0 0 1 0 0 0 1 0 0 0 1 a.dat',
      '1 16 0 0 0 1 0 0 0 1 0 0 0 1 b.dat',
    ].join('\n')],
  ])
  const nativeShadow=createNativeShadowResolver({fetchShadowText:async()=>null})
  const inheritance=createNativeLDrawInheritanceResolver({
    fetchOfficialText:async path=>official.get(path)??null,
    shadowResolver:nativeShadow,
  })
  const result=await inheritance.resolve('parts/root.dat')
  assert.equal(result.connectors.length,0)
  assert.equal(result.compoundReferences.length,1)
  assert.equal(result.compoundReferences[0].type,'shortcut')
  assert.equal(result.compoundReferences[0].reason,'shortcut-boundary')
})

test('parent SNAP_CLEAR can remove inherited connector groups after geometric inheritance', async () => {
  const official=new Map([
    ['parts/root.dat',[
      '0 Root Part',
      '0 !LDRAW_ORG Part UPDATE 2025-01',
      '1 16 0 0 0 1 0 0 0 1 0 0 0 1 s/child.dat',
    ].join('\n')],
    ['parts/s/child.dat',[
      '0 ~Child',
      '0 !LDRAW_ORG Subpart UPDATE 2025-01',
    ].join('\n')],
  ])
  const shadow=new Map([
    ['parts/s/child.dat','0 !LDCAD SNAP_CYL [id=removeMe] [gender=M] [secs=R 6 4] [caps=one]'],
    ['parts/root.dat','0 !LDCAD SNAP_CLEAR [id=removeMe]'],
  ])
  const nativeShadow=createNativeShadowResolver({fetchShadowText:async path=>shadow.get(path)??null})
  const inheritance=createNativeLDrawInheritanceResolver({
    fetchOfficialText:async path=>official.get(path)??null,
    shadowResolver:nativeShadow,
  })
  const result=await inheritance.resolve('parts/root.dat')
  assert.equal(result.connectors.length,0)
})


function endpointFromNative(raw, { bodyId='body', partId='part', index=0 } = {}) {
  return enrichEndpointSemantics(ldcadConnectorToEndpoint(raw, { bodyId, partId, index }))
}

function axleEndpoint({ id='axle', gender='male', lengthLdu=40, positionLdu=[0,0,0] } = {}) {
  return endpointFromNative({
    id,
    family:'cylinder',
    gender,
    group:null,
    frame:{ positionLdu, orientation:[1,0,0,0,1,0,0,0,1] },
    geometry:{ centered:true, caps:'none', sections:[{ shape:'A', radiusLdu:6, lengthLdu, elastic:false }] },
    snap:{ slide:true },
  }, { bodyId:`body-${id}`, partId:id })
}

test('renderer-independent placement aligns keyed axle and preserves axial sliding DOF', () => {
  const source=axleEndpoint({ id:'male', gender:'male', positionLdu:[0,0,0] })
  const target=axleEndpoint({ id:'female', gender:'female', positionLdu:[0,0,0] })
  const sourcePose={ position:[1,0,0], quaternion:[0,0,0,1] }
  const targetPose={ position:[0,0,0], quaternion:[0,0,0,1] }
  const sourceFrame=worldConnectorFrame(sourcePose,source)
  const targetFrame=worldConnectorFrame(targetPose,target)

  const result=solveMechanicalPlacement({
    source,target,sourceFrame,targetFrame,objectPose:sourcePose,
  })
  assert.equal(result.valid,true)
  assert.equal(result.match.interfaceRule.kind,'prismatic')
  assert.equal(result.match.keyed,true)
  assert.ok(result.solution === undefined)
  assert.ok(result.diagnostics.translationStud >= 0)
  assert.ok(result.axial.engagementLdu >= 1)
})

test('placement uses opposite axial sign when the moving endpoint is female', () => {
  const male=axleEndpoint({ id:'stationary-male', gender:'male', lengthLdu:60 })
  const female=axleEndpoint({ id:'moving-female', gender:'female', lengthLdu:20 })
  const movingPose={ position:[0,1,0], quaternion:[0,0,0,1] }
  const targetPose={ position:[0,0,0], quaternion:[0,0,0,1] }
  const sourceFrame=worldConnectorFrame(movingPose,female)
  const targetFrame=worldConnectorFrame(targetPose,male)

  const result=solveMechanicalPlacement({
    source:female,target:male,sourceFrame,targetFrame,objectPose:movingPose,
  })
  assert.equal(result.valid,true)
  assert.ok(result.axial.offsetLdu < 0)
  assert.ok(Math.abs(result.worldPosition[1]-1) < 1e-8)
})

test('interval occupancy lets one long axle serve separated receivers but blocks overlap', () => {
  const ledger=new OccupancyLedger()
  const first={
    connectionId:'c1',
    exclusiveChannels:['female-a'],
    axialReservations:[{ channel:'axle', interval:[0,20], occupantBodyId:'a' }],
  }
  const second={
    connectionId:'c2',
    exclusiveChannels:['female-b'],
    axialReservations:[{ channel:'axle', interval:[20,40], occupantBodyId:'b' }],
  }
  const overlap={
    connectionId:'c3',
    exclusiveChannels:['female-c'],
    axialReservations:[{ channel:'axle', interval:[10,30], occupantBodyId:'c' }],
  }
  assert.equal(ledger.reserve(first).accepted,true)
  assert.equal(ledger.reserve(second).accepted,true)
  const blocked=ledger.canReserve(overlap)
  assert.equal(blocked.accepted,false)
  assert.equal(blocked.conflicts[0].type,'axial-overlap')
})

test('female bore remains exclusive even when axial interval is otherwise free', () => {
  const ledger=new OccupancyLedger()
  assert.equal(ledger.reserve({
    connectionId:'one',
    exclusiveChannels:['beam::hole'],
    axialReservations:[],
  }).accepted,true)
  const second=ledger.canReserve({
    connectionId:'two',
    exclusiveChannels:['beam::hole'],
    axialReservations:[],
  })
  assert.equal(second.accepted,false)
  assert.equal(second.conflicts[0].type,'exclusive-endpoint')
})

test('candidate search rejects occupied receiver and ranks an available compatible target', () => {
  const male=axleEndpoint({ id:'source-male', gender:'male', lengthLdu:60 })
  const femaleA=axleEndpoint({ id:'female-a', gender:'female', lengthLdu:20 })
  const femaleB=axleEndpoint({ id:'female-b', gender:'female', lengthLdu:20 })
  const moving={
    instance:{ body:{id:'moving-body'}, endpoints:[male] },
    pose:{ position:[0,0,0], quaternion:[0,0,0,1] },
  }
  const targetA={
    instance:{ body:{id:'target-a'}, endpoints:[femaleA] },
    pose:{ position:[0,.1,0], quaternion:[0,0,0,1] },
  }
  const targetB={
    instance:{ body:{id:'target-b'}, endpoints:[femaleB] },
    pose:{ position:[0,.25,0], quaternion:[0,0,0,1] },
  }
  const ledger=new OccupancyLedger()
  ledger.reserve({
    connectionId:'existing',
    exclusiveChannels:[`target-a::${femaleA.id}`],
    axialReservations:[],
  })
  const candidates=findMechanicalCandidates({
    moving,
    targets:[targetA,targetB],
    occupancy:ledger,
    maxResults:8,
  })
  assert.ok(candidates.length >= 1)
  assert.equal(candidates[0].targetBodyId,'target-b')
})

test('placement transaction rolls back pose when post-placement validation fails', async () => {
  const state={ position:[5,0,0], quaternion:[0,0,0,1] }
  const candidate={
    key:'candidate',
    moving:{ id:'moving' },
    solution:{ valid:true, worldPosition:[0,0,0], worldQuaternion:[0,0,0,1] },
    occupancyPlan:null,
  }
  const adapter={
    async snapshot(){return{position:[...state.position],quaternion:[...state.quaternion]}},
    async setWorldPose(_moving,pose){state.position=[...pose.position];state.quaternion=[...pose.quaternion]},
    async restore(_moving,snapshot){state.position=[...snapshot.position];state.quaternion=[...snapshot.quaternion]},
  }
  const result=await commitPlacementTransaction(candidate,{
    adapter,
    validate:async()=>({valid:false,reason:'collision'}),
  })
  assert.equal(result.accepted,false)
  assert.equal(result.reason,'post-placement:collision')
  assert.deepEqual(state.position,[5,0,0])
})


function directEndpoint({ id, bodyId, axis='y' } = {}) {
  const orientation = axis === 'x'
    ? [0,-1,0, 1,0,0, 0,0,1]
    : axis === 'z'
      ? [1,0,0, 0,0,-1, 0,1,0]
      : [1,0,0, 0,1,0, 0,0,1]
  return createEndpointDescriptor({
    id,
    bodyId,
    family:'cylinder',
    gender:'female',
    frame:{
      positionStud:[0,0,0],
      orientationBrickLab:orientation,
    },
    profile:{
      centered:true,
      caps:'none',
      sections:[{shape:'A',radiusLdu:6,lengthLdu:20}],
    },
    capabilities:['slide'],
    metadata:{
      semantics:{
        semanticKind:'technic-axle-hole',
      },
    },
  })
}

function transmissionRecord({
  bodyId,
  instanceId=bodyId,
  role='spur-gear',
  teeth=20,
  kind=role==='bevel-gear'?'bevel-gear':'spur-gear',
  position=[0,0,0],
  axis='y',
} = {}) {
  const endpoint=directEndpoint({id:`${bodyId}-port`,bodyId,axis})
  return {
    instance:{
      body:{id:bodyId,instanceId},
      endpoints:[endpoint],
      descriptor:{classification:{role}},
      transmissions:[{
        kind,
        toothCount:teeth,
        pitchRadius:teeth/16,
        equationFamily:'gear-mesh',
      }],
    },
    pose:{position,quaternion:[0,0,0,1]},
    visualOffsetStud:[0,0,0],
  }
}

test('spur geometry discovery builds a bidirectional ratio equation', () => {
  const a=transmissionRecord({bodyId:'g20',teeth:20,position:[0,0,0]})
  const b=transmissionRecord({bodyId:'g12',teeth:12,position:[20/16+12/16+.018,0,0]})
  const graph=createAssemblyGraph()
  graph.addBody(createBodyDescriptor({id:'g20'}))
  graph.addBody(createBodyDescriptor({id:'g12'}))

  const discovery=discoverMechanicalTransmissions({records:[a,b],graph})
  assert.equal(discovery.transmissions.filter(item=>item.kind==='spur-gear-mesh').length,1)

  const compiler=createTransmissionCompiler({solver:createKinematicSolver(),graph})
  compiler.sync(discovery)
  compiler.solve()
  compiler.clear()
})

test('spur gear local-axis sign flips when endpoint axes are opposite', () => {
  const a={kind:'spur',pitchRadius:1,center:[0,0,0],axis:[0,1,0]}
  const b={kind:'spur',pitchRadius:1,center:[2.018,0,0],axis:[0,-1,0]}
  const geometry=evaluateSpurGearPair(a,b)
  assert.equal(geometry.valid,true)
  assert.equal(geometry.directionSign,1)
})

test('bevel geometry recognizes a 20T to 28T perpendicular mesh by common apex', () => {
  const gear20={
    kind:'bevel',
    teeth:20,
    pitchRadius:20/16,
    center:[0,0,0],
    axis:[0,1,0],
    bevelApexSigns:[1],
  }
  const diff28={
    kind:'bevel',
    teeth:28,
    pitchRadius:28/16,
    center:[-(20/16+.1),28/16+.1,0],
    axis:[1,0,0],
    bevelApexSigns:[1],
  }
  const geometry=evaluateBevelGearPair(gear20,diff28)
  assert.equal(geometry.valid,true)
  assert.ok(geometry.apexError < 1e-9)
  assert.equal(geometry.directionSign,-1)
})

test('differential discovery resolves two side gears and leaves spider as compound diagnostic', () => {
  const carrier=transmissionRecord({
    bodyId:'carrier',
    role:'differential',
    teeth:28,
    kind:'bevel-gear',
    axis:'y',
  })
  carrier.instance.transmissions=[
    {
      kind:'bevel-gear',
      toothCount:28,
      pitchRadius:28/16,
      equationFamily:'gear-mesh',
      mechanicalRole:'carrier-input-gear',
    },
    {
      kind:'differential',
      equationFamily:'three-port-differential',
      mechanicalRole:'carrier',
    },
  ]
  const left=transmissionRecord({bodyId:'left',role:'bevel-gear',teeth:12,axis:'y'})
  const right=transmissionRecord({bodyId:'right',role:'bevel-gear',teeth:12,axis:'y'})
  const spider=transmissionRecord({bodyId:'spider',role:'bevel-gear',teeth:12,axis:'x'})
  const graph=createAssemblyGraph()
  for(const id of ['carrier','left','right','spider'])graph.addBody(createBodyDescriptor({id}))

  const relations=[
    {kind:'differential-port',bodyA:'carrier',bodyB:'left'},
    {kind:'differential-port',bodyA:'carrier',bodyB:'right'},
    {kind:'differential-port',bodyA:'carrier',bodyB:'spider'},
  ]
  const discovery=discoverMechanicalTransmissions({
    records:[carrier,left,right,spider],
    graph,
    relations,
  })
  const diff=discovery.transmissions.find(item=>item.kind==='open-differential')
  assert.ok(diff)
  assert.deepEqual(new Set(diff.parameters.sideBodies),new Set(['left','right']))
  assert.deepEqual(diff.parameters.spiderBodies,['spider'])
  assert.equal(discovery.balancedDifferentialClosures.length,1)
})

test('differential core stays underdetermined but balanced preview gives symmetric outputs', () => {
  const carrier=transmissionRecord({bodyId:'carrier',role:'differential',teeth:28,axis:'y'})
  carrier.instance.transmissions=[
    {kind:'bevel-gear',toothCount:28,pitchRadius:28/16,equationFamily:'gear-mesh'},
    {kind:'differential',equationFamily:'three-port-differential'},
  ]
  const left=transmissionRecord({bodyId:'left',role:'bevel-gear',teeth:12,axis:'y'})
  const right=transmissionRecord({bodyId:'right',role:'bevel-gear',teeth:12,axis:'y'})
  const graph=createAssemblyGraph()
  for(const id of ['carrier','left','right'])graph.addBody(createBodyDescriptor({id}))
  const discovery=discoverMechanicalTransmissions({
    records:[carrier,left,right],
    graph,
    relations:[
      {kind:'differential-port',bodyA:'carrier',bodyB:'left'},
      {kind:'differential-port',bodyA:'carrier',bodyB:'right'},
    ],
  })
  const solver=createKinematicSolver()
  const compiler=createTransmissionCompiler({solver,graph})
  compiler.sync(discovery)
  solver.setDriver({id:'drag-carrier',bodyId:'carrier',value:10})

  const core=compiler.solve()
  assert.equal(core.status,'underdetermined')

  const preview=compiler.solve({balancedDifferentials:true})
  assert.equal(preview.status,'solved')
  assert.ok(Math.abs(preview.values[mechanicalVariable('left','omega')]-10)<1e-9)
  assert.ok(Math.abs(preview.values[mechanicalVariable('right','omega')]-10)<1e-9)
})


test('screen drag produces signed angular displacement around projected pivot', () => {
  const drag=screenDragAngle(
    {x:10,y:0},
    {x:0,y:10},
    {x:0,y:0},
    {axisScreenSign:1},
  )
  assert.equal(drag.mode,'angular')
  assert.ok(Math.abs(drag.angleRad-Math.PI/2)<1e-9)

  const reversed=screenDragAngle(
    {x:10,y:0},
    {x:0,y:10},
    {x:0,y:0},
    {axisScreenSign:-1},
  )
  assert.ok(Math.abs(reversed.angleRad+Math.PI/2)<1e-9)
})

test('rotational drag solves an external 20T to 12T pair in displacement domain', () => {
  const discovery={
    equations:[gearMeshEquation({
      id:'mesh',
      bodyA:'g20',
      bodyB:'g12',
      teethA:20,
      teethB:12,
      directionSign:-1,
    })],
    transmissions:[],
    balancedDifferentialClosures:[],
  }
  const result=solveRotationalDrag({
    bodyId:'g20',
    angleRad:1,
    discovery,
    balancedDifferentials:false,
  })
  assert.equal(result.status,'solved')
  assert.ok(Math.abs(result.values[mechanicalVariable('g12','theta')]+20/12)<1e-9)
})

test('carrier drag auto-balances a free differential for deterministic preview', () => {
  const equation=differentialEquation({
    id:'diff',
    carrier:'carrier',
    left:'left',
    right:'right',
  })
  const closure=rigidRotationEquation({
    id:'diff:balance',
    bodyA:'left',
    bodyB:'right',
  })
  const discovery={
    equations:[equation],
    transmissions:[{
      kind:'open-differential',
      bodies:['carrier','left','right'],
    }],
    balancedDifferentialClosures:[closure],
  }
  const result=solveRotationalDrag({
    bodyId:'carrier',
    angleRad:.5,
    discovery,
    balancedDifferentials:'auto',
  })
  assert.equal(result.status,'solved')
  assert.equal(result.balancedDifferentials,true)
  assert.ok(Math.abs(result.values[mechanicalVariable('left','theta')]-.5)<1e-9)
  assert.ok(Math.abs(result.values[mechanicalVariable('right','theta')]-.5)<1e-9)
})

test('side gear drag does not invent a balanced differential closure', () => {
  const equation=differentialEquation({
    id:'diff',
    carrier:'carrier',
    left:'left',
    right:'right',
  })
  const closure=rigidRotationEquation({
    id:'diff:balance',
    bodyA:'left',
    bodyB:'right',
  })
  const discovery={
    equations:[equation],
    transmissions:[{
      kind:'open-differential',
      bodies:['carrier','left','right'],
    }],
    balancedDifferentialClosures:[closure],
  }
  const result=solveRotationalDrag({
    bodyId:'left',
    angleRad:.5,
    discovery,
    balancedDifferentials:'auto',
  })
  assert.equal(result.status,'underdetermined')
  assert.equal(result.balancedDifferentials,false)
})

test('motion plan orbits a differential spider even when its local spin is zero', () => {
  const records=[
    transmissionRecord({bodyId:'carrier',role:'differential',teeth:28,axis:'y'}),
    transmissionRecord({bodyId:'spider',role:'bevel-gear',teeth:12,axis:'x',position:[1,0,0]}),
  ]
  const result={
    status:'solved',
    values:{
      [mechanicalVariable('carrier','theta')]:1,
      [mechanicalVariable('spider','theta')]:0,
    },
    freeVariables:[],
    conflicts:[],
  }
  const plan=buildMotionPlan({
    records,
    discovery:{
      compoundMotions:[{
        kind:'differential-spider',
        bodyId:'spider',
        parentBodyId:'carrier',
        orbitBodyId:'carrier',
        spinBodyId:'spider',
        spinFrame:'carrier-relative',
        localAxis:[1,0,0],
        directionSign:1,
      }],
    },
    displacementResult:result,
  })
  const spider=plan.motions.find(item=>item.bodyId==='spider')
  assert.ok(spider)
  assert.equal(spider.kind,'compound-rotation')
  assert.equal(spider.orbit.thetaRad,1)
  assert.equal(spider.spin.thetaRad,0)
})

test('scene motion application is baseline-stable and does not accumulate per-frame drift', () => {
  const root=new THREE.Group()
  const object=new THREE.Object3D()
  object.userData.instanceId='instance'
  root.add(object)
  root.updateMatrixWorld(true)

  const records=[{
    object,
    instance:{
      body:{id:'body',instanceId:'instance'},
    },
  }]
  const baseline=captureMotionBaseline(records)
  const plan={
    motions:[{
      kind:'rotation',
      bodyId:'body',
      instanceId:'instance',
      pivot:[0,0,0],
      axis:[0,1,0],
      thetaRad:Math.PI/2,
    }],
  }

  applyMotionPlanToBaseline(plan,baseline)
  const first=object.quaternion.clone()
  applyMotionPlanToBaseline(plan,baseline)
  const second=object.quaternion.clone()

  assert.ok(first.angleTo(second)<1e-12)
  assert.ok(Math.abs(first.angleTo(new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0,1,0),
    Math.PI/2,
  )))<1e-9)

  restoreMotionBaseline(baseline)
  assert.ok(object.quaternion.angleTo(new THREE.Quaternion())<1e-12)
})


test('universal joint degenerates exactly to 1:1 at zero bend', () => {
  for(const theta of [-4,-1.2,0,.3,2.4,7]){
    assert.ok(Math.abs(universalJointOutputDelta(theta,{
      bendAngleRad:0,
      inputPhaseRad:.41,
      directionSign:1,
    })-theta)<1e-9)
  }
  assert.ok(Math.abs(universalJointVelocityRatio(1.17,{
    bendAngleRad:0,
    directionSign:1,
  })-1)<1e-12)
})

test('universal joint finite displacement is nonlinear and exactly invertible', () => {
  const options={
    bendAngleRad:Math.PI/6,
    inputPhaseRad:.37,
    directionSign:-1,
  }
  const input=.83
  const output=universalJointOutputDelta(input,options)
  const recovered=universalJointInputDelta(output,options)
  assert.ok(Math.abs(recovered-input)<1e-9)

  const ratioA=universalJointVelocityRatio(options.inputPhaseRad,{
    bendAngleRad:options.bendAngleRad,
    directionSign:options.directionSign,
  })
  const ratioB=universalJointVelocityRatio(options.inputPhaseRad+Math.PI/2,{
    bendAngleRad:options.bendAngleRad,
    directionSign:options.directionSign,
  })
  assert.ok(Math.abs(ratioA-ratioB)>.05)
})

test('nonlinear relation solver propagates a Cardan joint in both directions', () => {
  const relation=createUniversalJointRelation({
    id:'u',
    inputBody:'in',
    outputBody:'out',
    bendAngleRad:Math.PI/5,
    inputPhaseRad:.21,
    directionSign:1,
  })

  const forward=solveLinearWithNonlinearRelations({
    equations:[driverEquation({
      id:'drive-in',
      bodyId:'in',
      value:.9,
      channel:'theta',
    })],
    relations:[relation],
  })
  assert.equal(forward.status,'solved')
  assert.ok(Math.abs(
    forward.values[mechanicalVariable('out','theta')]-relation.forward(.9)
  )<1e-9)

  const wantedOut=.64
  const reverse=solveLinearWithNonlinearRelations({
    equations:[driverEquation({
      id:'drive-out',
      bodyId:'out',
      value:wantedOut,
      channel:'theta',
    })],
    relations:[relation],
  })
  assert.equal(reverse.status,'solved')
  assert.ok(Math.abs(
    reverse.values[mechanicalVariable('in','theta')]-relation.inverse(wantedOut)
  )<1e-9)
})

function compoundEndpoint({id,bodyId,semantic,orientationBrickLab=[1,0,0,0,1,0,0,0,1]}){
  return createEndpointDescriptor({
    id,
    bodyId,
    family:'generic',
    gender:null,
    frame:{
      positionStud:[0,0,0],
      orientationBrickLab,
    },
    profile:{bounding:{kind:'point'}},
    metadata:{
      semantics:{
        semanticKind:semantic,
      },
    },
  })
}

function compoundRecord({
  bodyId,
  role,
  endpoints=[],
  properties={},
  position=[0,0,0],
}){
  return {
    instance:{
      body:{id:bodyId,instanceId:bodyId},
      endpoints,
      descriptor:{
        classification:{
          role,
          properties,
          capabilities:{
            rotary:['universal-joint','cv-joint','driving-ring','clutch-gear'].includes(role),
          },
        },
      },
      transmissions:[],
    },
    pose:{position,quaternion:[0,0,0,1]},
    visualOffsetStud:[0,0,0],
  }
}

test('compound discovery resolves two uniJnt ports into one nonlinear universal joint', () => {
  const jointBody='joint'
  const portA=compoundEndpoint({
    id:'port-a',
    bodyId:jointBody,
    semantic:'universal-joint-port',
  })
  const portB=compoundEndpoint({
    id:'port-b',
    bodyId:jointBody,
    semantic:'universal-joint-port',
    orientationBrickLab:[1,0,0,0,-1,0,0,0,-1],
  })
  const joint=compoundRecord({
    bodyId:jointBody,
    role:'universal-joint',
    endpoints:[portA,portB],
  })
  const left=compoundRecord({bodyId:'left-shaft',role:'axle'})
  const right=compoundRecord({bodyId:'right-shaft',role:'axle'})
  const graph=createAssemblyGraph()
  for(const id of [jointBody,'left-shaft','right-shaft'])graph.addBody(createBodyDescriptor({id}))

  const discovery=discoverCompoundMechanisms({
    records:[joint,left,right],
    graph,
    relations:[
      {id:'ua',kind:'universal-joint-port',bodyA:jointBody,bodyB:'left-shaft',endpointA:'port-a',endpointB:'external-a'},
      {id:'ub',kind:'universal-joint-port',bodyA:jointBody,bodyB:'right-shaft',endpointA:'port-b',endpointB:'external-b'},
    ],
  })

  assert.equal(discovery.nonlinearRelations.length,1)
  assert.equal(discovery.transmissions[0].kind,'universal-joint')
  assert.equal(discovery.descriptors[0].status,'resolved')
  assert.ok(discovery.descriptors[0].bendAngleRad<1e-9)
})

test('CV compound uses constant-velocity linear coupling instead of Cardan nonlinearity', () => {
  const jointBody='cv'
  const portA=compoundEndpoint({id:'cv-a',bodyId:jointBody,semantic:'universal-joint-port'})
  const portB=compoundEndpoint({
    id:'cv-b',
    bodyId:jointBody,
    semantic:'universal-joint-port',
    orientationBrickLab:[1,0,0,0,-1,0,0,0,-1],
  })
  const cv=compoundRecord({bodyId:jointBody,role:'cv-joint',endpoints:[portA,portB]})
  const a=compoundRecord({bodyId:'a',role:'axle'})
  const b=compoundRecord({bodyId:'b',role:'axle'})
  const graph=createAssemblyGraph()
  for(const id of [jointBody,'a','b'])graph.addBody(createBodyDescriptor({id}))

  const discovery=discoverCompoundMechanisms({
    records:[cv,a,b],
    graph,
    relations:[
      {id:'ca',kind:'universal-joint-port',bodyA:jointBody,bodyB:'a',endpointA:'cv-a',endpointB:'x'},
      {id:'cb',kind:'universal-joint-port',bodyA:jointBody,bodyB:'b',endpointA:'cv-b',endpointB:'y'},
    ],
  })

  assert.equal(discovery.nonlinearRelations.length,0)
  assert.equal(discovery.equations.length,1)
  assert.equal(discovery.transmissions[0].kind,'cv-joint')
  assert.equal(discovery.transmissions[0].parameters.constantVelocity,true)
})

test('linear actuator refuses screw motion when lead is not verified', () => {
  const graph=createAssemblyGraph()
  for(const id of ['act','rod','input'])graph.addBody(createBodyDescriptor({id}))
  graph.addConstraint(createConstraint({
    id:'guide',
    bodyA:'act',
    bodyB:'rod',
    kind:'prismatic',
    metadata:{
      semanticA:'linear-actuator-guide',
      semanticB:'linear-actuator-guide',
      interfacePair:['linear-actuator-guide','linear-actuator-guide'],
    },
    referenceFrame:{position:[0,0,0],axis:[0,1,0]},
  }))
  graph.addConstraint(createConstraint({
    id:'input-key',
    bodyA:'act',
    bodyB:'input',
    kind:'prismatic',
    metadata:{
      interfacePair:['axle','axle-hole'],
      topology:{keyedRotation:true},
    },
    referenceFrame:{position:[0,0,0],axis:[0,1,0]},
  }))
  const discovery=discoverCompoundMechanisms({
    records:[
      compoundRecord({bodyId:'act',role:'linear-actuator',properties:{}}),
      compoundRecord({bodyId:'rod',role:'connector'}),
      compoundRecord({bodyId:'input',role:'axle'}),
    ],
    graph,
  })
  assert.equal(discovery.equations.length,0)
  assert.equal(discovery.descriptors.find(item=>item.bodyId==='act').status,'lead-unverified')
  assert.ok(discovery.diagnostics.some(item=>item.status==='lead-unverified'))
})

test('linear actuator emits screw relation only with verified lead metadata', () => {
  const graph=createAssemblyGraph()
  for(const id of ['act','rod','input'])graph.addBody(createBodyDescriptor({id}))
  graph.addConstraint(createConstraint({
    id:'guide',
    bodyA:'act',
    bodyB:'rod',
    kind:'prismatic',
    metadata:{
      semanticA:'linear-actuator-guide',
      semanticB:'linear-actuator-guide',
      interfacePair:['linear-actuator-guide','linear-actuator-guide'],
    },
    referenceFrame:{position:[0,0,0],axis:[0,1,0]},
  }))
  graph.addConstraint(createConstraint({
    id:'input-key',
    bodyA:'act',
    bodyB:'input',
    kind:'prismatic',
    metadata:{
      interfacePair:['axle','axle-hole'],
      topology:{keyedRotation:true},
    },
    referenceFrame:{position:[0,0,0],axis:[0,1,0]},
  }))
  const discovery=discoverCompoundMechanisms({
    records:[
      compoundRecord({
        bodyId:'act',
        role:'linear-actuator',
        properties:{
          screwLeadStudPerTurn:.25,
          travelStud:3,
          compoundParameterEvidence:{confidence:'verified',source:'test-fixture'},
        },
      }),
      compoundRecord({bodyId:'rod',role:'connector'}),
      compoundRecord({bodyId:'input',role:'axle'}),
    ],
    graph,
  })
  assert.equal(discovery.equations.length,1)
  assert.equal(discovery.transmissions[0].kind,'linear-actuator')
  assert.equal(discovery.linearMotions[0].bodyId,'rod')
})

test('shock absorber is exported to dynamics without invented spring constants', () => {
  const graph=createAssemblyGraph()
  graph.addBody(createBodyDescriptor({id:'shock'}))
  const discovery=discoverCompoundMechanisms({
    records:[compoundRecord({bodyId:'shock',role:'shock-absorber',properties:{}})],
    graph,
  })
  assert.equal(discovery.dynamics.length,1)
  assert.equal(discovery.dynamics[0].kind,'spring-damper')
  assert.equal(discovery.dynamics[0].springStiffness,null)
  assert.equal(discovery.dynamics[0].damping,null)
  assert.equal(discovery.dynamics[0].status,'awaiting-compound-decomposition')
})

test('driving ring never transmits torque without explicit engagement state', () => {
  const graph=createAssemblyGraph()
  for(const id of ['ring','gear'])graph.addBody(createBodyDescriptor({id}))
  const records=[
    compoundRecord({bodyId:'ring',role:'driving-ring'}),
    compoundRecord({bodyId:'gear',role:'clutch-gear'}),
  ]
  const state=createCompoundStateRegistry()

  let discovery=discoverCompoundMechanisms({records,graph,stateRegistry:state})
  assert.equal(discovery.equations.length,0)
  assert.equal(discovery.descriptors.find(item=>item.ringBody==='ring').status,'engagement-unresolved')

  state.set('clutch:ring',{mode:'engaged',targetBodyId:'gear'})
  discovery=discoverCompoundMechanisms({records,graph,stateRegistry:state})
  assert.equal(discovery.equations.length,1)
  assert.equal(discovery.transmissions[0].kind,'engaged-clutch')

  state.set('clutch:ring',{mode:'disengaged'})
  discovery=discoverCompoundMechanisms({records,graph,stateRegistry:state})
  assert.equal(discovery.equations.length,0)
})


test('drag pipeline propagates through nonlinear universal joint relation', () => {
  const relation=createUniversalJointRelation({
    id:'drag-u',
    inputBody:'shaft-in',
    outputBody:'shaft-out',
    bendAngleRad:Math.PI/6,
    inputPhaseRad:.3,
    directionSign:1,
  })
  const discovery={
    equations:[],
    nonlinearRelations:[relation],
    transmissions:[{
      kind:'universal-joint',
      bodies:['shaft-in','shaft-out','joint'],
    }],
    balancedDifferentialClosures:[],
  }
  const result=solveRotationalDrag({
    bodyId:'shaft-in',
    angleRad:.72,
    discovery,
    balancedDifferentials:false,
  })
  assert.equal(result.status,'solved')
  assert.ok(Math.abs(
    result.values[mechanicalVariable('shaft-out','theta')]-relation.forward(.72)
  )<1e-9)
})

test('actuator drag produces slide displacement and translation motion plan', () => {
  const equation=screwLinearEquation({
    id:'actuator',
    rotaryBody:'input',
    sliderBody:'rod',
    leadStudPerTurn:.25,
    angularChannel:'omega',
    linearChannel:'slide',
  })
  const discovery={
    equations:[equation],
    nonlinearRelations:[],
    transmissions:[],
    balancedDifferentialClosures:[],
    linearMotions:[{
      kind:'prismatic-output',
      bodyId:'rod',
      parentBodyId:'housing',
      axis:[0,1,0],
      channel:'slide',
      source:'linear-actuator-guide',
    }],
    compoundMotions:[],
  }
  const solved=solveRotationalDrag({
    bodyId:'input',
    angleRad:Math.PI*2,
    discovery,
    balancedDifferentials:false,
  })
  assert.equal(solved.status,'solved')
  assert.ok(Math.abs(solved.values[mechanicalVariable('rod','slide')]-.25)<1e-9)

  const records=[
    compoundRecord({bodyId:'input',role:'axle'}),
    compoundRecord({bodyId:'rod',role:'connector'}),
    compoundRecord({bodyId:'housing',role:'linear-actuator'}),
  ]
  const plan=buildMotionPlan({
    records,
    discovery,
    displacementResult:solved,
  })
  const translation=plan.motions.find(item=>item.bodyId==='rod')
  assert.ok(translation)
  assert.equal(translation.kind,'translation')
  assert.ok(Math.abs(translation.distanceStud-.25)<1e-9)
})


test('U-joint compound becomes spherical structural physics joint plus torsion relation', () => {
  const jointBody='uj-physics'
  const portA=compoundEndpoint({id:'uj-pa',bodyId:jointBody,semantic:'universal-joint-port'})
  const portB=compoundEndpoint({
    id:'uj-pb',
    bodyId:jointBody,
    semantic:'universal-joint-port',
    orientationBrickLab:[1,0,0,0,0,-1,0,1,0],
  })
  const joint=compoundRecord({bodyId:jointBody,role:'universal-joint',endpoints:[portA,portB]})
  const a=compoundRecord({bodyId:'uj-a',role:'axle'})
  const b=compoundRecord({bodyId:'uj-b',role:'axle'})
  const graph=createAssemblyGraph()
  for(const id of [jointBody,'uj-a','uj-b'])graph.addBody(createBodyDescriptor({id}))

  const compounds=discoverCompoundMechanisms({
    records:[joint,a,b],
    graph,
    relations:[
      {id:'uja',kind:'universal-joint-port',bodyA:jointBody,bodyB:'uj-a',endpointA:'uj-pa',endpointB:'a'},
      {id:'ujb',kind:'universal-joint-port',bodyA:jointBody,bodyB:'uj-b',endpointA:'uj-pb',endpointB:'b'},
    ],
  })
  const descriptor=compounds.descriptors.find(item=>item.kind==='universal-joint')
  assert.ok(descriptor)
  assert.equal(descriptor.virtualStructuralJoint,'spherical+tortion-coupling')
  assert.equal(descriptor.externalBodies.length,2)
  assert.equal(descriptor.pivotWorldStud.length,3)

  const plan=buildMechanicsPhysicsPlan({
    graph,
    discovery:{
      transmissions:compounds.transmissions,
      dynamics:compounds.dynamics,
      compoundDescriptors:compounds.descriptors,
    },
  })
  const virtual=plan.joints.find(item=>item.compound?.kind==='universal-joint')
  assert.ok(virtual)
  assert.equal(virtual.kind,'spherical')
  assert.deepEqual(new Set([virtual.bodyA,virtual.bodyB]),new Set(['uj-a','uj-b']))
})

test('differential spider physics coupling measures spider spin relative to carrier', () => {
  const graph=createAssemblyGraph()
  for(const id of ['carrier','spider','left','right'])graph.addBody(createBodyDescriptor({id}))
  const records=[
    transmissionRecord({bodyId:'carrier',role:'differential',teeth:28,axis:'y'}),
    transmissionRecord({bodyId:'spider',role:'bevel-gear',teeth:12,axis:'x'}),
    transmissionRecord({bodyId:'left',role:'bevel-gear',teeth:12,axis:'y'}),
    transmissionRecord({bodyId:'right',role:'bevel-gear',teeth:12,axis:'y'}),
  ]
  const equation=differentialSpiderEquation({
    id:'spider-rel',
    spider:'spider',
    carrier:'carrier',
    left:'left',
    right:'right',
  })
  const plan=buildMechanicsCouplingPlan({
    graph,
    records,
    discovery:{
      equations:[equation],
      velocityEquations:[],
      nonlinearRelations:[],
      linearMotions:[],
    },
  })
  assert.equal(plan.pass,true)
  assert.equal(plan.blockers.length,0)
  assert.equal(plan.couplers.length,1)
  const spiderTerm=plan.couplers[0].terms.find(item=>item.bodyId==='spider')
  assert.ok(spiderTerm)
  assert.equal(spiderTerm.referenceBodyId,'carrier')
  assert.equal(spiderTerm.referenceStatus,'forced-relative')
})

test('shock absorber without decomposed moving bodies remains a production physics blocker', () => {
  const graph=createAssemblyGraph()
  graph.addBody(createBodyDescriptor({id:'shock-body'}))
  const discovery=discoverCompoundMechanisms({
    records:[compoundRecord({
      bodyId:'shock-body',
      role:'shock-absorber',
      properties:{
        springStiffness:100,
        damping:5,
        compoundParameterEvidence:{confidence:'verified',source:'fixture'},
      },
    })],
    graph,
  })
  const plan=buildMechanicsPhysicsPlan({
    graph,
    discovery:{
      transmissions:discovery.transmissions,
      dynamics:discovery.dynamics,
      compoundDescriptors:discovery.descriptors,
    },
  })
  assert.equal(plan.pass,false)
  assert.ok(plan.blockers.some(item=>
    item.code==='spring-dynamics-unverified'&&item.bodyId==='shock-body'))
})

test('scene motion adapter applies actuator translation from immutable baseline', () => {
  const root=new THREE.Group()
  const object=new THREE.Object3D()
  object.userData.instanceId='rod-instance'
  root.add(object)
  root.updateMatrixWorld(true)

  const baseline=captureMotionBaseline([{
    object,
    instance:{body:{id:'rod-body',instanceId:'rod-instance'}},
  }])
  const plan={
    motions:[{
      kind:'translation',
      bodyId:'rod-body',
      instanceId:'rod-instance',
      axis:[0,1,0],
      distanceStud:.75,
    }],
  }
  applyMotionPlanToBaseline(plan,baseline)
  assert.ok(Math.abs(object.position.y-.75)<1e-9)
  applyMotionPlanToBaseline(plan,baseline)
  assert.ok(Math.abs(object.position.y-.75)<1e-9)
  restoreMotionBaseline(baseline)
  assert.ok(Math.abs(object.position.y)<1e-12)
})


function mockPhysicsMember({
  handle,
  rotation=new THREE.Quaternion(),
  position=[0,0,0],
}={}){
  const world=new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    rotation,
    new THREE.Vector3(1,1,1),
  )
  return {
    body:{handle},
    component:{
      bodyWorldInverse:world.clone().invert(),
      bodyWorldRotation:rotation.clone(),
    },
  }
}

function minimalPhysicsPlan(joint){
  return {
    blockers:[],
    joints:[joint],
    transmissions:[],
    dynamics:[],
  }
}

test('Rapier preflight accepts GenericJoint only when local axes agree', () => {
  const joint={
    id:'slide',
    kind:'prismatic',
    bodyA:'a',
    bodyB:'b',
    frame:{positionStud:[0,0,0],axisWorld:[1,0,0]},
    limits:null,
  }
  const members=new Map([
    ['a',mockPhysicsMember({handle:1})],
    ['b',mockPhysicsMember({handle:2})],
  ])
  const result=preflightRapierMechanicsPlan(minimalPhysicsPlan(joint),{
    resolveMember:id=>members.get(id),
  })
  assert.equal(result.pass,true)
})

test('Rapier preflight blocks GenericJoint when the same world axis maps to different local axes', () => {
  const joint={
    id:'slide-mismatch',
    kind:'cylindrical',
    bodyA:'a',
    bodyB:'b',
    frame:{positionStud:[0,0,0],axisWorld:[1,0,0]},
    limits:null,
  }
  const quarterTurn=new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0,0,1),
    Math.PI/2,
  )
  const members=new Map([
    ['a',mockPhysicsMember({handle:1})],
    ['b',mockPhysicsMember({handle:2,rotation:quarterTurn})],
  ])
  const result=preflightRapierMechanicsPlan(minimalPhysicsPlan(joint),{
    resolveMember:id=>members.get(id),
  })
  assert.equal(result.pass,false)
  assert.ok(result.failures.some(item=>
    item.code==='rapier-generic-local-axis-mismatch' &&
    item.jointId==='slide-mismatch'))
})

test('Rapier revolute materialization uses independent-axis constructor and no frame setters', () => {
  const joint={
    id:'hinge',
    kind:'revolute',
    bodyA:'a',
    bodyB:'b',
    frame:{positionStud:[0,0,0],axisWorld:[0,1,0]},
    limits:null,
  }
  const quarterTurn=new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1,0,0),
    Math.PI/2,
  )
  const members=new Map([
    ['a',mockPhysicsMember({handle:1})],
    ['b',mockPhysicsMember({handle:2,rotation:quarterTurn})],
  ])
  let constructorArgs=null
  let createdData=null
  const handle={
    setContactsEnabled(){},
    isValid(){return true},
  }
  const session={
    RAPIER:{
      JointData:{
        revoluteWithAxes(...args){
          constructorArgs=args
          return {type:'revoluteWithAxes',args}
        },
      },
    },
    world:{
      createImpulseJoint(data){
        createdData=data
        return handle
      },
      removeImpulseJoint(){},
    },
  }
  const result=materializeRapierMechanicsPlan(
    session,
    minimalPhysicsPlan(joint),
    {resolveMember:id=>members.get(id)},
  )
  assert.equal(result.active,1)
  assert.equal(createdData.type,'revoluteWithAxes')
  assert.equal(constructorArgs.length,4)
  assert.ok(!('setLocalFrame1' in handle))
  assert.ok(!('setLocalFrame2' in handle))
})
