import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  CONNECTOR_DISCOVERY_VERSION_V4,
  discoverPrimitiveConnectorsV4,
  discoveryConnectorRoleV4,
  mergeDiscoveredConnectorsV4,
} from '../connectors-v4/discovery-v4.js'
import {
  discoverSemanticSitesV4,
  mergeSemanticSitesV4,
  semanticConnectorRoleV4,
} from '../connector-discovery/semantic-sites-v4.js'
import {
  CONNECTOR_DISCOVERY_VERSION_V4 as CONNECTOR_DISCOVERY_VERSION_V43,
  discoverPrimitiveConnectorsV4 as discoverPrimitiveConnectorsV43,
} from '../connector-discovery/discovery-v4.3.js'

const identity=(file,x=0,y=0,z=0)=>`1 16 ${x} ${y} ${z} 1 0 0 0 1 0 0 0 1 ${file}`
const pegholePair=(fileA='peghole.dat',fileB=fileA,x=0,y=0,z=0,span=20)=>[
  `1 16 ${x} ${y} ${z+span/2} 1 0 0 0 0 1 0 -1 0 ${fileA}`,
  `1 16 ${x} ${y} ${z-span/2} 1 0 0 0 0 1 0 1 0 ${fileB}`,
].join('\n')

async function scan(text,files={}){
  return discoverPrimitiveConnectorsV4('fixture.dat',text,async file=>files[String(file).replace(/\\/g,'/')]??null)
}
async function semanticScan(text,files={}){
  return discoverSemanticSitesV4('fixture.dat',text,async file=>files[String(file).replace(/\\/g,'/')]??null)
}

test('Connector Discovery finds high-confidence Technic connection primitives missed by Shadow',async()=>{
  const result=await scan([
    identity('connect.dat',0,0,0),
    identity('confric.dat',20,0,0),
    identity('connhole.dat',40,0,0),
    identity('axlehol0.dat',60,0,0),
    identity('stud.dat',80,0,0),
  ].join('\n'))
  assert.equal(result.version,CONNECTOR_DISCOVERY_VERSION_V4)
  assert.deepEqual(result.connectors.map(discoveryConnectorRoleV4),[
    'technic-pin','technic-pin','technic-pin-hole','technic-axle-hole','stud',
  ])
  assert.ok(result.connectors.every(connector=>connector.source.kind==='ldraw-primitive-discovery'))
  assert.equal(result.stats.primitiveRefs,5)
})

test('Connector Discovery follows official LDraw subparts for hidden connection sites',async()=>{
  const root=identity('s\\fixture-s01.dat')
  const child=[identity('connect.dat',0,0,0),identity('connhole.dat',20,0,0)].join('\n')
  const result=await scan(root,{'s/fixture-s01.dat':child})
  assert.deepEqual(result.connectors.map(discoveryConnectorRoleV4),['technic-pin','technic-pin-hole'])
  assert.equal(result.stats.nodes,2)
})

test('axlehol0 semantic hint preserves intentional axial scaling',async()=>{
  const result=await scan('1 16 0 0 0 1 0 0 0 2 0 0 0 1 axlehol0.dat')
  assert.equal(result.connectors.length,1)
  const connector=result.connectors[0]
  assert.equal(discoveryConnectorRoleV4(connector),'technic-axle-hole')
  assert.equal(connector.geometry.sections[0].lengthLdu,40)
})

test('ordinary connector primitives reject arbitrary scaling instead of inventing new interfaces',async()=>{
  const result=await scan('1 16 0 0 0 2 0 0 0 1 0 0 0 1 connect.dat')
  assert.equal(result.connectors.length,0)
  assert.equal(result.stats.rejectedTransforms,1)
})

test('opposed peghole ends reconstruct one canonical Technic pin receiver',async()=>{
  const result=await scan(pegholePair())
  assert.equal(result.connectors.length,1)
  assert.equal(result.stats.pegholeEnds,2)
  assert.equal(result.stats.pegholePairs,1)
  assert.equal(result.stats.unpairedPegholeEnds,0)
  const connector=result.connectors[0]
  assert.equal(discoveryConnectorRoleV4(connector),'technic-pin-hole')
  assert.equal(connector.discovery.confidence,'primitive-pair-verified')
  assert.deepEqual(connector.frame.positionLdu,[0,0,0])
  assert.deepEqual(connector.geometry.sections.map(section=>[section.radiusLdu,section.lengthLdu]),[[8,2],[6,16],[8,2]])
  assert.equal(connector.source.kind,'ldraw-peghole-pair-discovery')
})

test('extended peghole variants participate in the same paired-hole reconstruction',async()=>{
  const result=await scan(pegholePair('peghole3.dat','peghole6.dat',20,10,0,20))
  assert.equal(result.connectors.length,1)
  assert.equal(result.stats.pegholePairs,1)
  assert.deepEqual(result.connectors[0].discovery.variants,['peghole3.dat','peghole6.dat'])
})

test('a single or non-facing peghole edge never becomes an independently occupiable endpoint',async()=>{
  const single=await scan(identity('peghole.dat'))
  assert.equal(single.connectors.length,0)
  assert.equal(single.stats.unpairedPegholeEnds,1)

  const sameDirection=await scan([
    identity('peghole.dat',0,0,0),
    identity('peghole.dat',0,20,0),
  ].join('\n'))
  assert.equal(sameDirection.connectors.length,0)
  assert.equal(sameDirection.stats.unpairedPegholeEnds,2)
})

test('multiple peghole pairs are matched locally instead of cross-pairing collinear holes',async()=>{
  const result=await scan([
    pegholePair('peghole.dat','peghole.dat',0,0,0,20),
    pegholePair('peghole2.dat','peghole2.dat',40,0,0,20),
  ].join('\n'))
  assert.equal(result.connectors.length,2)
  assert.equal(result.stats.pegholePairs,2)
  assert.deepEqual(result.connectors.map(connector=>connector.frame.positionLdu[0]).sort((a,b)=>a-b),[0,40])
})

test('discovery does not duplicate an authoritative connector already covering the same physical site',async()=>{
  const discovered=(await scan(identity('connhole.dat'))).connectors[0]
  const existing={
    schemaVersion:4,
    family:'cylinder',gender:'female',group:null,
    frame:{positionLdu:[0,0,0],orientation:[1,0,0,0,1,0,0,0,1]},
    geometry:{sections:[{shape:'R',radiusLdu:6,lengthLdu:20,elastic:false}],caps:'none',centered:true},
    snap:{slide:true},inheritance:{scale:'none',mirror:'cor'},
  }
  const merged=mergeDiscoveredConnectorsV4([existing],[discovered])
  assert.equal(merged.added.length,0)
  assert.equal(merged.suppressed,1)
})

test('reconstructed peghole receiver is suppressed by an authoritative receiver at the same region',async()=>{
  const discovered=(await scan(pegholePair())).connectors[0]
  const existing={
    schemaVersion:4,
    family:'cylinder',gender:'female',group:null,
    frame:{positionLdu:[0,0,0],orientation:[1,0,0,0,0,1,0,-1,0]},
    geometry:{sections:[{shape:'R',radiusLdu:8,lengthLdu:2},{shape:'R',radiusLdu:6,lengthLdu:16},{shape:'R',radiusLdu:8,lengthLdu:2}],caps:'none',centered:true},
    snap:{slide:true},inheritance:{scale:'none',mirror:'cor'},
  }
  const merged=mergeDiscoveredConnectorsV4([existing],[discovered])
  assert.equal(merged.added.length,0)
  assert.equal(merged.suppressed,1)
})

test('two opposite pin halves remain two valid connection regions instead of being collapsed',async()=>{
  const result=await scan([
    '1 16 0 0 0 0 1 0 0 0 -1 -1 0 0 connect.dat',
    '1 16 0 0 0 0 -1 0 0 0 -1 1 0 0 connect.dat',
  ].join('\n'))
  const merged=mergeDiscoveredConnectorsV4([],result.connectors)
  assert.equal(merged.added.length,2)
})

test('V4.3 recovers alternate standard studs and scaled anti-stud tubes',async()=>{
  const result=await semanticScan([
    identity('stud2.dat',0,0,0),
    identity('stud2a.dat',20,0,0),
    identity('studa.dat',40,0,0),
    '1 16 60 4 0 1 0 0 0 -5 0 0 0 1 stud4.dat',
  ].join('\n'))
  assert.deepEqual(result.connectors.map(semanticConnectorRoleV4),['stud','stud','stud','anti-stud'])
  const anti=result.connectors.at(-1)
  assert.deepEqual(anti.frame.positionLdu,[60,24,0])
  assert.equal(anti.geometry.sections[0].lengthLdu,20)
})

test('V4.3 centers real axle and axle-hole primitives over their transformed spans',async()=>{
  const result=await semanticScan([
    '1 16 80 0 0 0 -160 0 1 0 0 0 0 1 axle.dat',
    '1 16 0 0 -20 1 0 0 0 0 1 0 40 0 axlehole.dat',
  ].join('\n'))
  assert.deepEqual(result.connectors.map(semanticConnectorRoleV4),['technic-axle','technic-axle-hole'])
  assert.deepEqual(result.connectors[0].frame.positionLdu,[0,0,0])
  assert.equal(result.connectors[0].geometry.sections[0].lengthLdu,160)
  assert.deepEqual(result.connectors[1].frame.positionLdu,[0,0,0])
  assert.equal(result.connectors[1].geometry.sections[0].lengthLdu,40)
})

test('V4.3 anti-stud merge is suppressed by the authoritative Shadow region',async()=>{
  const discovered=(await semanticScan('1 16 0 4 0 1 0 0 0 -5 0 0 0 1 stud4.dat')).connectors[0]
  const existing={
    schemaVersion:4,family:'cylinder',gender:'female',group:null,
    frame:{positionLdu:[0,24,0],orientation:[1,0,0,0,1,0,0,0,1]},
    geometry:{sections:[{shape:'R',radiusLdu:6,lengthLdu:20}],caps:'one',centered:false},
    snap:{slide:false},inheritance:{scale:'none',mirror:'cor'},
  }
  const merged=mergeSemanticSitesV4([existing],[discovered])
  assert.equal(merged.added.length,0)
  assert.equal(merged.suppressed,1)
})

test('V4.3 replaces the legacy axlehol0 origin candidate before endpoint identity assignment',async()=>{
  const result=await discoverPrimitiveConnectorsV43(
    'fixture.dat',
    '1 16 0 0 -20 1 0 0 0 0 1 0 40 0 axlehol0.dat',
    async()=>null,
  )
  assert.equal(CONNECTOR_DISCOVERY_VERSION_V43,'connector-discovery-v4.3.0')
  assert.equal(result.stats.correctedAxleHints,1)
  const hint=result.connectors.find(connector=>connector.discovery?.role==='technic-axle-hole')
  assert.ok(hint)
  assert.deepEqual(hint.frame.positionLdu,[0,0,0])
  assert.equal(hint.geometry.sections[0].lengthLdu,40)
})

test('production bootstrap mounts Connector Discovery V4.3 after Connector V4 and before editor evaluation',async()=>{
  const bootstrap=await readFile(new URL('../bootstrap.js',import.meta.url),'utf8')
  const connectorV4=bootstrap.indexOf("await import('./connectors-v4/runtime-v4.js')")
  const discovery=bootstrap.indexOf("./connectors-v4/discovery-runtime-v4.js?v=connector-discovery-20260914-v1")
  const app=bootstrap.indexOf("await import('./app.js')")
  assert.ok(connectorV4>=0)
  assert.ok(discovery>connectorV4)
  assert.ok(app>discovery)
})
