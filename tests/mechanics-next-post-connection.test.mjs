import test from 'node:test'
import assert from 'node:assert/strict'

import { createBodyDescriptor, createEndpointDescriptor } from '../mechanics-next/core/model.js'
import { createConstraint } from '../mechanics-next/constraints/dof.js'
import { createAssemblyGraph } from '../mechanics-next/topology/assembly-graph.js'
import { revalidateSceneConnections } from '../mechanics-next/physics/scene-connection-revalidator.js'
import {
  applyPhysicsJointRelease,
  createReleasedConnectionState,
} from '../mechanics-next/physics/release-state.js'

function matrixWorld({x=0,y=0,z=0,rx=0,ry=0}={}){
  const cx=Math.cos(rx),sx=Math.sin(rx)
  const cy=Math.cos(ry),sy=Math.sin(ry)
  // R = Ry * Rx, encoded in Three.js-style column-major storage.
  return {
    elements:[
      cy,0,-sy,0,
      sy*sx,cx,cy*sx,0,
      sy*cx,-sx,cy*cx,0,
      x,y,z,1,
    ],
  }
}

function objectAt(options={}){
  return{
    matrixWorld:matrixWorld(options),
    setPose(next){this.matrixWorld=matrixWorld(next)},
    updateWorldMatrix(){},
  }
}

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

function sphereEndpoint({id,bodyId,gender}){
  return createEndpointDescriptor({
    id,
    bodyId,
    family:'sphere',
    gender,
    frame:{
      positionStud:[0,0,0],
      orientationBrickLab:[1,0,0,0,1,0,0,0,1],
    },
    profile:{radiusLdu:10},
    capabilities:['rotate'],
    metadata:{
      semantics:{semanticKind:gender==='male'?'ball':'socket'},
    },
  })
}

function record(body,endpoint,object){
  return{
    instance:{
      body,
      endpoints:[endpoint],
      descriptor:{classification:{role:'connector',capabilities:{},properties:{}}},
      transmissions:[],
    },
    object,
    pose:{position:[0,0,0],quaternion:[0,0,0,1]},
    visualOffsetStud:[0,0,0],
  }
}

function observedMetadata({
  id,
  instanceAId,
  instanceBId,
  endpointAId,
  endpointBId,
  connectionGeometry,
  occupancy=null,
}){
  return{
    observedConnectionId:id,
    instanceAId,
    instanceBId,
    endpointAId,
    endpointBId,
    connectionGeometry,
    occupancy,
  }
}

test('scene revalidation removes an axially disengaged retained connector and masks resurrection', () => {
  const graph=createAssemblyGraph()
  const maleBody=createBodyDescriptor({id:'scene-male',instanceId:'scene-mi',partId:'pin'})
  const femaleBody=createBodyDescriptor({id:'scene-female',instanceId:'scene-fi',partId:'hole'})
  graph.addBody(maleBody)
  graph.addBody(femaleBody)
  const male=cylinderEndpoint({id:'scene-male-end',bodyId:maleBody.id,gender:'male'})
  const female=cylinderEndpoint({id:'scene-female-end',bodyId:femaleBody.id,gender:'female'})
  graph.addConstraint(createConstraint({
    id:'scene-cylinder-link',
    bodyA:maleBody.id,
    bodyB:femaleBody.id,
    kind:'cylindrical',
    metadata:observedMetadata({
      id:'scene-observed',
      instanceAId:maleBody.instanceId,
      instanceBId:femaleBody.instanceId,
      endpointAId:male.id,
      endpointBId:female.id,
      connectionGeometry:{
        anchorDistanceStud:.5,
        axialSeparationStud:-.5,
        lateralDistanceStud:0,
        axisDot:1,
        relativeOrientation:[1,0,0,0,1,0,0,0,1],
      },
      occupancy:{
        connectionId:'scene-observed',
        axialReservations:[{channel:'male',interval:[0,30]}],
      },
    }),
  }))

  const maleObject=objectAt({y:3})
  const femaleObject=objectAt()
  const released=createReleasedConnectionState()
  const nativeObservedRecords=new Map([['scene-observed',{id:'scene-observed'}]])

  const result=revalidateSceneConnections({
    graph,
    records:[
      record(maleBody,male,maleObject),
      record(femaleBody,female,femaleObject),
    ],
    releaseConstraint:event=>applyPhysicsJointRelease(event,{
      graph,
      occupancy:{release:()=>1},
      nativeObservedRecords,
      releasedConnections:released,
    }),
  })

  assert.equal(result.checked,1)
  assert.equal(result.released,1)
  assert.equal(result.failures[0].reason,'axial-disengaged')
  assert.equal(graph.edge('scene-cylinder-link'),null)
  assert.equal(nativeObservedRecords.has('scene-observed'),false)
  assert.equal(released.has('scene-observed'),true)
})

test('spherical connection stays valid while one member rotates freely around the ball centre', () => {
  const graph=createAssemblyGraph()
  const ballBody=createBodyDescriptor({id:'ball-body',instanceId:'ball-i',partId:'ball'})
  const socketBody=createBodyDescriptor({id:'socket-body',instanceId:'socket-i',partId:'socket'})
  graph.addBody(ballBody)
  graph.addBody(socketBody)
  const ball=sphereEndpoint({id:'ball-end',bodyId:ballBody.id,gender:'male'})
  const socket=sphereEndpoint({id:'socket-end',bodyId:socketBody.id,gender:'female'})
  graph.addConstraint(createConstraint({
    id:'ball-socket-link',
    bodyA:ballBody.id,
    bodyB:socketBody.id,
    kind:'spherical',
    metadata:observedMetadata({
      id:'ball-socket-observed',
      instanceAId:ballBody.instanceId,
      instanceBId:socketBody.instanceId,
      endpointAId:ball.id,
      endpointBId:socket.id,
      connectionGeometry:{
        anchorDistanceStud:0,
        axialSeparationStud:0,
        lateralDistanceStud:0,
        axisDot:1,
        relativeOrientation:[1,0,0,0,1,0,0,0,1],
      },
    }),
  }))

  let releases=0
  const result=revalidateSceneConnections({
    graph,
    records:[
      record(ballBody,ball,objectAt({rx:Math.PI/2})),
      record(socketBody,socket,objectAt()),
    ],
    releaseConstraint:()=>{releases+=1},
  })
  assert.equal(result.checked,1)
  assert.equal(result.released,0)
  assert.equal(releases,0)
  assert.ok(graph.edge('ball-socket-link'))
})

test('fixed coaxial connection rejects pure twist even when anchors and axes still coincide', () => {
  const graph=createAssemblyGraph()
  const maleBody=createBodyDescriptor({id:'fixed-male',instanceId:'fixed-mi',partId:'pin'})
  const femaleBody=createBodyDescriptor({id:'fixed-female',instanceId:'fixed-fi',partId:'hole'})
  graph.addBody(maleBody)
  graph.addBody(femaleBody)
  const male=cylinderEndpoint({id:'fixed-male-end',bodyId:maleBody.id,gender:'male'})
  const female=cylinderEndpoint({id:'fixed-female-end',bodyId:femaleBody.id,gender:'female'})
  graph.addConstraint(createConstraint({
    id:'fixed-link',
    bodyA:maleBody.id,
    bodyB:femaleBody.id,
    kind:'fixed',
    metadata:observedMetadata({
      id:'fixed-observed',
      instanceAId:maleBody.instanceId,
      instanceBId:femaleBody.instanceId,
      endpointAId:male.id,
      endpointBId:female.id,
      connectionGeometry:{
        anchorDistanceStud:0,
        axialSeparationStud:0,
        lateralDistanceStud:0,
        axisDot:1,
        relativeOrientation:[1,0,0,0,1,0,0,0,1],
      },
      occupancy:{
        connectionId:'fixed-observed',
        axialReservations:[{channel:'male',interval:[0,40]}],
      },
    }),
  }))

  let releaseEvent=null
  const result=revalidateSceneConnections({
    graph,
    records:[
      record(maleBody,male,objectAt({ry:Math.PI/2})),
      record(femaleBody,female,objectAt()),
    ],
    releaseConstraint:event=>{releaseEvent=event},
  })

  assert.equal(result.checked,1)
  assert.equal(result.released,1)
  assert.equal(result.failures[0].reason,'orientation-disengaged')
  assert.equal(releaseEvent.reason,'orientation-disengaged')
})
