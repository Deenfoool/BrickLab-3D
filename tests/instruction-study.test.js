import test from 'node:test'
import assert from 'node:assert/strict'
import {stepForCallout,repeatedArtwork,pageCallouts,pageRequirements,correctedRegions,regionKey,reconcileCallouts,loadCorrections,saveCorrections,otherPageCorrections,reuseCorrections,visualKeyForSample} from '../src/sets/instruction-study.js'
const a=[1000,1300,500,500],b=[2000,1300,500,500],c=[1000,4000,500,500]
const item={partNum:'32316',colorId:'72',quantity:10,used:4,spare:false}
test('step labels are assigned only with nearby unambiguous layout evidence',()=>{
 assert.equal(stepForCallout(a,[{number:17,box:[800,900,120,200]}]),17)
 assert.equal(stepForCallout(a,[{number:17,box:[800,900,120,200]},{number:18,box:[900,900,120,200]}]),null)
 assert.equal(stepForCallout(a,[{number:42,box:[800,9000,120,200]}]),null)
 assert.equal(stepForCallout(a,[]),null)
})
test('repeated artwork requires an exact object identity, a unique target and assembly context',()=>{
 const original={id:'img1',box:a},target={id:'img1',box:[5000,4500,600,600]},container={id:null,box:[3500,3000,3500,4000]}
 assert.deepEqual(repeatedArtwork(a,[original,target,container],[a,b]),target.box)
 assert.equal(repeatedArtwork(a,[original,target],[a,b]),null)
 assert.equal(repeatedArtwork(a,[original,target,container,{id:'img1',box:[5800,5500,600,600]}],[a,b]),null)
 assert.equal(repeatedArtwork(a,[original,target,container],[a,target.box]),null)
})
test('page list aggregates only identical part/color/step, never guesses a missing quantity or counts scene as step completion',()=>{
 const regions=[[...a,'32316','72','1234567'],[...b,'32316','72'],[...c,'32316','72']]
 const callouts=pageCallouts([{region:a,quantity:2,step:17},{region:b,quantity:3,step:17},{region:c,step:18}])
 const rows=pageRequirements(regions,callouts,[item,{...item,quantity:2,used:1,spare:true}])
 assert.equal(rows.length,2);assert.equal(rows[0].quantity,5);assert.equal(rows[0].unknownQuantity,false)
 assert.deepEqual(rows[0].inventory,{quantity:10,used:4});assert.equal(rows[0].elementId,undefined)
 assert.equal(rows[1].unknownQuantity,true);assert.equal(rows[1].quantity,0)
 assert.equal(pageRequirements([],callouts).length,3)
})
test('local corrections allow only inventory identities and leave authoritative regions unchanged',()=>{
 const authoritative=[...a,'32316','72','1234567'],shifted=[1010,1310,500,500]
 const callouts=reconcileCallouts([{region:shifted,quantity:2},{region:b,quantity:3}],[authoritative])
 assert.deepEqual(callouts[0].region,a);assert.equal(callouts[0].readonly,true)
 const changes={[regionKey(a)]:{ignore:true},[regionKey(b)]:{partNum:'32316',colorId:'72'}}
 assert.deepEqual(correctedRegions([authoritative],callouts,changes,[item]),[authoritative,[...b,'32316','72']])
 assert.deepEqual(correctedRegions([],callouts,{[regionKey(b)]:{partNum:'unknown',colorId:'72'}},[item]),[])
 assert.deepEqual(correctedRegions([[...b,'32316','72']],callouts,{[regionKey(b)]:{ignore:true}},[item]),[])
})
test('corrections are confined to the exact PDF page scope',()=>{
 const db=new Map(),storage={getItem:k=>db.get(k),setItem:(k,v)=>db.set(k,v)}
 const change={[regionKey(a)]:{partNum:'32316',colorId:'72'}}
 saveCorrections(storage,'set/fingerprint/1',change)
 assert.deepEqual({...loadCorrections(storage,'set/fingerprint/1')},change)
 assert.deepEqual({...loadCorrections(storage,'set/fingerprint/2')},{})
 assert.deepEqual({...loadCorrections(storage,'set/other-fingerprint/1')},{})
})

test('local visual memory reuses only identical artwork with no competing correction or automatic region',async()=>{
 const pixels=new Uint8ClampedArray(24*24*4).fill(127)
 const visualKey=await visualKeyForSample({pixels,aspect:0,kind:'callout'})
 assert.match(visualKey,/^[a-f0-9]{64}$/)
 assert.notEqual(await visualKeyForSample({pixels,aspect:.2,kind:'callout'}),visualKey)
 const correction={partNum:'32316',colorId:'72',visualKey}
 const calls=[{region:a,visualKey},{region:b,visualKey},{region:c,visualKey,readonly:true}]
 assert.deepEqual(reuseCorrections([[...a,'32316','72']],calls,{},[correction],[item]),[[...b,'32316','72']])
 assert.deepEqual(reuseCorrections([],calls,{[regionKey(b)]:{ignore:true,visualKey}},[correction],[item]),[])
 const db=new Map(),storage={getItem:k=>db.get(k),setItem:(k,v)=>db.set(k,v)}
 saveCorrections(storage,'set/fingerprint/1',{[regionKey(a)]:correction})
 saveCorrections(storage,'set/other/1',{[regionKey(b)]:correction})
 assert.deepEqual(otherPageCorrections(storage,'set/fingerprint/2'),[correction])
 assert.deepEqual(otherPageCorrections(storage,'set/fingerprint/1'),[])
})
