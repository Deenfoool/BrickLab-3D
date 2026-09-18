import test from 'node:test'
import assert from 'node:assert/strict'

import { mechanicalVariable } from '../mechanics-next/core/model.js'
import {
  differentialEquation,
  gearMeshEquation,
  rigidRotationEquation,
} from '../mechanics-next/transmission/equations.js'
import { solveRotationalDrag } from '../mechanics-next/interaction/drag-driver.js'

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
