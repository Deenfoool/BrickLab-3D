import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DIFFERENTIAL_FIXTURE_GROUP_V4,
  discoverDifferentialFixturesV4,
} from '../connector-discovery/differential-fixtures-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { activationForMatchV4 } from '../connectors-v4/activation-v4.js'

const expectedSeats=[
  {position:[0,0,-17],orientation:[1,0,0,0,0,1,0,-1,0]},
  {position:[0,0,17],orientation:[1,0,0,0,0,-1,0,1,0]},
  {position:[0,-17,0],orientation:[1,0,0,0,-1,0,0,0,-1]},
]

test('62821 exposes the three verified 6589 bevel gear seats from real LDraw assemblies',()=>{
  const result=discoverDifferentialFixturesV4('62821.dat')
  assert.equal(result.connectors.length,3)
  assert.equal(result.stats.housingSeats,3)
  for(let index=0;index<3;index+=1){
    const connector=result.connectors[index]
    assert.equal(connector.gender,'female')
    assert.equal(connector.group,DIFFERENTIAL_FIXTURE_GROUP_V4)
    assert.deepEqual(connector.frame.positionLdu,expectedSeats[index].position)
    assert.deepEqual(connector.frame.orientation,expectedSeats[index].orientation)
    assert.deepEqual(connector.geometry.sections.map(section=>[section.shape,section.radiusLdu,section.lengthLdu]),[['R',4,4]])
    assert.equal(connector.snap.slide,false)
  }
})

test('62821b alias receives the same three differential seats',()=>{
  const canonical=discoverDifferentialFixturesV4('62821.dat').connectors
  const alias=discoverDifferentialFixturesV4('62821b.dat').connectors
  assert.deepEqual(alias.map(item=>[item.frame.positionLdu,item.frame.orientation]),canonical.map(item=>[item.frame.positionLdu,item.frame.orientation]))
})

test('6589 gets one dedicated pivot that only mates with differential seats',()=>{
  const gear=discoverDifferentialFixturesV4('6589.dat').connectors[0]
  const seats=discoverDifferentialFixturesV4('62821.dat').connectors
  assert.ok(gear)
  assert.equal(gear.gender,'male')
  assert.equal(gear.group,DIFFERENTIAL_FIXTURE_GROUP_V4)
  for(const seat of seats){
    const match=matchConnectorV4(gear,seat)
    assert.equal(match.compatible,true)
    assert.equal(match.family,'cylinder')
    assert.equal(match.kinematicHint,'revolute')
    const activation=activationForMatchV4(gear,seat,match)
    assert.equal(activation.active,true)
    assert.equal(activation.constraintKind,'revolute')
  }

  const unrelated={...seats[0],group:null}
  assert.equal(matchConnectorV4(gear,unrelated).compatible,false)
})
