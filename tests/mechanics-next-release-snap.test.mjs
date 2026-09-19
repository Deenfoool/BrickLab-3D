import test from 'node:test'
import assert from 'node:assert/strict'

import { releaseSnapPlan } from '../mechanics-next/interaction/release-snap.js'

test('connector placement wins over grid placement when a candidate is visible at release',()=>{
  const candidate=Object.freeze({key:'axle-into-hole'})
  const plan=releaseSnapPlan({candidate,connectorSnapEnabled:true,gridSnapEnabled:true})

  assert.equal(plan.candidate,candidate)
  assert.equal(plan.applyGrid,false)
})

test('grid placement remains active when there is no connector candidate',()=>{
  const plan=releaseSnapPlan({candidate:null,connectorSnapEnabled:true,gridSnapEnabled:true})

  assert.equal(plan.candidate,null)
  assert.equal(plan.applyGrid,true)
})

test('disabled connector snapping never commits a stale candidate',()=>{
  const plan=releaseSnapPlan({
    candidate:Object.freeze({key:'stale'}),
    connectorSnapEnabled:false,
    gridSnapEnabled:true,
  })

  assert.equal(plan.candidate,null)
  assert.equal(plan.applyGrid,true)
})
