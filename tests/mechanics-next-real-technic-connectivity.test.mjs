import test from 'node:test'
import assert from 'node:assert/strict'

import { createNativeShadowResolver } from '../mechanics-next/ldraw/shadow-resolver.js'
import { ldcadConnectorToEndpoint } from '../mechanics-next/ldraw/connector-adapter.js'
import { enrichEndpointSemantics } from '../mechanics-next/intelligence/endpoint-semantics.js'
import { matchMechanicalEndpoints } from '../mechanics-next/connectors/profile-matcher.js'

const files=new Map([
  ['parts/3701.dat',[
    '0 LDCad shadow info for "Technic Brick 1 x 4 with Holes"',
    '0 !LDCAD SNAP_INCL [ref=connhole.dat] [pos=0 10 0] [ori=1 0 0 0 0 1 0 -1 0] [grid=C 3 1 20 0]',
  ].join('\n')],
  ['p/connhole.dat','0 !LDCAD SNAP_CYL [id=connhole] [gender=F] [caps=none] [secs=R 8 2   R 6 16   R 8 2] [center=true] [slide=true]'],
  ['parts/3673.dat',[
    '0 LDCad shadow info for "Technic Pin"',
    '0 !LDCAD SNAP_CLEAR',
    '0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2   R 6 16   R 8 4   R 6 16   _L 6.25 2] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]',
  ].join('\n')],
  ['parts/3705.dat','0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=A 6 80] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]'],
])

const endpoint=(connector,bodyId)=>enrichEndpointSemantics(ldcadConnectorToEndpoint(connector,{bodyId,partId:bodyId}))

test('native Shadow resolver finds primitive p/ includes used by real Technic holes',async()=>{
  const requests=[]
  const resolver=createNativeShadowResolver({
    fetchShadowText:async path=>{
      requests.push(path)
      return files.get(path)??null
    },
  })
  const brick=await resolver.resolve('parts/3701.dat')
  assert.equal(brick.connectors.length,3)
  assert.ok(requests.includes('p/connhole.dat'))
  assert.ok(brick.connectors.every(connector=>connector.family==='cylinder'&&connector.gender==='female'))
})

test('real LDCad Technic pin profile matches inherited connhole receiver',async()=>{
  const resolver=createNativeShadowResolver({fetchShadowText:async path=>files.get(path)??null})
  const [pin,brick]=await Promise.all([
    resolver.resolve('parts/3673.dat'),
    resolver.resolve('parts/3701.dat'),
  ])
  const male=endpoint(pin.connectors.find(item=>item.gender==='male'),'pin-body')
  const female=endpoint(brick.connectors[0],'brick-body')
  assert.equal(male.metadata.semantics.semanticKind,'technic-pin')
  assert.equal(female.metadata.semantics.semanticKind,'technic-pin-hole')
  const match=matchMechanicalEndpoints(male,female)
  assert.equal(match.compatible,true)
  assert.equal(match.interfaceRule?.kind,'revolute')
})

test('real LDCad A6 axle profile matches inherited Technic round hole',async()=>{
  const resolver=createNativeShadowResolver({fetchShadowText:async path=>files.get(path)??null})
  const [axle,brick]=await Promise.all([
    resolver.resolve('parts/3705.dat'),
    resolver.resolve('parts/3701.dat'),
  ])
  const male=endpoint(axle.connectors[0],'axle-body')
  const female=endpoint(brick.connectors[0],'brick-body')
  assert.equal(male.metadata.semantics.semanticKind,'technic-axle')
  assert.equal(female.metadata.semantics.semanticKind,'technic-pin-hole')
  const match=matchMechanicalEndpoints(male,female)
  assert.equal(match.compatible,true)
  assert.equal(match.interfaceRule?.kind,'cylindrical')
})
