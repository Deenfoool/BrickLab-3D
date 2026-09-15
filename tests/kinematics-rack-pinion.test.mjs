import test from 'node:test'
import assert from 'node:assert/strict'
import {
  rackTravelFromRotationV1,
  solveRackPinionFollowersV1,
} from '../kinematics/rack-pinion-follow-v1.js'

test('rack travel follows pinion pitch radius and signed shaft ratio', () => {
  assert.ok(Math.abs(rackTravelFromRotationV1(360, 1, 1, 1) - Math.PI * 2) < 1e-12)
  assert.ok(Math.abs(rackTravelFromRotationV1(180, -2, 0.5, 1) + Math.PI) < 1e-12)
  assert.ok(Math.abs(rackTravelFromRotationV1(90, 1, 1, -1) + Math.PI / 2) < 1e-12)
})

test('rack follower uses propagated shaft ratio, not only the directly dragged pinion', () => {
  const result = solveRackPinionFollowersV1({
    driverAngleDeg:90,
    shaftRatios:{ input:1, output:-2 },
    shaftIdByPart:new Map([['pinion','output']]),
    meshes:[{
      id:'rack-pinion:pinion:rack',
      pinionInstanceId:'pinion',
      rackInstanceId:'rack',
      pitchRadius:0.5,
      travelSign:1,
      travelAxisWorld:{ x:1, y:0, z:0 },
    }],
  })
  assert.equal(result.conflicts.length, 0)
  assert.equal(result.targets.length, 1)
  assert.ok(Math.abs(result.targets[0].travelStud + Math.PI / 2) < 1e-12)
})

test('two incompatible pinions driving one rack fail closed', () => {
  const result = solveRackPinionFollowersV1({
    driverAngleDeg:90,
    shaftRatios:{ a:1, b:1 },
    shaftIdByPart:new Map([['pa','a'],['pb','b']]),
    meshes:[
      { id:'m1', pinionInstanceId:'pa', rackInstanceId:'rack', pitchRadius:1, travelSign:1 },
      { id:'m2', pinionInstanceId:'pb', rackInstanceId:'rack', pitchRadius:1, travelSign:-1 },
    ],
  })
  assert.equal(result.targets.length, 1)
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0].type, 'rack-pinion-conflict')
})
