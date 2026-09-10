import test from 'node:test'
import assert from 'node:assert/strict'

import { createShadowResolverV4 } from '../connectors-v4/shadow-resolver-v4.js'
import { finalizeConnectorIdentitiesV4 } from '../connectors-v4/identity-v4.js'
import { matchConnectorV4 } from '../connectors-v4/matcher-v4.js'

// These are deliberately small textual snapshots of connectivity-relevant lines
// from the pinned upstream libraries, not invented BrickLab geometry. Keeping the
// fixture minimal makes regressions readable while the source commit is recorded
// in schema-v4.js / NOTICE_CONNECTORS.md.

const STUD_SHADOW='0 !LDCAD SNAP_CYL [ID=studC] [gender=M] [caps=one] [secs=R 6 4]'
const CONNHOLE_SHADOW='0 !LDCAD SNAP_CYL [id=connhole] [gender=F] [caps=none] [secs=R 8 2   R 6 16   R 8 2] [center=true] [slide=true]'
const PIN_3673_SHADOW=[
  '0 !LDCAD SNAP_CLEAR',
  '0 !LDCAD SNAP_CYL [gender=M] [caps=none] [secs=L_ 6.25 2   R 6 16   R 8 4   R 6 16   _L 6.25 2] [center=true] [slide=true] [ori=0 -1 0 1 0 0 0 0 1]',
  '0 !LDCAD SNAP_CYL [gender=F] [caps=none] [secs=R 4 40] [center=true] [ori=0 -1 0 1 0 0 0 0 1]',
].join('\n')

function resolverFor(official,shadow) {
  return createShadowResolverV4({
    fetchOfficialText:async path=>official.get(path)??null,
    fetchShadowText:async path=>shadow.get(path)??null,
  })
}

test('pinned 3001 connectivity fixture resolves eight studs and eight underside receivers with unique endpoint IDs',async()=>{
  const official=new Map([
    ['parts/3001.dat','0 Brick 2 x 4\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 s/3001s01.dat'],
    ['parts/s/3001s01.dat',[
      '0 ~Brick 2 x 4 without Front and Back Faces',
      '1 16 30 0 10 1 0 0 0 1 0 0 0 1 stud.dat',
      '1 16 10 0 10 1 0 0 0 1 0 0 0 1 stud.dat',
      '1 16 -10 0 10 1 0 0 0 1 0 0 0 1 stud.dat',
      '1 16 -30 0 10 1 0 0 0 1 0 0 0 1 stud.dat',
      '1 16 30 0 -10 1 0 0 0 1 0 0 0 1 stud.dat',
      '1 16 10 0 -10 1 0 0 0 1 0 0 0 1 stud.dat',
      '1 16 -10 0 -10 1 0 0 0 1 0 0 0 1 stud.dat',
      '1 16 -30 0 -10 1 0 0 0 1 0 0 0 1 stud.dat',
    ].join('\n')],
  ])
  const shadow=new Map([
    ['p/stud.dat',STUD_SHADOW],
    ['parts/s/3001s01.dat','0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=R 6 20] [pos=0 24 0] [grid=C 4 C 2 20 20]'],
  ])
  const resolved=await resolverFor(official,shadow).resolve('3001.dat')
  assert.equal(resolved.warnings.length,0,JSON.stringify(resolved.warnings))
  assert.equal(resolved.connectors.filter(c=>c.gender==='male').length,8)
  assert.equal(resolved.connectors.filter(c=>c.gender==='female').length,8)
  const finalized=finalizeConnectorIdentitiesV4(resolved.file,resolved.connectors)
  assert.equal(finalized.stats.output,16)
  assert.equal(finalized.stats.deduplicated,0)
  assert.equal(new Set(finalized.connectors.map(c=>c.endpointId)).size,16)
})

test('pinned 3894 top-level shadow expands five through-holes and six underside receivers',async()=>{
  const official=new Map([['parts/3894.dat','0 Technic Brick 1 x 6 with Holes']])
  const shadow=new Map([
    ['p/connhole.dat',CONNHOLE_SHADOW],
    ['parts/3894.dat',[
      '0 !LDCAD SNAP_INCL [ref=connhole.dat] [pos=0 10 0] [ori=1 0 0 0 0 1 0 -1 0] [grid=C 5 1 20 0]',
      '0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=S 6 4] [pos=0 24 0] [grid=C 6 1 20 0]',
    ].join('\n')],
  ])
  const resolved=await resolverFor(official,shadow).resolve('3894.dat')
  assert.equal(resolved.warnings.length,0,JSON.stringify(resolved.warnings))
  assert.equal(resolved.connectors.length,11)
  const holes=resolved.connectors.filter(c=>c.id==='connhole')
  assert.equal(holes.length,5)
  assert.deepEqual(holes.map(c=>c.frame.positionLdu[0]).sort((a,b)=>a-b),[-40,-20,0,20,40])
  assert.equal(resolved.connectors.filter(c=>c.gender==='female' && c.geometry.sections[0].shape==='S').length,6)
})

test('pinned 2780 inherits the complete 3673 pin profile instead of fragmenting it into point connectors',async()=>{
  const official=new Map([['parts/2780.dat','0 Technic Pin with Friction and Slots']])
  const shadow=new Map([
    ['parts/2780.dat','0 !LDCAD SNAP_INCL [ref=3673.dat]'],
    ['parts/3673.dat',PIN_3673_SHADOW],
  ])
  const resolved=await resolverFor(official,shadow).resolve('2780.dat')
  assert.equal(resolved.warnings.length,0,JSON.stringify(resolved.warnings))
  assert.equal(resolved.connectors.length,2)
  const male=resolved.connectors.find(c=>c.gender==='male')
  const female=resolved.connectors.find(c=>c.gender==='female')
  assert.deepEqual(male.geometry.sections.map(s=>[s.shape,s.radiusLdu,s.lengthLdu]),[
    ['L_',6.25,2],['R',6,16],['R',8,4],['R',6,16],['_L',6.25,2],
  ])
  assert.equal(male.snap.slide,true)
  assert.equal(female.geometry.sections[0].radiusLdu,4)
  assert.equal(female.geometry.sections[0].lengthLdu,40)
})

test('pinned axle and Technic hole fixture matches geometrically but remains non-physical until an explicit rule approves it',()=>{
  const axle={
    schemaVersion:4,family:'cylinder',gender:'male',group:null,
    frame:{positionLdu:[0,0,0],orientation:[0,-1,0,1,0,0,0,0,1]},
    geometry:{sections:[{shape:'A',radiusLdu:6,lengthLdu:80,elastic:false}],caps:'none',centered:true},
    snap:{slide:true},inheritance:{scale:'none',mirror:'cor'},source:{kind:'fixture'},
  }
  const parsedHole={
    schemaVersion:4,family:'cylinder',gender:'female',group:null,
    frame:{positionLdu:[0,0,0],orientation:[1,0,0,0,1,0,0,0,1]},
    geometry:{sections:[
      {shape:'R',radiusLdu:8,lengthLdu:2,elastic:false},
      {shape:'R',radiusLdu:6,lengthLdu:16,elastic:false},
      {shape:'R',radiusLdu:8,lengthLdu:2,elastic:false},
    ],caps:'none',centered:true},
    snap:{slide:true},inheritance:{scale:'none',mirror:'cor'},source:{kind:'fixture'},
  }
  const match=matchConnectorV4(axle,parsedHole)
  assert.equal(match.compatible,true)
  assert.equal(match.keyed,false)
  assert.equal(match.kinematicHint,'cylindrical')
  assert.equal(match.physicsReady,false)
})
