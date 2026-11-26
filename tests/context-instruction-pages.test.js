import test from 'node:test'
import assert from 'node:assert/strict'
import {generateInstructionSteps,initialInstructionSteps} from '../src/editor/instruction-steps.js'
import {bindPartContextInput} from '../src/editor/part-context-input.js'
import {instructionPdf} from '../src/editor/instruction-export.js'
const p=(id,y)=>({id,position:[0,y,0]})
const link=(a,b)=>({shaft:{part:a},socket:{part:b}})
test('auto instructions use connected parts, generate multiple pages and include every ID once',async()=>{
 const build={parts:[p('top',20),p('base',0),p('pin',5),p('free',1),p('end',30)],connections:[link('base','pin'),link('pin','top'),link('top','end')]}
 const result=generateInstructionSteps(build,2)
 assert.deepEqual(result.map(s=>s.ids),[['base','pin'],['top','end'],['free']])
 assert.deepEqual(initialInstructionSteps({...build,customInstructions:[{ids:build.parts.map(p=>p.id),angle:'iso',note:''}]}),generateInstructionSteps(build))
 assert.deepEqual(initialInstructionSteps({...build,customInstructions:[{ids:['base'],note:'Keep note',angle:'front'},{ids:['pin','top','end','free'],note:'',angle:'iso'}]})[0],{ids:['base'],note:'Keep note',angle:'front'})
 const pdf=instructionPdf(result.map(()=>({jpeg:Uint8Array.of(255,216,255,217),width:1,height:1})))
 assert.match(await pdf.text(),/\/Count 3\b/)
})
test('tiny and large builds have sensible page bounds; saved notes survive',()=>{
 assert.equal(generateInstructionSteps({parts:[p('a',0)]}).length,1)
 assert.equal(generateInstructionSteps({parts:[p('a',0),p('b',1)]}).length,2)
 const parts=Array.from({length:2000},(_,i)=>p('p'+i,i)),steps=generateInstructionSteps({parts},1)
 assert.equal(steps.length,100);assert.equal(new Set(steps.flatMap(s=>s.ids)).size,2000)
})
test('native contextmenu is suppressed before and after pointer release; camera drag does not open a menu',()=>{
 const handlers=new Map(),eventHost={addEventListener:(type,fn)=>handlers.set('window:'+type,fn)},root={addEventListener:(type,fn,opts)=>{assert.equal(opts.capture,true);assert.equal(opts.passive,false);handlers.set('root:'+type,fn)}}
 const target={},outside={},viewport={contains:t=>t===target,getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:100})},menu={contains:()=>false},calls=[]
 bindPartContextInput({root,viewport,menu,events:eventHost,signal:new AbortController().signal,enabled:()=>true,release:(e,click)=>calls.push(click),open:()=>calls.push('fallback')})
 function emit(where,type,x,time,targetNode=target){const e={target:targetNode,button:2,pointerId:1,clientX:x,clientY:20,timeStamp:time,preventDefault(){this.defaultPrevented=true}};handlers.get(where+':'+type)(e);return e}
 emit('root','pointerdown',20,10);assert.equal(emit('root','contextmenu',20,11).defaultPrevented,true)
 emit('window','pointerup',20,12);assert.equal(emit('root','contextmenu',20,13).defaultPrevented,true);assert.deepEqual(calls,[true])
 emit('root','pointerdown',20,30);emit('window','pointermove',40,31);emit('window','pointerup',40,32);assert.equal(emit('root','contextmenu',40,33).defaultPrevented,true);assert.deepEqual(calls,[true,false])
 assert.equal(emit('root','contextmenu',20,1000,outside).defaultPrevented,undefined)
 assert.equal(emit('root','contextmenu',20,1100).defaultPrevented,true);assert.deepEqual(calls,[true,false,'fallback'])
})
