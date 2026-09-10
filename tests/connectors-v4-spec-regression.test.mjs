import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'

import { expandGridV4, parseGridV4, parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { applyPlacementV4, solvePlacementV4 } from '../connectors-v4/placement-solver-v4.js'

function parsedConnector(line) {
  const parsed=parseShadowTextV4(line,{file:'spec-fixture.dat'})
  assert.equal(parsed.warnings.length,0,JSON.stringify(parsed.warnings))
  const connector=parsed.operations.find(item=>item.type==='connector')?.connector
  assert.ok(connector)
  return connector
}

function convertedGeneric(line,positionStud=[0,0,0]) {
  const connector=parsedConnector(line)
  connector.frame.positionStud=[...positionStud]
  connector.frame.orientationBrickLab=[1,0,0,0,1,0,0,0,1]
  connector.frame.axis=[0,-1,0]
  return connector
}

test('LDCad extended grid accepts X/Y/Z counts with independently centered axes',()=>{
  const grid=parseGridV4('1 C 2 1 0 46 0')
  assert.deepEqual(grid,{
    dimensions:3,
    xCount:1,yCount:2,zCount:1,
    centerX:false,centerY:true,centerZ:false,
    stepX:0,stepY:46,stepZ:0,
  })
  assert.deepEqual(expandGridV4(grid),[[0,-23,0],[0,23,0]])
})

test('LDCad classic X/Z grid remains backward-compatible and has implicit Y=0',()=>{
  const grid=parseGridV4('C 4 C 2 20 20')
  assert.deepEqual(grid,{xCount:4,zCount:2,centerX:true,centerZ:true,stepX:20,stepZ:20})
  const points=expandGridV4(grid)
  assert.equal(points.length,8)
  assert.ok(points.every(point=>point[1]===0))
  assert.deepEqual(points[0],[-30,0,-10])
  assert.deepEqual(points.at(-1),[30,0,10])
})

test('SNAP_FGR is centered by default while SNAP_CYL remains non-centered by default',()=>{
  const fingers=parsedConnector('0 !LDCAD SNAP_FGR [genderOfs=M] [seq=4 8 4] [radius=4]')
  const cylinder=parsedConnector('0 !LDCAD SNAP_CYL [gender=M] [secs=R 6 4]')
  assert.equal(fingers.geometry.centered,true)
  assert.equal(cylinder.geometry.centered,false)
})

test('SNAP_GEN permits omitted groups and defaults to shape matching',()=>{
  const male=parsedConnector('0 !LDCAD SNAP_GEN [gender=M] [bounding=sph 8] [placement=free]')
  const femaleDifferentSize=parsedConnector('0 !LDCAD SNAP_GEN [gender=F] [bounding=sph 10] [placement=free]')
  assert.equal(male.group,null)
  assert.equal(male.snap.match,'shape')
  const shapeMatch=matchConnectorV4(male,femaleDifferentSize)
  assert.equal(shapeMatch.compatible,true)
  assert.equal(shapeMatch.matchMode,'shape')

  const strictSize=parsedConnector('0 !LDCAD SNAP_GEN [gender=F] [bounding=sph 10] [match=size] [placement=free]')
  assert.equal(matchConnectorV4(male,strictSize).compatible,false)
})

test('SNAP_GEN group mode ignores bounding shape but never crosses group names',()=>{
  const male=parsedConnector('0 !LDCAD SNAP_GEN [group=electrical] [gender=M] [bounding=box 10 8 4] [match=group]')
  const female=parsedConnector('0 !LDCAD SNAP_GEN [group=electrical] [gender=F] [bounding=sph 99] [match=group]')
  const other=parsedConnector('0 !LDCAD SNAP_GEN [group=other] [gender=F] [bounding=box 10 8 4] [match=group]')
  assert.equal(matchConnectorV4(male,female).compatible,true)
  assert.equal(matchConnectorV4(male,other).compatible,false)
})

test('SNAP_GEN retain preserves the dragged part orientation while solving translation',()=>{
  const movingConnector=convertedGeneric('0 !LDCAD SNAP_GEN [group=door] [gender=M] [bounding=box 5 5 5] [match=size] [placement=retain]')
  const targetConnector=convertedGeneric('0 !LDCAD SNAP_GEN [group=door] [gender=F] [bounding=box 5 5 5] [match=size]')
  const moving=new THREE.Object3D()
  moving.position.set(-2,3,1)
  moving.rotation.set(0.35,-0.7,0.2)
  moving.updateMatrixWorld(true)
  const before=moving.quaternion.clone()
  const target=new THREE.Object3D()
  target.position.set(5,1,-4)
  target.rotation.set(-0.4,0.1,0.8)
  target.updateMatrixWorld(true)

  const solution=solvePlacementV4(moving,movingConnector,target,targetConnector)
  assert.equal(solution.valid,true)
  assert.equal(solution.placementMode,'retain')
  assert.equal(solution.preserveMovingOrientation,true)
  applyPlacementV4(moving,solution)
  assert.ok(1-Math.abs(before.dot(moving.quaternion))<1e-10)
})
