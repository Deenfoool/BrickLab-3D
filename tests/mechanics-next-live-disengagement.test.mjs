import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { createBodyDescriptor, createEndpointDescriptor } from '../mechanics-next/core/model.js'
import { createConstraint } from '../mechanics-next/constraints/dof.js'
import { createAssemblyGraph } from '../mechanics-next/topology/assembly-graph.js'
import { OccupancyLedger, endpointChannel } from '../mechanics-next/connectors/occupancy.js'
import { createLiveJointValidator } from '../mechanics-next/physics/live-joint-validator.js'
import { validateAndReleaseMechanicsJoints } from '../mechanics-next/physics/joint-dynamics.js'
import {
  applyPhysicsJointRelease,
  createReleasedConnectionState,
} from '../mechanics-next/physics/release-state.js'

function cylinderEndpoint({
  id,
  bodyId,
  gender,
  radiusLdu=6,
  lengthLdu=40,
}){
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
      sections:[{shape:'R',radiusLdu,lengthLdu}],
    },
    capabilities:['slide','rotate'],
    metadata:{
      semantics:{
        semanticKind:gender==='male'?'technic-pin':'technic-pin-hole',
      },
    },
  })
}

function recordFor(body,endpoint,object){
  object.updateMatrixWorld(true)
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

test('live joint validator calibrates axial direction from the committed occupancy interval', () => {
  const graph=createAssemblyGraph()
  const maleBody=createBodyDescriptor({id:'live-male-body',instanceId:'live-male-i',partId:'pin'})
  const femaleBody=createBodyDescriptor({id:'live-female-body',instanceId:'live-female-i',partId:'hole'})
  graph.addBody(maleBody)
  graph.addBody(femaleBody)

  const male=cylinderEndpoint({id:'live-male-endpoint',bodyId:maleBody.id,gender:'male'})
  const female=cylinderEndpoint({id:'live-female-endpoint',bodyId:femaleBody.id,gender:'female'})
  graph.addConstraint(createConstraint({
    id:'live-pin-constraint',
    bodyA:maleBody.id,
    bodyB:femaleBody.id,
    kind:'cylindrical',
    metadata:{
      endpointAId:male.id,
      endpointBId:female.id,
      observedConnectionId:'live-observed',
      occupancy:{
        connectionId:'live-observed',
        axialReservations:[{
          channel:endpointChannel(maleBody.id,male.id),
          interval:[0,30],
        }],
      },
    },
  }))

  const maleObject=new THREE.Object3D()
  const femaleObject=new THREE.Object3D()
  maleObject.position.y=-.5

  const validator=createLiveJointValidator({
    graph,
    records:[
      recordFor(maleBody,male,maleObject),
      recordFor(femaleBody,female,femaleObject),
    ],
  })

  const initial=validator.validateJoint({
    id:'live-joint',
    sourceConstraintIds:['live-pin-constraint'],
  })
  assert.equal(initial.valid,true)
  assert.equal(initial.reason,'ok')
  assert.ok(Math.abs(initial.results[0].offsetLdu-10)<1e-9)
  assert.ok(initial.results[0].engagementLdu>=29.999)

  maleObject.position.y=3
  maleObject.updateMatrixWorld(true)
  const separated=validator.validateJoint({
    id:'live-joint',
    sourceConstraintIds:['live-pin-constraint'],
  })
  assert.equal(separated.valid,false)
  assert.equal(separated.reason,'axial-disengaged')
  assert.equal(separated.results[0].engagementLdu,0)
})

test('keyed axle validation treats quarter turns as equivalent symmetry phases', () => {
  const graph=createAssemblyGraph()
  const maleBody=createBodyDescriptor({id:'symmetry-axle-body',instanceId:'symmetry-axle-i',partId:'axle'})
  const femaleBody=createBodyDescriptor({id:'symmetry-hole-body',instanceId:'symmetry-hole-i',partId:'axle-hole'})
  graph.addBody(maleBody)
  graph.addBody(femaleBody)

  const axleEndpoint=({id,bodyId,gender,semantic})=>createEndpointDescriptor({
    id,bodyId,family:'cylinder',gender,
    frame:{positionStud:[0,0,0],orientationBrickLab:[1,0,0,0,1,0,0,0,1]},
    profile:{centered:true,caps:'none',sections:[{shape:'A',radiusLdu:6,lengthLdu:40}]},
    capabilities:['slide'],
    metadata:{semantics:{semanticKind:semantic}},
  })
  const male=axleEndpoint({
    id:'symmetry-axle-end',bodyId:maleBody.id,gender:'male',semantic:'technic-axle',
  })
  const female=axleEndpoint({
    id:'symmetry-hole-end',bodyId:femaleBody.id,gender:'female',semantic:'technic-axle-hole',
  })
  graph.addConstraint(createConstraint({
    id:'symmetry-constraint',
    bodyA:maleBody.id,
    bodyB:femaleBody.id,
    kind:'prismatic',
    metadata:{
      endpointAId:male.id,
      endpointBId:female.id,
      observedConnectionId:'symmetry-observed',
      connectionGeometry:{
        anchorDistanceStud:0,
        axialSeparationStud:0,
        lateralDistanceStud:0,
        axisDot:1,
        relativeOrientation:[1,0,0,0,1,0,0,0,1],
        twistPhaseRad:0,
      },
      occupancy:{
        connectionId:'symmetry-observed',
        axialReservations:[{
          channel:endpointChannel(maleBody.id,male.id),
          interval:[-20,20],
        }],
      },
    },
  }))

  const maleObject=new THREE.Object3D()
  const femaleObject=new THREE.Object3D()
  const records=[
    recordFor(maleBody,male,maleObject),
    recordFor(femaleBody,female,femaleObject),
  ]

  maleObject.rotation.y=Math.PI/2
  maleObject.updateMatrixWorld(true)
  const quarter=createLiveJointValidator({graph,records}).validateConstraint('symmetry-constraint')
  assert.equal(quarter.valid,true)
  assert.ok(quarter.orientationDrift<1e-8)

  maleObject.rotation.y=Math.PI/4
  maleObject.updateMatrixWorld(true)
  const halfPhase=createLiveJointValidator({graph,records}).validateConstraint('symmetry-constraint')
  assert.equal(halfPhase.valid,false)
  assert.equal(halfPhase.reason,'orientation-disengaged')
  assert.ok(halfPhase.orientationDrift>.7)
})

test('bar clip cylindrical joint slides while engaged and releases after axial exit', () => {
  const graph=createAssemblyGraph()
  const barBody=createBodyDescriptor({id:'clip-bar-body',instanceId:'clip-bar-i',partId:'bar'})
  const clipBody=createBodyDescriptor({id:'clip-body',instanceId:'clip-i',partId:'clip'})
  graph.addBody(barBody)
  graph.addBody(clipBody)

  const bar=createEndpointDescriptor({
    id:'clip-bar-end',bodyId:barBody.id,family:'cylinder',gender:'male',
    frame:{positionStud:[0,0,0],orientationBrickLab:[1,0,0,0,1,0,0,0,1]},
    profile:{centered:true,caps:'none',sections:[{shape:'R',radiusLdu:4,lengthLdu:80}]},
    capabilities:['slide'],
    metadata:{semantics:{semanticKind:'bar'}},
  })
  const clip=createEndpointDescriptor({
    id:'clip-end',bodyId:clipBody.id,family:'clip',gender:'female',
    frame:{positionStud:[0,0,0],orientationBrickLab:[1,0,0,0,1,0,0,0,1]},
    profile:{centered:true,radiusLdu:4,lengthLdu:8},
    capabilities:[],
    metadata:{semantics:{semanticKind:'clip'}},
  })
  graph.addConstraint(createConstraint({
    id:'clip-bar-constraint',
    bodyA:barBody.id,
    bodyB:clipBody.id,
    kind:'cylindrical',
    metadata:{
      endpointAId:bar.id,
      endpointBId:clip.id,
      observedConnectionId:'clip-bar-observed',
      connectionGeometry:{
        anchorDistanceStud:0,
        axialSeparationStud:0,
        lateralDistanceStud:0,
        axisDot:1,
        relativeOrientation:[1,0,0,0,1,0,0,0,1],
        twistPhaseRad:0,
      },
      occupancy:{
        connectionId:'clip-bar-observed',
        exclusiveChannels:[endpointChannel(clipBody.id,clip.id)],
        axialReservations:[{
          channel:endpointChannel(barBody.id,bar.id),
          interval:[-4,4],
        }],
      },
    },
  }))

  const barObject=new THREE.Object3D()
  const clipObject=new THREE.Object3D()
  const records=[
    recordFor(barBody,bar,barObject),
    recordFor(clipBody,clip,clipObject),
  ]

  barObject.position.y=1
  barObject.rotation.y=.6
  barObject.updateMatrixWorld(true)
  const retained=createLiveJointValidator({graph,records}).validateConstraint('clip-bar-constraint')
  assert.equal(retained.valid,true)
  assert.equal(retained.reason,'ok')
  assert.ok(retained.engagementLdu>=7.999)

  barObject.position.y=3
  barObject.updateMatrixWorld(true)
  const released=createLiveJointValidator({graph,records}).validateConstraint('clip-bar-constraint')
  assert.equal(released.valid,false)
  assert.equal(released.reason,'axial-disengaged')
})

test('live disengagement requires confirmation frames before removing the Rapier joint', () => {
  const graph=createAssemblyGraph()
  const maleBody=createBodyDescriptor({id:'release-male-body',instanceId:'release-male-i',partId:'pin'})
  const femaleBody=createBodyDescriptor({id:'release-female-body',instanceId:'release-female-i',partId:'hole'})
  graph.addBody(maleBody)
  graph.addBody(femaleBody)

  const male=cylinderEndpoint({id:'release-male-endpoint',bodyId:maleBody.id,gender:'male'})
  const female=cylinderEndpoint({id:'release-female-endpoint',bodyId:femaleBody.id,gender:'female'})
  graph.addConstraint(createConstraint({
    id:'release-source-constraint',
    bodyA:maleBody.id,
    bodyB:femaleBody.id,
    kind:'cylindrical',
    metadata:{
      endpointAId:male.id,
      endpointBId:female.id,
      occupancy:{
        connectionId:'release-observed',
        axialReservations:[{
          channel:endpointChannel(maleBody.id,male.id),
          interval:[0,40],
        }],
      },
    },
  }))

  const maleObject=new THREE.Object3D()
  const femaleObject=new THREE.Object3D()
  const validator=createLiveJointValidator({
    graph,
    records:[
      recordFor(maleBody,male,maleObject),
      recordFor(femaleBody,female,femaleObject),
    ],
  })

  maleObject.position.y=3
  maleObject.updateMatrixWorld(true)

  let removed=0
  const monitor={
    item:{
      id:'release-runtime-joint',
      release:{mode:'revalidate-profile'},
      sourceConstraintIds:['release-source-constraint'],
    },
    handle:{isValid:()=>true},
    released:false,
    invalidFrames:0,
  }
  const session={
    world:{
      removeImpulseJoint(){
        removed+=1
      },
    },
  }
  const state={monitors:[monitor]}

  const first=validateAndReleaseMechanicsJoints(session,state,{
    validateJoint:validator.validateJoint,
    confirmFrames:2,
  })
  assert.equal(first.released,0)
  assert.equal(monitor.released,false)
  assert.equal(monitor.invalidFrames,1)
  assert.equal(removed,0)

  const second=validateAndReleaseMechanicsJoints(session,state,{
    validateJoint:validator.validateJoint,
    confirmFrames:2,
  })
  assert.equal(second.released,1)
  assert.equal(second.events[0].jointId,'release-runtime-joint')
  assert.equal(second.events[0].reason,'axial-disengaged')
  assert.equal(monitor.released,true)
  assert.equal(removed,1)

  const third=validateAndReleaseMechanicsJoints(session,state,{
    validateJoint:validator.validateJoint,
    confirmFrames:2,
  })
  assert.equal(third.released,0)
  assert.equal(removed,1)
})

test('released connection state prevents legacy resurrection and explicit reconnect unmasks the id', () => {
  const graph=createAssemblyGraph()
  const bodyA=createBodyDescriptor({id:'release-state-a'})
  const bodyB=createBodyDescriptor({id:'release-state-b'})
  graph.addBody(bodyA)
  graph.addBody(bodyB)

  graph.addConstraint(createConstraint({
    id:'release-state-constraint',
    bodyA:bodyA.id,
    bodyB:bodyB.id,
    kind:'fixed',
    metadata:{
      observedConnectionId:'legacy-link-1',
      occupancy:{connectionId:'legacy-link-1'},
    },
  }))

  const occupancy=new OccupancyLedger()
  const channel=endpointChannel(bodyB.id,'female')
  assert.equal(occupancy.reserve({
    connectionId:'legacy-link-1',
    exclusiveChannels:[channel],
    axialReservations:[],
  }).accepted,true)

  const nativeObservedRecords=new Map([
    ['legacy-link-1',{id:'legacy-link-1'}],
  ])
  const releasedConnections=createReleasedConnectionState()

  const detail=applyPhysicsJointRelease({
    jointId:'physics-joint-1',
    reason:'axial-disengaged',
    constraintIds:['release-state-constraint'],
  },{
    graph,
    occupancy,
    nativeObservedRecords,
    releasedConnections,
  })

  assert.deepEqual(detail.removedConstraints,['release-state-constraint'])
  assert.deepEqual(detail.observedConnectionIds,['legacy-link-1'])
  assert.equal(graph.edge('release-state-constraint'),null)
  assert.equal(nativeObservedRecords.has('legacy-link-1'),false)
  assert.equal(occupancy.exclusiveOwner(channel),null)
  assert.equal(releasedConnections.has('legacy-link-1'),true)

  const legacySnapshotRecord={id:'legacy-link-1'}
  assert.equal(releasedConnections.has(legacySnapshotRecord.id),true)

  const duplicate=applyPhysicsJointRelease({
    jointId:'physics-joint-1',
    reason:'axial-disengaged',
    constraintIds:['release-state-constraint'],
  },{
    graph,
    occupancy,
    nativeObservedRecords,
    releasedConnections,
  })
  assert.deepEqual(duplicate.removedConstraints,[])
  assert.equal(releasedConnections.snapshot().length,1)

  assert.equal(releasedConnections.reconnect('legacy-link-1'),true)
  assert.equal(releasedConnections.has(legacySnapshotRecord.id),false)
  assert.deepEqual(releasedConnections.snapshot(),[])
})
