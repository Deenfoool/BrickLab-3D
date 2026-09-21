import test from 'node:test'
import assert from 'node:assert/strict'

import { evaluateMechanicsMigrationGate } from '../mechanics-next/migration/gate.js'

function greenRuntime(productionOwnership){
  return{
    version:'mechanics-next-test',
    scene:{instances:0,roles:{unknown:0}},
    lastSceneSync:{
      observedRecords:0,
      recordObservationFailures:[],
      compoundEndpointOwnership:{unresolvedCount:0},
      transmissions:{
        diagnostics:{
          coverage:[],
          packaged:[],
          differentials:[],
        },
      },
    },
    mechanicalRecordFailures:[],
    interpretedConnections:{unresolved:0},
    compoundDecompositions:{pending:0,failures:0},
    productionOwnership,
  }
}

function evaluate({nativeProjectAuthoritative=false,productionOwnership=null,scope='production',physicsStatus={pass:true,blockers:[]}}={}){
  return evaluateMechanicsMigrationGate({
    runtimeStatus:greenRuntime(productionOwnership),
    physicsStatus,
    paritySummary:{parts:0,semanticFail:0,geometryFail:0},
    persistence:{pass:true},
    regression:{status:'passed'},
    nativeProjectAuthoritative,
    scope,
  })
}

test('migration preparation may run before native production ownership is published',()=>{
  const gate=evaluate({
    nativeProjectAuthoritative:false,
    productionOwnership:{
      build:false,
      kinematics:false,
      physicsCreateOwner:null,
    },
  })
  const ownership=gate.checks.find(item=>item.id==='native-ownership-convergence')
  assert.ok(ownership)
  assert.equal(ownership.pass,true)
  assert.equal(gate.pass,true)
})

test('native authoritative project requires converged Mechanics Next BUILD and Physics ownership',()=>{
  const gate=evaluate({
    nativeProjectAuthoritative:true,
    productionOwnership:{
      build:true,
      kinematics:false,
      physicsCreateOwner:'mechanics-next-physics-owner-0.1.0',
    },
  })
  const ownership=gate.checks.find(item=>item.id==='native-ownership-convergence')
  assert.ok(ownership)
  assert.equal(ownership.pass,true)
  assert.equal(gate.pass,true)
})

test('native authoritative project fails closed when production ownership is split',()=>{
  for(const productionOwnership of [
    {
      build:false,
      kinematics:false,
      physicsCreateOwner:'mechanics-next-physics-owner-0.1.0',
    },
    {
      build:true,
      kinematics:false,
      physicsCreateOwner:'connector-physics-guard-v4',
    },
    {
      build:true,
      kinematics:false,
      physicsCreateOwner:null,
    },
  ]){
    const gate=evaluate({
      nativeProjectAuthoritative:true,
      productionOwnership,
    })
    const ownership=gate.checks.find(item=>item.id==='native-ownership-convergence')
    assert.ok(ownership)
    assert.equal(ownership.pass,false)
    assert.equal(gate.pass,false)
    assert.ok(gate.blockers.some(item=>item.id==='native-ownership-convergence'))
  }
})


test('KINEMATICS gate ignores Rapier readiness but still requires native BUILD ownership',()=>{
  const gate=evaluate({
    nativeProjectAuthoritative:true,
    scope:'kinematics',
    productionOwnership:{build:true,kinematics:false,physicsCreateOwner:null},
    physicsStatus:{pass:false,blockers:[{code:'unsupported-physics-fixture'}]},
  })
  const ownership=gate.checks.find(item=>item.id==='native-ownership-convergence')
  const physics=gate.checks.find(item=>item.id==='physics-preflight')
  assert.equal(gate.scope,'kinematics')
  assert.equal(ownership.pass,true)
  assert.equal(physics.pass,true)
  assert.equal(physics.detail.required,false)
  assert.equal(gate.pass,true)
})

test('production gate remains fail-closed on physics blockers',()=>{
  const gate=evaluate({
    nativeProjectAuthoritative:true,
    scope:'production',
    productionOwnership:{build:true,kinematics:false,physicsCreateOwner:'mechanics-next-physics-owner-0.1.0'},
    physicsStatus:{pass:false,blockers:[{code:'unsupported-physics-fixture'}]},
  })
  assert.equal(gate.scope,'production')
  assert.equal(gate.pass,false)
  assert.ok(gate.blockers.some(item=>item.id==='physics-preflight'))
})
