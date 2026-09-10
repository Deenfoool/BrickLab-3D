import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Window} from 'happy-dom'
import * as THREE from 'three'
const dom=new Window();for(const k of ['window','document','localStorage','CustomEvent','MutationObserver','CSS'])globalThis[k]=k==='window'?dom:dom[k];globalThis.requestAnimationFrame=()=>0;globalThis.setInterval=()=>0
await import('../runtime-extensions.js')
const {findPart}=await import('../parts.js')
const {buildHeroReducer,HERO_LAYOUT}=await import('../menu/hero-reducer.js')
const root=new THREE.Group(),model=buildHeroReducer(root,(id,color)=>findPart(id).create(color))
function portWorld(part){const d=findPart(part.userData.partId),p=d.connectors.find(p=>p.id===part.userData.heroPort);return part.localToWorld(new THREE.Vector3(...p.position))}
test('hero uses unit-scale production parts with shaft pivots centred on connectors',()=>{
 root.updateMatrixWorld(true)
 root.traverse(n=>{assert.deepEqual(n.scale.toArray(),[1,1,1])})
 for(const g of model.gears){const p=portWorld(g.part);assert.ok(p.distanceTo(new THREE.Vector3(HERO_LAYOUT.centres[g.shaft],0,g.z))<1e-8)}
 assert.equal(root.userData.hero.ratio,'5:1')
})
test('both gear stages share their pitch plane and exact centre distance',()=>{
 for(const [a,b] of [[0,1],[2,3]]){
 const ga=model.gears[a],gb=model.gears[b],pa=portWorld(ga.part),pb=portWorld(gb.part)
 assert.ok(Math.abs(pa.distanceTo(pb)-(ga.teeth+gb.teeth)/16)<1e-8)
 assert.ok(Math.abs(pa.z-pb.z)<1e-8)
 assert.ok(Math.abs(model.moving[ga.shaft].speed*ga.teeth+model.moving[gb.shaft].speed*gb.teeth)<1e-8)
 }
})
test('gear centres stay fixed during motion and compound gears rotate with one shaft',()=>{
 const before=model.gears.map(g=>portWorld(g.part).clone())
 for(let i=0;i<100;i++)for(const m of model.moving)m.object.rotation[m.axis]+=m.speed/60
 root.updateMatrixWorld(true)
 model.gears.forEach((g,i)=>assert.ok(portWorld(g.part).distanceTo(before[i])<1e-8))
 assert.equal(model.gears[1].part.parent,model.gears[2].part.parent)
 assert.equal(model.moving[2].speed/model.moving[0].speed,.2)
})
await dom.happyDOM.close()
test('shaft phases put teeth in spaces without twisting gears independently of keyed axles',()=>{
 for(const [a,b,na,nb] of [[0,1,12,20],[1,2,12,36]])assert.ok(Math.abs(na*model.shafts[a].rotation.z+nb*model.shafts[b].rotation.z-Math.PI)<1e-8)
 for(const g of model.gears)assert.equal(g.phase,0)
})
