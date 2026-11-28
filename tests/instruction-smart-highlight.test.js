import test from 'node:test'
import assert from 'node:assert/strict'
import {silhouetteMask,maskPath} from '../src/sets/instruction-silhouette.js'
import {normalizedCaptions,mergeCaptions} from '../src/sets/instruction-text.js'
import {rank} from '../src/sets/instruction-recognition-worker.js'
const image=(w,h)=>new Uint8ClampedArray(w*h*4).fill(255)
const paint=(p,w,x,y,rgb=[42,48,55])=>p.set([...rgb,255],(y*w+x)*4)
test('a Technic-style hole remains transparent; outline follows object rather than its box',()=>{
 const w=30,h=18,p=image(w,h)
 for(let y=4;y<14;y++)for(let x=4;x<26;x++){
  if((x-10)**2+(y-9)**2<=4||(x-20)**2+(y-9)**2<=4)continue
  paint(p,w,x,y)
 }
 const mask=silhouetteMask(p,w,h)
 assert.ok(mask)
 assert.equal(mask[9*w+10],0)
 assert.equal(mask[9*w+20],0)
 assert.equal(mask[9*w+15],1)
 assert.equal(mask[0],0)
 assert.ok(maskPath(mask,w,h).includes('M4 4h22v1h-22z'))
})
test('unreadable, fully filled and disconnected ambiguous crops have no invented silhouette',()=>{
 const w=20,h=20,p=image(w,h)
 assert.equal(silhouetteMask(p,w,h),null)
 for(let y=3;y<9;y++)for(let x=3;x<9;x++)paint(p,w,x,y)
 for(let y=11;y<17;y++)for(let x=11;x<17;x++)paint(p,w,x,y)
 assert.equal(silhouetteMask(p,w,h),null)
 assert.equal(silhouetteMask(new Uint8Array(4),w,h),null)
})
test('split quantity labels recover on the same baseline without inventing element digits',()=>{
 const vector=[{text:'2',box:[10,10,14,18]},{text:'×',box:[15,10,19,18]},{text:'3',box:[22,30,26,38]},{text:'x',box:[27,10,31,18]},{text:'666 1842',box:[50,40,90,48]}]
 const got=normalizedCaptions(vector)
 assert.deepEqual(got.map(w=>w.text),['2x','6661842'])
 const merged=mergeCaptions(vector,[{text:'7x',box:[10,10,19,18]},{text:'4 ×',box:[100,10,110,18]}])
 assert.deepEqual(merged.map(w=>w.text),['2x','6661842','4x'])
 assert.equal(normalizedCaptions([{text:'12345',box:[0,0,10,5]}]).length,0)
})
test('duplicate element IDs for the same part/color do not create false ambiguity; similar different parts remain unassigned',()=>{
 const p=image(24,24)
 for(let y=4;y<20;y++)for(let x=4;x<20;x++)paint(p,24,x,y)
 const region=[100,200,300,400],sample={region,pixels:p,aspect:0,embedded:true}
 const ref=(item,pixels=p)=>({item,pixels,aspect:0,embedded:true})
 const alternatives=[ref(['32316','72','1234567']),ref(['32316','72','7654321'])]
 assert.equal(rank({samples:[sample],templates:alternatives}).length,1)
 assert.deepEqual(rank({samples:[sample],templates:[...alternatives,ref(['32523','72','9999999'])]}),[])
 assert.deepEqual(rank({samples:[{region,item:['32316','72','1234567']}],templates:[]}),[[...region,'32316','72','1234567']])
})
