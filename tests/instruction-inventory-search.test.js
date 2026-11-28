import test from 'node:test'
import assert from 'node:assert/strict'
import {inventoryEvidence,inventoryPageOrder,candidateWindow} from '../src/sets/instruction-inventory-search.js'
test('printed inventory IDs take priority over blank and quantity-only pages',()=>{
 const labels={'1234567':['a','1'],'7654321':['b','2']}
 const evidence=text=>inventoryEvidence(text.map(text=>({text})),labels)
 const entries=[{page:100,...evidence([])},{page:99,...evidence(['1234567','2x'])},{page:98,...evidence(['1234567','7654321','1x','3x'])},{page:97,...evidence(['1x','5x'])}]
 assert.deepEqual(inventoryPageOrder(entries).map(e=>e.page),[98,99,100,97])
 assert.equal(evidence(['1234567','1234567','9999999']).known,1)
})
test('artwork search tolerances follow caption font size',()=>{
 const small=candidateWindow({box:[0,0,10,5]},false),large=candidateWindow({box:[0,0,10,15]},false)
 assert.ok(large.above>small.above);assert.ok(large.center>small.center)
 assert.ok(candidateWindow({box:[0,0,10,5]},true).above>small.above)
})
