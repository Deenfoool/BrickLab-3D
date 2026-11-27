import {test} from 'node:test'
import assert from 'node:assert/strict'
import {moveItem,sortableHandle} from '../src/menu/sortable-handle.js'
test('shared handle moves by pointer without requiring visible arrow buttons, supports cancel and keyboard',()=>{
 const old=globalThis.document;globalThis.document={createElement:()=>({setAttribute(){},setPointerCapture(){}})}
 const rows=Array.from({length:3},(_,i)=>({getBoundingClientRect:()=>({top:i*50,left:0,width:100,height:50}),classList:{add(){},remove(){},toggle(){}}}))
 try{
  const list={children:rows},moves=[],grip=sortableHandle({row:rows[0],list,index:0,label:'Move',move:(a,b)=>moves.push([a,b])})
  const e={button:0,pointerId:1,clientX:50,clientY:120,preventDefault(){}}
  grip.onpointerdown(e);grip.onpointermove(e);grip.onpointerup(e);assert.deepEqual(moves,[[0,2]])
  grip.onpointerdown(e);grip.onpointermove(e);grip.onpointercancel(e);assert.equal(moves.length,1)
  grip.onkeydown({key:'ArrowDown',preventDefault(){}});assert.deepEqual(moves[1],[0,1])
  assert.deepEqual(moveItem(['a','b','c'],0,2),['b','c','a'])
  assert.deepEqual(moveItem(['a'],0,2),['a'])
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old}
})
