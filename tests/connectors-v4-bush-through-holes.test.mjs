import test from 'node:test'
import assert from 'node:assert/strict'

import { discoverPrimitiveConnectorsV4, discoveryConnectorRoleV4 } from '../connector-discovery/discovery-v4.3.js'
import { bidirectionalCylinderPairV4 } from '../connectors-v4/placement-solver-v4.js'

const none=async()=>null
const roles=result=>result.connectors.map(discoveryConnectorRoleV4)
const through=connector=>connector?.family==='cylinder'&&connector.gender==='female'&&connector.geometry?.caps==='none'&&connector.snap?.slide===true

test('3713 Technic bush exposes one through A6 axle hole from both entry sides',async()=>{
  const text='1 16 0 0 0 1 0 0 0 1 0 0 0 1 bush.dat'
  const result=await discoverPrimitiveConnectorsV4('3713.dat',text,none)
  const holes=result.connectors.filter(c=>discoveryConnectorRoleV4(c)==='technic-axle-hole')
  assert.equal(holes.length,1)
  assert.ok(through(holes[0]))
  assert.deepEqual(holes[0].geometry.sections.map(s=>[s.shape,s.radiusLdu,s.lengthLdu]),[['A',6,20]])
  assert.equal(bidirectionalCylinderPairV4({family:'cylinder',gender:'male'},holes[0],{family:'cylinder'}),true)
})

test('32039 Axle/Bush connector preserves both independent through axle holes',async()=>{
  const text=[
    '1 16 0 0 -20 0 0 1 -1 0 0 0 -1 0 bush0.dat',
    '1 16 0 0 0 0 1 0 -1 0 0 0 0 1 bush.dat',
  ].join('\n')
  const result=await discoverPrimitiveConnectorsV4('32039.dat',text,none)
  const holes=result.connectors.filter(c=>discoveryConnectorRoleV4(c)==='technic-axle-hole')
  assert.equal(holes.length,2)
  assert.ok(holes.every(through))
  assert.ok(holes.every(h=>bidirectionalCylinderPairV4({family:'cylinder',gender:'male'},h,{family:'cylinder'})))
  assert.notDeepEqual(holes[0].frame.positionLdu,holes[1].frame.positionLdu)
})

test('3651 Pin/Bush connector exposes a two-sided axle hole and two-sided pin hole',async()=>{
  const text=[
    '1 16 0 0 0 1 0 0 0 1 0 0 0 1 bush.dat',
    '1 16 0 0 -20 0 1 0 -1 0 0 0 0 1 connhole.dat',
  ].join('\n')
  const result=await discoverPrimitiveConnectorsV4('3651.dat',text,none)
  const rs=roles(result)
  assert.ok(rs.includes('technic-axle-hole'))
  assert.ok(rs.includes('technic-pin-hole'))
  const holes=result.connectors.filter(c=>['technic-axle-hole','technic-pin-hole'].includes(discoveryConnectorRoleV4(c)))
  assert.equal(holes.length,2)
  assert.ok(holes.every(through))
  assert.ok(holes.every(h=>bidirectionalCylinderPairV4({family:'cylinder',gender:'male'},h,{family:'cylinder'})))
})
