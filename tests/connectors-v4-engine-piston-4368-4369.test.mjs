import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ENGINE_CRANK_RIM_OFFSET_LDU_V4,
  ENGINE_CRANK_RIM_SITES_V4,
  ENGINE_PISTON_FIXTURE_GROUP_V4,
  ENGINE_PISTON_TAIL_X_LDU_V4,
  discoverEnginePistonFixturesV4,
} from '../connector-discovery/engine-piston-fixtures-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { activationForMatchV4 } from '../connectors-v4/activation-v4.js'

const expectedSites=[[-14.5,0,0],[0,11,0],[14.5,0,0],[0,-19,0]]

test('4368 exposes four verified crank rim sites with documented 4 LDU eccentricity',()=>{
  const result=discoverEnginePistonFixturesV4('4368.dat')
  assert.equal(result.connectors.length,4)
  assert.equal(ENGINE_CRANK_RIM_OFFSET_LDU_V4,4)
  assert.deepEqual(ENGINE_CRANK_RIM_SITES_V4.map(site=>[...site.positionLdu]),expectedSites)
  assert.deepEqual(result.connectors.map(connector=>connector.frame.positionLdu),expectedSites)
  for(const connector of result.connectors){
    assert.equal(connector.gender,'male')
    assert.equal(connector.group,ENGINE_PISTON_FIXTURE_GROUP_V4)
    assert.equal(connector.discovery.role,'technic-engine-crank-rim-site')
    assert.equal(connector.snap.slide,false)
  }
})

test('4369 exposes the retained follower at its verified tail location',()=>{
  const result=discoverEnginePistonFixturesV4('4369.dat')
  assert.equal(result.connectors.length,1)
  const follower=result.connectors[0]
  assert.equal(ENGINE_PISTON_TAIL_X_LDU_V4,-46.5)
  assert.deepEqual(follower.frame.positionLdu,[-46.5,0,0])
  assert.equal(follower.gender,'female')
  assert.equal(follower.group,ENGINE_PISTON_FIXTURE_GROUP_V4)
  assert.equal(follower.discovery.role,'technic-engine-piston-follower')
})

test('4369 follower snaps to every 4368 crank rim site as a retained revolute pair',()=>{
  const follower=discoverEnginePistonFixturesV4('4369.dat').connectors[0]
  for(const crank of discoverEnginePistonFixturesV4('4368.dat').connectors){
    const match=matchConnectorV4(follower,crank)
    assert.equal(match.compatible,true)
    assert.equal(match.family,'cylinder')
    assert.equal(match.kinematicHint,'revolute')
    const activation=activationForMatchV4(follower,crank,match)
    assert.equal(activation.active,true)
    assert.equal(activation.constraintKind,'revolute')
  }
  assert.equal(matchConnectorV4(follower,{...discoverEnginePistonFixturesV4('4368.dat').connectors[0],group:'other'}).compatible,false)
})

test('fixture positions reconstruct the four LDraw HELP placements for 4369',()=>{
  const tail=-ENGINE_PISTON_TAIL_X_LDU_V4
  assert.equal(expectedSites[0][0]-tail,-61)
  assert.equal(expectedSites[2][0]+tail,61)
  assert.equal(expectedSites[1][1]+tail,57.5)
  assert.equal(expectedSites[3][1]-tail,-65.5)
})
