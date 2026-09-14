import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createShadowResolverV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { finalizeConnectorIdentitiesV4 } from '../connectors-v4/identity-v4.js'
import { validateConnectorV4 } from '../connectors-v4/schema-v4.js'
import { mergeDiscoveredConnectorsV4 } from '../connector-discovery/discovery-v4.3.js'

const fixture = JSON.parse(await readFile(new URL('./fixtures/connector-inheritance-v4.json',import.meta.url),'utf8'))
const options = { fetchOfficialText: async p => fixture.official[p] ?? null, fetchShadowText: async p => fixture.shadow[p] ?? null }

for (const [file, count] of [['32123a.dat',1],['32089.dat',1],['3713.dat',1],['60470.dat',7],['4488.dat',11],['p/stug-4x4.dat',16],['p/handle.dat',1],['p/confric4.dat',1],['p/axl2hole.dat',1]]) {
  test(`real LDraw ${file}: recover inherited Shadow sites with valid stable identities`,async()=>{
    const root=file.startsWith('p/')?'primitive-container.dat':file
    const opts={...options,fetchOfficialText:async p=>p==='parts/primitive-container.dat'?`1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${file}`:options.fetchOfficialText(p)}
    const old=await createShadowResolverV4({...opts,inheritancePaths:new Set()}).resolve(root)
    const first=await createShadowResolverV4(opts).resolve(root)
    const second=await createShadowResolverV4(opts).resolve(root)
    assert.equal(first.connectors.length,count)
    assert.ok(first.connectors.length>old.connectors.length)
    assert.deepEqual(first.warnings,[])
    assert.ok(first.connectors.every(c=>validateConnectorV4(c).valid))
    const a=finalizeConnectorIdentitiesV4(file,first.connectors).connectors
    const b=finalizeConnectorIdentitiesV4(file,second.connectors).connectors
    assert.deepEqual(a.map(c=>c.endpointId),b.map(c=>c.endpointId))
    assert.equal(new Set(a.map(c=>c.endpointId)).size,a.length)
  })
}

for (const file of ['3001.dat','3708.dat','3894.dat','3648.dat']) test(`existing ${file} Shadow endpoints are unchanged`,async()=>{
  const before=await createShadowResolverV4({...options,inheritancePaths:new Set()}).resolve(file)
  const after=await createShadowResolverV4(options).resolve(file)
  assert.deepEqual(after.connectors,before.connectors)
})

const ref=(file,x=0)=>`1 16 ${x} 0 0 1 0 0 0 1 0 0 0 1 ${file}`
test('nested ordinary-part inheritance composes translation and honors parent SNAP_CLEAR',async()=>{
  const official={'parts/root.dat':ref('child.dat',20),'parts/child.dat':ref('stud.dat',10)}
  let clear=false
  const resolver=()=>createShadowResolverV4({
    inheritancePaths:new Set(['parts/child.dat']),fetchOfficialText:async p=>official[p]??null,
    fetchShadowText:async p=>p==='p/stud.dat'?fixture.shadow[p]:p==='parts/root.dat'&&clear?'0 !LDCAD SNAP_CLEAR':null,
  })
  assert.deepEqual((await resolver().resolve('root.dat')).connectors[0].frame.positionLdu,[30,0,0])
  clear=true
  assert.equal((await resolver().resolve('root.dat')).connectors.length,0)
})

test('unindexed arbitrary cylinder geometry is not fetched or promoted',async()=>{
  const fetched=[]
  const result=await createShadowResolverV4({fetchOfficialText:async p=>{fetched.push(p);return ref('4-4cyli.dat')},fetchShadowText:async()=>null}).resolve('unknown.dat')
  assert.deepEqual(fetched,['parts/unknown.dat'])
  assert.equal(result.connectors.length,0)
})

test('new ordinary-part recursion fails closed on cycles and respects its budget',async()=>{
  const options={inheritancePaths:new Set(['parts/a.dat','parts/b.dat']),fetchOfficialText:async p=>ref(p==='parts/a.dat'?'b.dat':'a.dat'),fetchShadowText:async()=>null}
  const cycle=await createShadowResolverV4(options).resolve('a.dat')
  assert.match(JSON.stringify(cycle.warnings),/"code":"cycle"/)
  assert.equal(cycle.connectors.length,0)
  const bounded=await createShadowResolverV4({...options,maxNodes:1}).resolve('a.dat')
  assert.match(JSON.stringify(bounded.warnings),/"code":"node-budget"/)
})

test('uncertain new subtree is quarantined without losing existing direct Shadow sites',async()=>{
  const result=await createShadowResolverV4({
    inheritancePaths:new Set(['parts/child.dat']),
    fetchOfficialText:async p=>p==='parts/root.dat'?ref('child.dat'): '1 16 0 0 0 2 0 0 0 1 0 0 0 1 stud.dat',
    fetchShadowText:async p=>p==='p/stud.dat'||p==='parts/child.dat'?fixture.shadow['p/stud.dat']:null,
  }).resolve('root.dat')
  assert.equal(result.connectors.length,1)
  assert.equal(result.connectors[0].source.file,'parts/child.dat')
  assert.equal(result.warnings[0].code,'discovery-branch-quarantined')
  assert.match(JSON.stringify(result.warnings),/scale-rejected/)
})

test('current discovery wrapper preserves pin/round receiver duplicate protection',()=>{
  const existing={family:'cylinder',gender:'female',frame:{positionLdu:[0,0,0],orientation:[1,0,0,0,1,0,0,0,1]},geometry:{sections:[{shape:'R',radiusLdu:6,lengthLdu:20}],centered:true,caps:'none'},snap:{slide:true}}
  const discovered=structuredClone(existing)
  discovered.discovery={role:'technic-pin-hole'}
  assert.equal(mergeDiscoveredConnectorsV4([existing],[discovered]).added.length,0)
})

test('non-centered authoritative axle suppresses an overlapping centered geometry hint',async()=>{
  const existing=(await createShadowResolverV4(options).resolve('3708.dat')).connectors.filter(c=>c.gender==='male'&&c.geometry.sections?.every(s=>s.shape==='A'))
  assert.ok(existing.length)
  const a=existing[0],length=a.geometry.sections.reduce((n,s)=>n+s.lengthLdu,0)
  const discovered=structuredClone(a)
  const o=a.frame.orientation
  discovered.frame.positionLdu=a.frame.positionLdu.map((v,i)=>v-o[i*3+1]*length/2)
  discovered.geometry.centered=true
  discovered.discovery={role:'technic-axle'}
  assert.equal(mergeDiscoveredConnectorsV4(existing,[discovered]).added.length,0)
})
