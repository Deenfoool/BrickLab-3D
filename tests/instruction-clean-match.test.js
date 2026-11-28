import test from 'node:test'
import assert from 'node:assert/strict'
import {cleanComponent,prepareCleanReferences,cleanMatch} from '../src/sets/instruction-clean-match.js'
const part=(color,w=40,h=40)=>{
 const p=new Uint8ClampedArray(w*h*4).fill(255)
 for(let y=8;y<32;y++)for(let x=5;x<35;x++){const i=(y*w+x)*4;p.set([...color,255],i)}
 return {pixels:p,aspect:0}
}
test('remove stray small artwork without erasing largest shape',()=>{
 const p=new Uint8ClampedArray(80*100*4)
 for(let y=20;y<50;y++)for(let x=15;x<65;x++)p[(y*100+x)*4+3]=255
 for(let y=6;y<14;y++)for(let x=81;x<89;x++)p[(y*100+x)*4+3]=255
 const clean=cleanComponent(p,100,80)
 assert.deepEqual(clean.box,[15,20,65,50]);assert.equal(clean.pixels[(6*100+81)*4+3],0)
 for(let y=0;y<18;y++)for(let x=0;x<40;x++)p[(y*100+x)*4+3]=255
 assert.equal(cleanComponent(p,100,80),null)
})
test('clean matching preserves gray shade and vetoes ambiguous or conflicting raw evidence',()=>{
 const a={item:['a','71'],clean:part([90,90,90])},b={item:['a','72'],clean:part([165,165,165])}
 const refs=prepareCleanReferences([a,b])
 const raw=[{reference:a,score:.04},{reference:b,score:.08}]
 assert.deepEqual(cleanMatch({clean:a.clean},refs,raw),a.item)
 assert.equal(cleanMatch({clean:a.clean},refs,[{reference:a,score:.09},{reference:b,score:.01}]),undefined)
 assert.equal(cleanMatch({clean:a.clean},prepareCleanReferences([a,{...b,clean:a.clean}]),raw),undefined)
})
