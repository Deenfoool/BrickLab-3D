import test from 'node:test'
import assert from 'node:assert/strict'
import {boundedTask} from '../src/sets/instruction-task.js'
import {inventoryCaptions} from '../src/sets/instruction-recognition-worker.js'
test('a canceled page stops awaiting analysis and late completion is harmless',async()=>{
 const controller=new AbortController()
 let finish
 const task=new Promise(resolve=>{finish=resolve})
 const result=boundedTask(task,controller.signal,1000)
 controller.abort()
 await assert.rejects(result,{name:'AbortError'})
 finish('old page')
 assert.equal(await boundedTask(Promise.resolve('new page'),new AbortController().signal), 'new page')
})
test('unresponsive analysis has a deadline and a late failure is handled',async()=>{
 let fail
 const task=new Promise((_,reject)=>{fail=reject})
 await assert.rejects(boundedTask(task,new AbortController().signal,5),{name:'TimeoutError'})
 fail(Error('late failure'))
 await new Promise(resolve=>setTimeout(resolve,0))
 const controller=new AbortController();controller.abort()
 await assert.rejects(boundedTask(Promise.reject(Error('already failed')),controller.signal),{name:'AbortError'})
})
test('a quantity caption can belong to at most one exact element ID and ambiguous ties remain unknown',()=>{
 const q={text:'2x',box:[10,10,18,16]}
 const a={text:'1234567',box:[10,19,30,25]},b={text:'1234568',box:[10,20,30,26]}
 assert.deepEqual(inventoryCaptions([a,b],[q]),[a,b])
 const far={...b,box:[10,24,30,30]}
 const out=inventoryCaptions([a,far],[q])
 assert.equal(out[0].quantity,2)
 assert.equal(out[1].quantity,undefined)
 assert.equal(out[0].quantityToken,q)
})
