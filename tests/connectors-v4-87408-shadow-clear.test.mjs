import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyConnectorV4 } from '../connectors-v4/activation-v4.js'
import { expandGridV4, parseShadowTextV4 } from '../connectors-v4/ldcad-parser-v4.js'
import {
  discoveredConnectorClearIdsV4,
  filterShadowClearedDiscoveryV4,
  rootShadowClearIdsV4,
} from '../connector-discovery/shadow-clear-policy-v4.js'

const shadow87408=`0 LDCad shadow info for "Technic Connector Toggle Joint Double with Axle and Pin Holes"
0 !LDCAD SNAP_CLEAR [id=axleHole]
0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=A 6 20] [slide=true] [grid=1 C 2 0 40]
0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=R 8 2 R 6 6 R 8 2] [center=true] [slide=true] [pos=0 -40 -25] [ori=1 0 0 0 0 1 0 -1 0] [grid=1 C 2 0 20]
0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=R 8 2 R 6 6 R 8 2] [center=true] [slide=true] [pos=0 -40 25] [ori=1 0 0 0 0 1 0 -1 0] [grid=1 C 2 0 20]`

function discovered(primitive,positionLdu=[0,0,0]){
  return{
    schemaVersion:4,
    family:'cylinder',
    gender:'female',
    group:null,
    frame:{positionLdu,orientation:[1,0,0,0,1,0,0,0,1]},
    geometry:{sections:[{shape:'A',radiusLdu:6,lengthLdu:20,elastic:false}],caps:'none',centered:true},
    snap:{slide:true},
    inheritance:{scale:'YOnly',mirror:'cor'},
    source:{kind:'ldraw-semantic-site-discovery',file:'s/87408s01.dat',primitive,meta:'TYPE1_SEMANTIC_PRIMITIVE',raw:''},
  }
}

test('87408 root Shadow defines exactly two axle holes and four pin holes',()=>{
  const parsed=parseShadowTextV4(shadow87408,{file:'parts/87408.dat'})
  const connectorOps=parsed.operations.filter(operation=>operation.type==='connector')
  const expanded=connectorOps.flatMap(operation=>expandGridV4(operation.grid).map(offset=>({operation,offset})))
  assert.equal(expanded.length,6)

  const axle=expanded.filter(item=>item.operation.connector.geometry.sections.every(section=>section.shape==='A'))
  const pin=expanded.filter(item=>item.operation.connector.geometry.sections.some(section=>section.shape==='R'))
  assert.equal(axle.length,2)
  assert.equal(pin.length,4)
  assert.ok(axle.every(item=>item.operation.connector.geometry.caps==='one'))
  assert.ok(axle.every(item=>classifyConnectorV4(item.operation.connector)==='technic-axle-hole'))
})

test('87408 SNAP_CLEAR axleHole survives into discovery policy',()=>{
  assert.deepEqual(rootShadowClearIdsV4(shadow87408,{file:'parts/87408.dat'}),['axleHole'])
  assert.deepEqual(discoveredConnectorClearIdsV4(discovered('axlehol4.dat')),['axleHole'])
  assert.deepEqual(discoveredConnectorClearIdsV4(discovered('axlehole.dat')),['axleHole'])
})

test('87408 discovery cannot resurrect cleared inherited axlehol4 endpoints',()=>{
  const clearIds=rootShadowClearIdsV4(shadow87408,{file:'parts/87408.dat'})
  const ghosts=[
    discovered('axlehol4.dat',[0,-10,-20]),
    discovered('axlehol4.dat',[0,-10,20]),
  ]
  const legitimatePin=discovered('beamhole.dat',[0,-40,-35])
  const filtered=filterShadowClearedDiscoveryV4([...ghosts,legitimatePin],clearIds)

  assert.equal(filtered.suppressed.length,2)
  assert.ok(filtered.suppressed.every(item=>item.clearId==='axleHole'))
  assert.equal(filtered.kept.length,1)
  assert.equal(filtered.kept[0],legitimatePin)
})
