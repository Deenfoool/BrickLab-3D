import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import * as THREE from 'three'

const dom = new Window()
for (const key of ['window','document','localStorage','CustomEvent','MutationObserver','CSS']) {
  globalThis[key] = key === 'window' ? dom : dom[key]
}
globalThis.requestAnimationFrame = callback => { callback(0); return 0 }

const { PARTS } = await import('../parts.js')
const { findSnapCandidate } = await import('../snapping-v3.js')

function definition({ id, teeth, pitchRadius, anchor, axis, signs }) {
  return {
    id,
    name:id,
    defaultColor:0x999999,
    connectors:[],
    mechanics:{
      gear:{
        kind:'bevel',
        teeth,
        pitchRadius,
        meshAnchorLdu:anchor,
        meshAxisLdu:axis,
        bevelApexSigns:signs,
        meshApexToleranceStud:.16,
      },
    },
  }
}

const differential = definition({
  id:'test-ldraw-62821',
  teeth:28,
  pitchRadius:28/16,
  anchor:[0,0,27],
  axis:[0,0,1],
  signs:[-1],
})
const pinion = definition({
  id:'test-ldraw-18575',
  teeth:20,
  pitchRadius:20/16,
  anchor:[0,0,0],
  axis:[0,0,1],
  signs:[-1,1],
})
PARTS.push(differential,pinion)

function objectFor(def, instanceId) {
  const root=new THREE.Group()
  root.userData.partId=def.id
  root.userData.instanceId=instanceId
  const visual=new THREE.Group()
  visual.userData.ldrawVisual=true
  visual.scale.setScalar(1/20)
  root.add(visual)
  return root
}

test('BUILD bevel snap uses the 62821 ring plane rather than its axle-hole origin', () => {
  const fixed=objectFor(differential,'diff')
  const moving=objectFor(pinion,'pinion')
  moving.position.set(1.85,0,0)
  moving.rotation.y=Math.PI/2
  fixed.updateMatrixWorld(true)
  moving.updateMatrixWorld(true)

  const candidate=findSnapCandidate(moving,[fixed,moving],{isAvailable:()=>true})
  assert.ok(candidate)
  assert.equal(candidate.kind,'gear-mesh')
  assert.equal(candidate.gearKind,'bevel')
  assert.equal(candidate.fixedGear.teeth,28)
  assert.equal(candidate.movingGear.teeth,20)
  assert.equal(candidate.fixedGear.gearFrameSource,'ldraw-mesh-anchor')
  assert.equal(candidate.fixedGear.virtualConnector,true)
  assert.equal(candidate.movingGear.gearFrameSource,'ldraw-mesh-anchor')
  assert.equal(candidate.movingGear.virtualConnector,true)
  assert.deepEqual(candidate.fixedGear.meshLocalPosition,[0,0,27/20])
  assert.deepEqual(candidate.fixedGear.bevelApexSigns,[-1])
  assert.ok(candidate.distance<1e-9)
})

await dom.happyDOM.close()
