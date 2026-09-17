import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverBeamHolePrimitivesV4 } from '../connector-discovery/beam-hole-primitives-v4.js'
import { discoveryConnectorRoleV4, mergeDiscoveredConnectorsV4 } from '../connector-discovery/discovery-v4.3.js'

const beam15Body=[140,120,100,80,60,40,20,0,-20,-40,-60,-80,-100,-120]
  .map(z=>`1 16 0 0 ${z} 1 0 0 0 1 0 0 0 -1 beamhole.dat`)
  .join('\n')

function authoritativeEndHole(){
  return{
    schemaVersion:4,
    family:'cylinder',
    gender:'female',
    group:null,
    frame:{positionLdu:[0,0,-140],orientation:[1,0,0,0,1,0,0,0,1]},
    geometry:{
      sections:[
        {shape:'R',radiusLdu:8,lengthLdu:2,elastic:false},
        {shape:'R',radiusLdu:6,lengthLdu:16,elastic:false},
        {shape:'R',radiusLdu:8,lengthLdu:2,elastic:false},
      ],
      caps:'none',
      centered:true,
    },
    snap:{slide:true},
    inheritance:{scale:'none',mirror:'cor'},
    source:{kind:'ldcad-shadow',file:'parts/32278.dat',line:1,meta:'SNAP_INCL',raw:'connhole'},
  }
}

test('Technic Beam 15 32278 discovers all fourteen beamhole primitive receivers',async()=>{
  const discovered=await discoverBeamHolePrimitivesV4('32278.dat',beam15Body,async()=>null)
  assert.equal(discovered.connectors.length,14)
  assert.equal(discovered.stats.profiles['beamhole.dat'],14)
  assert.equal(new Set(discovered.connectors.map(connector=>connector.frame.positionLdu.join(','))).size,14)
  for(const connector of discovered.connectors){
    assert.equal(discoveryConnectorRoleV4(connector),'technic-pin-hole')
    assert.equal(connector.gender,'female')
    assert.equal(connector.geometry.caps,'none')
    assert.equal(connector.geometry.centered,true)
    assert.equal(connector.snap.slide,true)
    assert.deepEqual(connector.geometry.sections.map(section=>[section.shape,section.radiusLdu,section.lengthLdu]),[
      ['R',8,2],['R',6,16],['R',8,2],
    ])
  }
})

test('Technic Beam 15 combines fourteen primitive holes with the explicit end Shadow hole',async()=>{
  const discovered=await discoverBeamHolePrimitivesV4('32278.dat',beam15Body,async()=>null)
  const existing=[authoritativeEndHole()]
  const merged=mergeDiscoveredConnectorsV4(existing,discovered.connectors)
  assert.equal(merged.added.length,14)
  assert.equal(existing.length+merged.added.length,15)
  const zPositions=[...existing,...merged.added].map(connector=>connector.frame.positionLdu[2]).sort((a,b)=>a-b)
  assert.deepEqual(zPositions,[-140,-120,-100,-80,-60,-40,-20,0,20,40,60,80,100,120,140])
})

test('beamhol2 half-depth primitive keeps the verified R8-R6-R8 profile',async()=>{
  const text='1 16 0 0 0 1 0 0 0 1 0 0 0 1 beamhol2.dat'
  const discovered=await discoverBeamHolePrimitivesV4('fixture.dat',text,async()=>null)
  assert.equal(discovered.connectors.length,1)
  assert.deepEqual(discovered.connectors[0].geometry.sections.map(section=>[section.radiusLdu,section.lengthLdu]),[[8,2],[6,6],[8,2]])
})
