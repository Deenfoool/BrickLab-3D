import test from 'node:test'
import assert from 'node:assert/strict'

import { createBodyDescriptor, createEndpointDescriptor } from '../mechanics-next/core/model.js'
import { createConstraint } from '../mechanics-next/constraints/dof.js'
import { createAssemblyGraph } from '../mechanics-next/topology/assembly-graph.js'
import {
  exportMechanicsProjectState,
  restoreMechanicsProjectState,
} from '../mechanics-next/migration/project-state.js'
import { revalidateSceneConnections } from '../mechanics-next/physics/scene-connection-revalidator.js'

function cylinderEndpoint({id,bodyId,gender}){
  return createEndpointDescriptor({
    id,
    bodyId,
    family:'cylinder',
    gender,
    frame:{
      positionStud:[0,0,0],
      orientationBrickLab:[1,0,0,0,1,0,0,0,1],
    },
    profile:{
      centered:false,
      caps:'none',
      sections:[{shape:'R',radiusLdu:6,lengthLdu:40}],
    },
    capabilities:['slide','rotate'],
    metadata:{
      semantics:{
        semanticKind:gender==='male'?'technic-pin':'technic-pin-hole',
      },
    },
  })
}

function objectAt(y=0){
  return{
    matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,y,0,1]},
    children:[],
    setY(next){this.matrixWorld.elements[13]=next},
    updateWorldMatrix(){},
  }
}

function record(instance,object){
  return{
    instance,
    object,
    pose:{position:[0,0,0],quaternion:[0,0,0,1]},
    visualOffsetStud:[0,0,0],
  }
}

function fixture(){
  const maleBody=createBodyDescriptor({id:'history-male',instanceId:'history-mi',partId:'pin'})
  const femaleBody=createBodyDescriptor({id:'history-female',instanceId:'history-fi',partId:'hole'})
  const male=cylinderEndpoint({id:'history-male-end',bodyId:maleBody.id,gender:'male'})
  const female=cylinderEndpoint({id:'history-female-end',bodyId:femaleBody.id,gender:'female'})
  const maleInstance={
    body:maleBody,
    endpoints:[male],
    descriptor:{classification:{role:'connector',capabilities:{},properties:{}}},
    transmissions:[],
  }
  const femaleInstance={
    body:femaleBody,
    endpoints:[female],
    descriptor:{classification:{role:'connector',capabilities:{},properties:{}}},
    transmissions:[],
  }
  const maleObject=objectAt(-.5)
  const femaleObject=objectAt(0)
  const instances=new Map([
    [maleBody.instanceId,maleInstance],
    [femaleBody.instanceId,femaleInstance],
  ])
  const objects=new Map([
    [maleBody.instanceId,maleObject],
    [femaleBody.instanceId,femaleObject],
  ])
  const sceneObserver={
    instance:id=>instances.get(id)??null,
    instances:()=>[...instances.values()],
  }
  return{
    maleBody,femaleBody,male,female,maleInstance,femaleInstance,
    maleObject,femaleObject,sceneObserver,objects,
  }
}

test('project export persists the original connection geometry snapshot', () => {
  const fx=fixture()
  const graph=createAssemblyGraph()
  graph.addBody(fx.maleBody)
  graph.addBody(fx.femaleBody)
  const geometry={
    anchorDistanceStud:.5,
    axialSeparationStud:-.5,
    lateralDistanceStud:0,
    axisDot:1,
    relativeOrientation:[1,0,0,0,1,0,0,0,1],
  }
  graph.addConstraint(createConstraint({
    id:'history-edge',
    bodyA:fx.maleBody.id,
    bodyB:fx.femaleBody.id,
    kind:'cylindrical',
    metadata:{
      observedConnectionId:'history-observed',
      instanceAId:fx.maleBody.instanceId,
      instanceBId:fx.femaleBody.instanceId,
      endpointAId:fx.male.id,
      endpointBId:fx.female.id,
      observedEndpointAId:fx.male.id,
      observedEndpointBId:fx.female.id,
      semanticA:'technic-pin',
      semanticB:'technic-pin-hole',
      interfacePair:['technic-pin','technic-hole'],
      connectionGeometry:geometry,
      occupancy:{
        connectionId:'history-observed',
        exclusiveChannels:[],
        axialReservations:[{channel:'male',interval:[0,30]}],
      },
    },
  }))

  const state=exportMechanicsProjectState({graph,relations:[]})
  assert.equal(state.connections.length,1)
  assert.deepEqual(state.connections[0].geometry,geometry)
})

test('restore keeps persisted geometry so a moved-open project cannot bless its new pose', () => {
  const fx=fixture()
  const source=createAssemblyGraph()
  source.addBody(fx.maleBody)
  source.addBody(fx.femaleBody)
  source.addConstraint(createConstraint({
    id:'history-edge',
    bodyA:fx.maleBody.id,
    bodyB:fx.femaleBody.id,
    kind:'cylindrical',
    metadata:{
      observedConnectionId:'history-observed',
      instanceAId:fx.maleBody.instanceId,
      instanceBId:fx.femaleBody.instanceId,
      endpointAId:fx.male.id,
      endpointBId:fx.female.id,
      observedEndpointAId:fx.male.id,
      observedEndpointBId:fx.female.id,
      semanticA:'technic-pin',
      semanticB:'technic-pin-hole',
      interfacePair:['technic-pin','technic-hole'],
      connectionGeometry:{
        anchorDistanceStud:.5,
        axialSeparationStud:-.5,
        lateralDistanceStud:0,
        axisDot:1,
        relativeOrientation:[1,0,0,0,1,0,0,0,1],
      },
      occupancy:{
        connectionId:'history-observed',
        exclusiveChannels:[],
        axialReservations:[{channel:'male',interval:[0,30]}],
      },
    },
  }))
  const state=exportMechanicsProjectState({graph:source,relations:[]})

  fx.maleObject.setY(3)
  const restoredGraph=createAssemblyGraph()
  restoredGraph.addBody(fx.maleBody)
  restoredGraph.addBody(fx.femaleBody)
  const restored=restoreMechanicsProjectState(state,{
    graph:restoredGraph,
    sceneObserver:fx.sceneObserver,
    objectByInstanceId:id=>fx.objects.get(id),
    replace:true,
  })
  assert.equal(restored.rejected,0)
  const edge=restoredGraph.edge('history-edge')
  assert.ok(edge)
  assert.equal(edge.metadata.connectionGeometry.anchorDistanceStud,.5)
  assert.equal(edge.metadata.connectionGeometry.axialSeparationStud,-.5)

  let released=null
  const moved=revalidateSceneConnections({
    graph:restoredGraph,
    records:[
      record(fx.maleInstance,fx.maleObject),
      record(fx.femaleInstance,fx.femaleObject),
    ],
    releaseConstraint:event=>{released=event},
  })
  assert.equal(moved.released,1)
  assert.equal(moved.failures[0].reason,'axial-disengaged')
  assert.equal(released.reason,'axial-disengaged')

  // Undo/Open back to the saved transform must become valid again when the
  // persisted project is restored from scratch.
  fx.maleObject.setY(-.5)
  const undoGraph=createAssemblyGraph()
  undoGraph.addBody(fx.maleBody)
  undoGraph.addBody(fx.femaleBody)
  const undoRestore=restoreMechanicsProjectState(state,{
    graph:undoGraph,
    sceneObserver:fx.sceneObserver,
    objectByInstanceId:id=>fx.objects.get(id),
    replace:true,
  })
  assert.equal(undoRestore.rejected,0)
  const afterUndo=revalidateSceneConnections({
    graph:undoGraph,
    records:[
      record(fx.maleInstance,fx.maleObject),
      record(fx.femaleInstance,fx.femaleObject),
    ],
    releaseConstraint:()=>{throw new Error('restored saved pose must remain connected')},
  })
  assert.equal(afterUndo.released,0)
  assert.ok(undoGraph.edge('history-edge'))
})
