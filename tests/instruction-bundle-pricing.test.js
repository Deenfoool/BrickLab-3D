import test from 'node:test'
import assert from 'node:assert/strict'
import {instructionProduct} from '../src/menu/commerce-catalog.js'
import {quoteInstructionBundle} from '../src/menu/instruction-bundle-pricing.js'
const auditedProducts=[instructionProduct('12345-1','A',601),instructionProduct('12346-1','B',1500),instructionProduct('12347-1','C',4001)]
const setIds=auditedProducts.map(p=>p.setId),account={instructions:[]}
test('bundle allocation is deterministic and sums to quoted price',()=>{
 const q=quoteInstructionBundle({setIds,auditedProducts,account,release:true})
 assert.equal(q.amountKopecks,Math.round(q.subtotalKopecks*.85))
 assert.equal(q.lines.reduce((s,l)=>s+l.amount,0),q.amountKopecks)
 assert.deepEqual(q,quoteInstructionBundle({setIds:[...setIds].reverse(),auditedProducts,account,release:true}))
})
test('bundle preview rejects owned, duplicate, unverified and unreleased sets',()=>{
 for(const opts of [{release:false},{account:{plus:true}},{account:{instructions:[setIds[0]]}},{setIds:[setIds[0],setIds[0],setIds[1]]},{auditedProducts:auditedProducts.slice(1)}])
  assert.throws(()=>quoteInstructionBundle({setIds,auditedProducts,account,release:true,...opts}))
})

test('sandbox pack is testable even with sandbox Plus active',()=>{
 const q=quoteInstructionBundle({setIds,auditedProducts,account:{plus:true,instructions:[]},release:true,sandbox:true})
 assert.equal(q.lines.length,3)
 assert.throws(()=>quoteInstructionBundle({setIds,auditedProducts,account:{plus:true,instructions:[setIds[0]]},release:true,sandbox:true}))
})
