import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseShadowTextV4, expandGridV4 } from '../connectors-v4/ldcad-parser-v4.js'
import { createShadowResolverV4 } from '../connectors-v4/shadow-resolver-v4.js'

const cyl = '0 !LDCAD SNAP_CYL [gender=M] [secs=R 6 20]'
for (const option of ['[pos=0 nope 0]','[ori=1 0 0]','[gender=unknown]','[caps=maybe]','[slide=maybe]','[newPhysics=1]','[gender=F]','junk','[grid=999999 2 20 20]']) {
  test(`parser fails closed: ${option}`, () => {
    const parsed = parseShadowTextV4(`${cyl} ${option}`)
    assert.equal(parsed.operations.length, 0)
    assert.ok(parsed.warnings.some(w => w.code === 'invalid-snap-meta'))
  })
}
test('numeric tokens cannot disappear from a finger sequence', () => {
  assert.equal(parseShadowTextV4('0 !LDCAD SNAP_FGR [radius=6] [seq=4 bad 4]').operations.length,0)
})
test('grid budget also protects callers with pre-parsed input', () => {
  assert.throws(() => expandGridV4({xCount:1e12}), /budget/)
})
test('corZ inheritance preserves X and Y and corrects reflected Z', async () => {
  const resolver=createShadowResolverV4({
    fetchOfficialText:async p=>p==='parts/root.dat'?'1 16 0 0 0 1 0 0 0 1 0 0 0 -1 probe.dat':null,
    fetchShadowText:async p=>p==='parts/probe.dat'?`${cyl} [mirror=corZ]`:null,
  })
  const result=await resolver.resolve('root.dat')
  assert.equal(result.warnings.length,0)
  assert.deepEqual(result.connectors[0].frame.orientation.map(x=>x||0),[1,0,0,0,1,0,0,0,1])
})
test('network failures are retryable, confirmed missing files are cached', async () => {
  let attempts=0
  const resolver=createShadowResolverV4({fetchOfficialText:async()=>null,fetchShadowText:async()=>{
    if (++attempts===1) throw new Error('network')
    return cyl
  }})
  await assert.rejects(()=>resolver.resolve('retry.dat'),/network/)
  assert.equal((await resolver.resolve('retry.dat')).connectors.length,1)
  await resolver.resolve('retry.dat')
  assert.equal(attempts,2)
})
test('pinned Shadow fixture lines either validate or explicitly quarantine; never silently ignore',()=>{
  const pack=JSON.parse(readFileSync(new URL('fixtures/shadow-v4.json',import.meta.url)))
  assert.equal(pack.commit,'f2fb70c55521e0dfdf2af4d26a87167d4d0d9eec')
  for(const [file,text] of Object.entries(pack.files)) {
    const parsed=parseShadowTextV4(text,{file})
    const metas=text.split(/\r?\n/).filter(l=>/^0 !LDCAD SNAP_/.test(l))
    assert.equal(parsed.operations.length+parsed.warnings.filter(w=>w.code==='invalid-snap-meta').length,metas.length,file)
  }
})

import * as THREE from 'three'
import { connectorToBrickLabV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { solvePlacementV4, applyPlacementV4 } from '../connectors-v4/placement-solver-v4.js'
import { validateConnectedGeometryV4 } from '../connectors-v4/validity-v4.js'
import { evaluateAxialOffsetV4, cylinderAxialWindowsV4 } from '../connectors-v4/axial-fit-v4.js'
import { createConnectionGraphV4, createConnectionProposalV4 } from '../connectors-v4/connections-v4.js'
import { restoreRecordsIntoGraphV4 } from '../connectors-v4/persistence-v4.js'
import { activationForMatchV4 } from '../connectors-v4/activation-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'
import { v4OwnsLegacyCandidate } from '../connectors-v4/snapping-bridge-v4.js'
function endpoint(meta,id) {
  const c=parseShadowTextV4(`0 !LDCAD ${meta}`).operations[0].connector
  c.endpointId=id
  return connectorToBrickLabV4(c)
}
const axle=endpoint('SNAP_CYL [gender=M] [caps=none] [secs=A 6 240] [center=true] [slide=true]','axle')
const hole=endpoint('SNAP_CYL [gender=F] [caps=none] [secs=R 8 2 R 6 16 R 8 2] [center=true] [slide=true]','hole')
function obj(id){const o=new THREE.Group();o.userData={instanceId:id,partId:`ldraw-${id}`};return o}
function proposal(a,b,ca,cb){const solution=solvePlacementV4(a,ca,b,cb);return createConnectionProposalV4({source:ca,target:cb,sourceObject:a,targetObject:b,solution,match:solution.match})}
test('long axle has distinct valid placements through three holes; touching spans are legal',()=>{
  const graph=createConnectionGraphV4(),a=obj('axle')
  for(const [i,y] of [-3,0,3].entries()) {const b=obj(`beam${i}`);b.position.y=y;const p=proposal(a,b,axle,hole);assert.equal(graph.add(p).accepted,true)}
  assert.equal(graph.stats().connections,3)
})
test('ball/socket accepts arbitrary orientation but rejects separated centers',()=>{
  const ca=endpoint('SNAP_GEN [gender=M] [bounding=sph 8] [placement=free] [match=size]','ball')
  const cb=endpoint('SNAP_GEN [gender=F] [bounding=sph 8] [placement=free] [match=size]','socket')
  const a=obj('a'),b=obj('b');a.rotation.set(.8,.4,1.3)
  const before=a.quaternion.clone();applyPlacementV4(a,solvePlacementV4(a,ca,b,cb))
  assert.ok(a.quaternion.angleTo(before)<1e-7)
  assert.equal(validateConnectedGeometryV4(a,ca,b,cb).valid,true)
  a.position.y=.1;assert.equal(validateConnectedGeometryV4(a,ca,b,cb).valid,false)
})
test('bar/clip reserves a finite interval and rejects a too-small bar',()=>{
  const bar=endpoint('SNAP_CYL [gender=M] [caps=none] [secs=R 4 80] [slide=true] [center=true]','bar')
  const clip=endpoint('SNAP_CLP [radius=4] [length=8] [center=true]','clip')
  const p=proposal(obj('bar'),obj('clip'),bar,clip)
  assert.deepEqual(p.occupancy.interval,[-4,4])
  assert.equal(p.occupancyReady,true)
  const small=structuredClone(bar);small.geometry.sections[0].radiusLdu=2
  assert.equal(matchConnectorV4(small,clip).compatible,false)
})
test('closed male shoulder blocks a sleeve; elastic pin tips compress only to neighbouring profile',()=>{
  const capped=endpoint('SNAP_CYL [gender=M] [caps=A] [secs=R 6 20]','stop')
  assert.equal(evaluateAxialOffsetV4(capped,hole,0).reason,'male-cap')
  const pin=endpoint('SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2 R 6 16 R 8 4 R 6 16 _L 6.25 2] [center=true] [slide=true]','pin')
  assert.equal(evaluateAxialOffsetV4(pin,hole,10).valid,true)
  assert.equal(evaluateAxialOffsetV4(pin,hole,0).reason,'profile-collision')
  assert.equal(evaluateAxialOffsetV4(pin,hole,NaN).valid,false)
})
test('exact fit with two shoulders retains a zero-width placement window',()=>{
  const a=endpoint('SNAP_CYL [gender=M] [caps=two] [secs=R 6 20]','a')
  const b=endpoint('SNAP_CYL [gender=F] [caps=two] [secs=R 6 20]','b')
  assert.deepEqual(cylinderAxialWindowsV4(a,b).movingWindows,[[0,0]])
})
test('scaled scene objects cannot use unscaled connector dimensions',()=>{
  const a=obj('a');a.scale.setScalar(2)
  assert.throws(()=>solvePlacementV4(a,axle,obj('b'),hole),/unit-scale/)
})
test('graph replacement releases old occupancy and persistence distrusts imported certification',()=>{
  const graph=createConnectionGraphV4(),a=obj('a'),b=obj('b')
  const p=proposal(a,b,axle,hole);assert.equal(graph.add(p).accepted,true)
  b.position.y=3;const next=proposal(a,b,axle,hole)
  assert.equal(graph.replace(next).accepted,true)
  assert.notDeepEqual(graph.get(p.id).occupancy.interval,p.occupancy.interval)
  const restored=createConnectionGraphV4()
  assert.equal(restoreRecordsIntoGraphV4(restored,[{...next,physicsReady:true}]).restored,1)
  assert.equal(restored.get(next.id).physicsReady,false)
  assert.equal(restoreRecordsIntoGraphV4(restored,[{...next,graphVersion:'future'}]).rejected,1)
})
test('certified BUILD families do not claim unproven persisted physics',()=>{
  const policy=activationForMatchV4(axle,hole,matchConnectorV4(axle,hole))
  assert.equal(policy.active,true);assert.equal(policy.family,'technic-axle-round-hole');assert.equal(policy.physics,false)
})
test('V4 strict ownership applies only when both structural sides are LDraw',()=>{
  const a=obj('a'),b=obj('b')
  const native=new THREE.Group();native.userData={instanceId:'native',partId:'technic-beam-1x6'}
  assert.equal(v4OwnsLegacyCandidate(a,{kind:'fixed',targetObject:b}),true)
  assert.equal(v4OwnsLegacyCandidate(a,{kind:'fixed',targetObject:native}),false)
  assert.equal(v4OwnsLegacyCandidate(native,{kind:'fixed',targetObject:a}),false)
  assert.equal(v4OwnsLegacyCandidate(a,{kind:'gear-mesh',targetObject:b}),false)
})
