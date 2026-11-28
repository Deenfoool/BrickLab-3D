import test from 'node:test'
import assert from 'node:assert/strict'
import {modelCandidates,normalizedModelImage,modelDistance,rankModels,prepareModelReferences} from '../src/sets/instruction-model-match.js'
import {createElementRecovery} from '../src/sets/instruction-element-recovery.js'
const item=(partNum,colorId,color,extra={})=>({partNum,colorId,color,quantity:1,...extra})
const inventory=[item('32316','72','#505050'),item('32523','4','#b00020'),item('3673','72','#505050',{spare:true})]
test('model search uses complete, distinct non-spare inventory identities and has a hard candidate budget',()=>{
 const resolve=i=>({design:i.partNum})
 const candidates=modelCandidates([...inventory,inventory[0]],resolve)
 assert.deepEqual(candidates.map(i=>i.item),[['32316','72'],['32523','4']])
 assert.equal(modelCandidates(inventory,i=>i.partNum==='32523'?null:resolve(i)),null)
 assert.equal(modelCandidates(inventory,resolve,1),null)
 assert.equal(modelCandidates([...inventory,item('32316','72','#ff0000')],resolve),null)
})
test('model thumbnail trims transparent padding and preserves holes',()=>{
 const width=40,height=30,rgba=new Uint8ClampedArray(width*height*4)
 for(let y=5;y<25;y++)for(let x=5;x<35;x++){
  if(x>=17&&x<23&&y>=11&&y<19)continue
  rgba.set([40,40,40,255],(y*width+x)*4)
 }
 const view=normalizedModelImage(rgba,width,height)
 assert.ok(view)
 assert.ok(Math.abs(view.aspect-Math.log(30/20))<1e-10)
 assert.equal(view.pixels[(12*24+12)*4],255)
 assert.equal(view.pixels[0],40)
 rgba.set([40,40,40,255],0)
 assert.equal(normalizedModelImage(rgba,width,height),null)
})
function feature(color,vertical=false){
 const pixels=new Uint8ClampedArray(24*24*4).fill(255)
 for(let y=2;y<22;y++)for(let x=2;x<22;x++){
  const a=vertical?y:x,b=vertical?x:y
  if(a<5||a>18||b<8||b>15)continue
  pixels.set([...color,255],(y*24+x)*4)
 }
 return {pixels,aspect:vertical?-.55:.55}
}
test('rotated references identify a compatible design/color but never invent an element number',()=>{
 const horizontal=feature([60,60,60]),vertical=feature([60,60,60],true)
 const refs=[{...horizontal,item:['32316','72']},{...feature([170,30,30]),item:['32523','4']}]
 const region=[100,200,300,400],sample={...vertical,region}
 assert.equal(modelDistance(horizontal,horizontal),0)
 assert.equal(modelDistance(horizontal,refs[1]),Infinity)
 assert.deepEqual(rankModels({samples:[sample],references:refs}),[[...region,'32316','72']])
 assert.deepEqual(rankModels({samples:[sample],prepared:prepareModelReferences(refs)}),[[...region,'32316','72']])
 assert.deepEqual(rankModels({samples:[sample],references:[...refs,{...horizontal,item:['other','72']}]}),[])
 assert.deepEqual(rankModels({samples:[sample],references:[refs[0]]}),[])
 assert.deepEqual(rankModels({samples:[{...sample,item:['exact','72','1234567']}],references:refs}),[])
})
test('element recovery requires an exact local index ID and matching inventory color',async()=>{
 const records={
  '1234567':{elementId:'1234567',partNum:'32316',colorId:'72'},
  '1234568':{elementId:'1234568',partNum:'32316',colorId:'4'},
  '1234569':{elementId:'1234569',partNum:'other',colorId:'72'},
  '1234570':{elementId:'1234567',partNum:'32316',colorId:'72'},
  '1234571':{elementId:'1234571',partNum:'32523',colorId:'4'},
 }
 const called=[]
 const recover=createElementRecovery(inventory,async id=>{called.push(id);return records[id]})
 const labels=Object.create(null),blocked=new Set(['1234571']),signal=new AbortController().signal
 const words=Object.keys(records).map(text=>({text}))
 await recover(words,labels,blocked,signal)
 assert.deepEqual({...labels},{'1234567':['32316','72']})
 await recover(words,labels,blocked,signal)
 assert.equal(called.length,4)
 assert.ok(!called.includes('1234571'))
 const controller=new AbortController();controller.abort()
 await assert.rejects(recover([{text:'9999999'}],labels,blocked,controller.signal),{name:'AbortError'})
})
