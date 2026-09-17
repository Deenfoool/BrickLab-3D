import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  ENGINE_CRANK_RIM_CENTER_LDU_V4,
  ENGINE_CRANK_RIM_OFFSET_LDU_V4,
  ENGINE_CRANK_RIM_RADIUS_LDU_V4,
  ENGINE_PISTON_FIXTURE_GROUP_V4,
  ENGINE_PISTON_TAIL_X_LDU_V4,
  discoverEnginePistonFixturesV4,
} from '../connector-discovery/engine-piston-fixtures-v4.js'
import {
  circularTrackRadiusStudV4,
  engineCamTrackPairV4,
  projectCircularTrackPointV4,
} from '../connectors-v4/engine-cam-track-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { activationForMatchV4 } from '../connectors-v4/activation-v4.js'
import { createConnectionGraphV4, createConnectionProposalV4 } from '../connectors-v4/connections-v4.js'

const close=(a,b,eps=1e-9)=>Math.abs(a-b)<=eps

test('4368 exposes one continuous eccentric crank rim instead of four discrete sites',()=>{
  const result=discoverEnginePistonFixturesV4('4368.dat')
  assert.equal(result.connectors.length,1)
  assert.equal(result.stats.crankRimTracks,1)
  assert.equal(result.stats.crankRimSites,0)
  assert.equal(ENGINE_CRANK_RIM_OFFSET_LDU_V4,4)
  assert.equal(ENGINE_CRANK_RIM_RADIUS_LDU_V4,15)
  assert.deepEqual([...ENGINE_CRANK_RIM_CENTER_LDU_V4],[0,-4,0])

  const track=result.connectors[0]
  assert.equal(track.gender,'male')
  assert.equal(track.group,ENGINE_PISTON_FIXTURE_GROUP_V4)
  assert.equal(track.discovery.role,'technic-engine-crank-rim-track')
  assert.deepEqual(track.frame.positionLdu,[0,-4,0])
  assert.equal(track.snap.slide,false)
  assert.deepEqual(track.path,{kind:'circle',continuous:true,radiusLdu:15,normal:'connector-axis'})
  assert.equal(circularTrackRadiusStudV4(track),0.75)
})

test('4369 exposes the dedicated follower at its verified tail location',()=>{
  const result=discoverEnginePistonFixturesV4('4369.dat')
  assert.equal(result.connectors.length,1)
  const follower=result.connectors[0]
  assert.equal(ENGINE_PISTON_TAIL_X_LDU_V4,-46.5)
  assert.deepEqual(follower.frame.positionLdu,[-46.5,0,0])
  assert.equal(follower.gender,'female')
  assert.equal(follower.group,ENGINE_PISTON_FIXTURE_GROUP_V4)
  assert.equal(follower.discovery.role,'technic-engine-piston-follower')
})

test('4369 follower activates against the continuous 4368 crank track',()=>{
  const follower=discoverEnginePistonFixturesV4('4369.dat').connectors[0]
  const track=discoverEnginePistonFixturesV4('4368.dat').connectors[0]
  const pair=engineCamTrackPairV4(follower,track)
  assert.ok(pair)
  assert.equal(pair.track,track)
  assert.equal(pair.follower,follower)

  const match=matchConnectorV4(follower,track)
  assert.equal(match.compatible,true)
  assert.equal(match.family,'cylinder')
  assert.equal(match.kinematicHint,'revolute')
  const activation=activationForMatchV4(follower,track,match)
  assert.equal(activation.active,true)
  assert.equal(activation.family,'technic-engine-cam-follower')
  assert.equal(activation.constraintKind,'revolute')
  assert.equal(activation.evidence,'verified-ldraw-help:4368-continuous-rim+4369')
  assert.equal(matchConnectorV4(follower,{...track,group:'other'}).compatible,false)
})

test('continuous rim projection accepts arbitrary angles, not just cardinal HELP samples',()=>{
  const radius=0.75
  const angle=THREE.MathUtils.degToRad(37)
  const frame={
    position:new THREE.Vector3(1.2,-0.4,2.1),
    axis:new THREE.Vector3(0,0,1),
    reference:new THREE.Vector3(1,0,0),
  }
  const exact=frame.position.clone().add(new THREE.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius,0))
  const projected=projectCircularTrackPointV4(frame,exact,{radiusStud:radius})
  assert.equal(projected.valid,true)
  assert.ok(projected.nearest.distanceTo(exact)<1e-10)
  assert.ok(close(projected.radialDistanceStud,radius))
  assert.ok(Math.abs(projected.captureErrorStud)<1e-10)

  const outside=frame.position.clone().add(new THREE.Vector3(Math.cos(angle)*(radius+.06),Math.sin(angle)*(radius+.06),.02))
  const corrected=projectCircularTrackPointV4(frame,outside,{radiusStud:radius})
  assert.equal(corrected.valid,true)
  assert.ok(close(corrected.nearest.distanceTo(frame.position),radius,1e-10))
  assert.ok(close(corrected.radialErrorStud,.06,1e-10))
  assert.ok(close(corrected.normalOffsetStud,.02,1e-10))
})

test('one 4368 circular track can carry several independent 4369 followers',()=>{
  const track={...discoverEnginePistonFixturesV4('4368.dat').connectors[0],endpointId:'crank-track'}
  const followerA={...discoverEnginePistonFixturesV4('4369.dat').connectors[0],endpointId:'follower'}
  const followerB={...discoverEnginePistonFixturesV4('4369.dat').connectors[0],endpointId:'follower'}
  const matchA=matchConnectorV4(followerA,track)
  const matchB=matchConnectorV4(followerB,track)
  const disk={userData:{instanceId:'disk',partId:'ldraw-4368'}}
  const pistonA={userData:{instanceId:'piston-a',partId:'ldraw-4369'}}
  const pistonB={userData:{instanceId:'piston-b',partId:'ldraw-4369'}}
  const solution={
    valid:true,
    solverVersion:'test-continuous-track',
    placementMode:'aligned',
    axisPolarity:1,
    axial:{offsetLdu:0,profileOffsetLdu:0},
    continuousPath:{kind:'circle',radiusStud:.75},
  }
  const proposalA=createConnectionProposalV4({source:followerA,target:track,sourceObject:pistonA,targetObject:disk,match:matchA,solution})
  const proposalB=createConnectionProposalV4({source:followerB,target:track,sourceObject:pistonB,targetObject:disk,match:matchB,solution})
  assert.equal(proposalA.occupancy,null)
  assert.equal(proposalB.occupancy,null)
  assert.equal(proposalA.occupancyReady,true)
  assert.equal(proposalA.exclusiveEndpointKeys.includes('disk::crank-track'),false)
  assert.deepEqual(proposalA.exclusiveEndpointKeys,['piston-a::follower'])
  assert.deepEqual(proposalB.exclusiveEndpointKeys,['piston-b::follower'])

  const graph=createConnectionGraphV4()
  assert.equal(graph.add(proposalA).accepted,true)
  assert.equal(graph.add(proposalB).accepted,true)
  assert.equal(graph.list().length,2)
})
