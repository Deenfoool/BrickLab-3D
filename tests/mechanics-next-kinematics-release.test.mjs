import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createBodyDescriptor,
  createEndpointDescriptor,
  mechanicalVariable,
} from '../mechanics-next/core/model.js'
import { createAssemblyGraph } from '../mechanics-next/topology/assembly-graph.js'
import { discoverMechanicalTransmissions } from '../mechanics-next/transmission/discovery.js'
import {
  differentialEquation,
  gearMeshEquation,
  rigidRotationEquation,
} from '../mechanics-next/transmission/equations.js'
import { solveRotationalDrag } from '../mechanics-next/interaction/drag-driver.js'
import { createMechanicsDragSession } from '../mechanics-next/interaction/drag-session.js'
import * as THREE from 'three'

function directEndpoint({id,bodyId,axis='y'}={}){
  const orientation=axis==='x'
    ?[0,-1,0, 1,0,0, 0,0,1]
    :[1,0,0, 0,1,0, 0,0,1]
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
    metadata:{semantics:{semanticKind:'technic-axle-hole'}},
  })
}

function bevelRecord({
  bodyId,
  role='bevel-gear',
  teeth,
  axis='y',
  position=[0,0,0],
  differential=false,
}={}){
  const transmissions=[{
    kind:'bevel-gear',
    toothCount:teeth,
    pitchRadius:teeth/16,
    equationFamily:'gear-mesh',
    ...(differential?{mechanicalRole:'carrier-input-gear'}:{}),
  }]
  if(differential)transmissions.push({
    kind:'differential',
    equationFamily:'three-port-differential',
    mechanicalRole:'carrier',
  })
  return{
    instance:{
      body:{id:bodyId,instanceId:`${bodyId}-instance`,partId:bodyId},
      endpoints:[directEndpoint({id:`${bodyId}-port`,bodyId,axis})],
      descriptor:{classification:{role,properties:{},capabilities:{transmission:true,rotary:true}}},
      transmissions,
    },
    pose:{position,quaternion:[0,0,0,1]},
    visualOffsetStud:[0,0,0],
  }
}

function openDifferentialDiscovery(extraEquations=[]){
  return{
    equations:[
      ...extraEquations,
      differentialEquation({
        id:'release-diff',
        carrier:'carrier28',
        left:'left12',
        right:'right12',
      }),
    ],
    transmissions:[{
      kind:'open-differential',
      bodies:['carrier28','left12','right12'],
    }],
    balancedDifferentialClosures:[
      rigidRotationEquation({
        id:'release-diff-balance',
        bodyA:'left12',
        bodyB:'right12',
      }),
    ],
    nonlinearRelations:[],
  }
}

test('dragging an external 20T gear upstream of the 28T differential carrier rotates the complete free differential', () => {
  const discovery=openDifferentialDiscovery([
    gearMeshEquation({
      id:'20t-to-diff28',
      bodyA:'gear20',
      bodyB:'carrier28',
      teethA:20,
      teethB:28,
      directionSign:-1,
    }),
  ])

  const result=solveRotationalDrag({
    bodyId:'gear20',
    angleRad:1,
    discovery,
    balancedDifferentials:'auto',
  })

  assert.equal(result.status,'solved')
  assert.equal(result.balancedDifferentials,true)
  const carrier=result.values[mechanicalVariable('carrier28','theta')]
  const left=result.values[mechanicalVariable('left12','theta')]
  const right=result.values[mechanicalVariable('right12','theta')]
  assert.ok(Math.abs(carrier+20/28)<1e-9)
  assert.ok(Math.abs(left-carrier)<1e-9)
  assert.ok(Math.abs(right-carrier)<1e-9)
})

test('an upstream shaft chain into the carrier also enables deterministic differential preview', () => {
  const discovery=openDifferentialDiscovery([
    rigidRotationEquation({
      id:'input-shaft-coupling',
      bodyA:'input-shaft',
      bodyB:'gear20',
    }),
    gearMeshEquation({
      id:'20t-to-diff28',
      bodyA:'gear20',
      bodyB:'carrier28',
      teethA:20,
      teethB:28,
      directionSign:-1,
    }),
  ])

  const result=solveRotationalDrag({
    bodyId:'input-shaft',
    angleRad:.5,
    discovery,
    balancedDifferentials:'auto',
  })

  assert.equal(result.status,'solved')
  assert.equal(result.balancedDifferentials,true)
  const carrier=result.values[mechanicalVariable('carrier28','theta')]
  assert.ok(Math.abs(carrier+(.5*20/28))<1e-9)
  assert.ok(Math.abs(result.values[mechanicalVariable('left12','theta')]-carrier)<1e-9)
  assert.ok(Math.abs(result.values[mechanicalVariable('right12','theta')]-carrier)<1e-9)
})

test('driving a differential side through an external gear remains underdetermined instead of inventing a closure', () => {
  const discovery=openDifferentialDiscovery([
    gearMeshEquation({
      id:'side-drive',
      bodyA:'side-driver12',
      bodyB:'left12',
      teethA:12,
      teethB:12,
      directionSign:-1,
    }),
  ])

  const result=solveRotationalDrag({
    bodyId:'side-driver12',
    angleRad:1,
    discovery,
    balancedDifferentials:'auto',
  })

  assert.equal(result.balancedDifferentials,false)
  assert.equal(result.status,'underdetermined')
})


test('real discovery links external 20T bevel to the 28T carrier and drag propagates into both side gears', () => {
  const gear20=bevelRecord({
    bodyId:'real-gear20',
    teeth:20,
    axis:'y',
    position:[0,0,0],
  })
  const carrier=bevelRecord({
    bodyId:'real-carrier28',
    role:'differential',
    teeth:28,
    axis:'x',
    position:[-(20/16+.1),28/16+.1,0],
    differential:true,
  })
  const left=bevelRecord({
    bodyId:'real-left12',
    teeth:12,
    axis:'x',
    position:[0,0,0],
  })
  const right=bevelRecord({
    bodyId:'real-right12',
    teeth:12,
    axis:'x',
    position:[0,0,0],
  })
  const spider=bevelRecord({
    bodyId:'real-spider12',
    teeth:12,
    axis:'y',
    position:[0,0,0],
  })
  const records=[gear20,carrier,left,right,spider]
  const graph=createAssemblyGraph()
  for(const record of records){
    graph.addBody(createBodyDescriptor({
      id:record.instance.body.id,
      instanceId:record.instance.body.instanceId,
      partId:record.instance.body.partId,
    }))
  }

  const discovery=discoverMechanicalTransmissions({
    records,
    graph,
    relations:[
      {kind:'differential-port',bodyA:'real-carrier28',bodyB:'real-left12'},
      {kind:'differential-port',bodyA:'real-carrier28',bodyB:'real-right12'},
      {kind:'differential-port',bodyA:'real-carrier28',bodyB:'real-spider12'},
    ],
  })

  const externalMesh=discovery.transmissions.find(item=>
    item.kind==='bevel-gear-mesh' &&
    item.bodies.includes('real-gear20') &&
    item.bodies.includes('real-carrier28')
  )
  assert.ok(externalMesh,'20T must mesh with the 28T differential carrier')

  const differential=discovery.transmissions.find(item=>item.kind==='open-differential')
  assert.ok(differential,'structural differential must be discovered')
  assert.deepEqual(
    new Set(differential.parameters.sideBodies),
    new Set(['real-left12','real-right12']),
  )

  const result=solveRotationalDrag({
    bodyId:'real-gear20',
    angleRad:1,
    discovery,
    balancedDifferentials:'auto',
  })
  assert.equal(result.status,'solved')
  assert.equal(result.balancedDifferentials,true)

  const carrierTheta=result.values[mechanicalVariable('real-carrier28','theta')]
  assert.ok(Number.isFinite(carrierTheta))
  assert.ok(Math.abs(Math.abs(carrierTheta)-20/28)<1e-9)
  assert.ok(
    Math.abs(result.values[mechanicalVariable('real-left12','theta')]-carrierTheta)<1e-9,
  )
  assert.ok(
    Math.abs(result.values[mechanicalVariable('real-right12','theta')]-carrierTheta)<1e-9,
  )
})

test('a side-port mouse drag does not apply an arbitrary differential particular solution',()=>{
  const records=['carrier28','left12','right12'].map(bodyId=>{
    const record=bevelRecord({bodyId,teeth:12})
    record.object=new THREE.Group()
    return record
  })
  const session=createMechanicsDragSession({records,discovery:openDifferentialDiscovery(),instanceId:'left12-instance',start:[20,0],pivot:[0,0],balancedDifferentials:'auto'})
  const before=records.map(r=>({p:r.object.position.toArray(),q:r.object.quaternion.toArray()}))
  const result=session.update([0,20],{apply:true})
  assert.equal(result.solution.status,'underdetermined')
  assert.equal(result.application.applied,0)
  assert.deepEqual(records.map(r=>({p:r.object.position.toArray(),q:r.object.quaternion.toArray()})),before)
})
