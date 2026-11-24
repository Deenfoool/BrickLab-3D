import {test} from 'node:test'
import assert from 'node:assert/strict'
import {previewLimits,sanitizePreview,isLargePreview,groupPreviewParts,previewPose} from '../src/menu/public-preview.js'
import {publicPreview} from '../server/community.js'
import {previewDocument} from '../src/menu/community-gallery.js'
const model=(count,designs)=>({name:'Large build',parts:Array.from({length:count},(_,i)=>({id:'private-'+i,design:String(i%designs),position:[i,20,0],rotation:[0,0,0,1],color:i%2?'#ff0000':'#0000ff',mirrored:i%3===0,privateData:'secret'})),connections:[{secret:true}],buildingSet:{url:'private'}})
test('large models use the same bounded projection on server and client',()=>{
 const source=model(5000,500),safe=publicPreview(source)
 assert.equal(safe.parts.length,5000)
 assert.equal(new Set(safe.parts.map(p=>p.design)).size,500)
 assert.deepEqual(previewDocument(safe),safe)
 assert.equal(safe.parts[0].privateData,undefined);assert.equal(safe.buildingSet,undefined);assert.deepEqual(safe.connections,[])
 assert.equal(isLargePreview(safe),true)
 assert.equal(isLargePreview(sanitizePreview(model(600,120))),false)
 assert.equal(isLargePreview(sanitizePreview(model(601,1))),true)
 assert.equal(isLargePreview(sanitizePreview(model(121,121))),true)
})
test('large preview resource boundaries accept the limit and reject oversized payloads',()=>{
 const safe=sanitizePreview(model(previewLimits.parts,previewLimits.designs))
 assert.equal(safe.parts.length,previewLimits.parts)
 assert.equal(sanitizePreview(model(previewLimits.parts+1,1)),null)
 assert.equal(sanitizePreview(model(previewLimits.designs+1,previewLimits.designs+1)),null)
 assert.equal(previewDocument({parts:[{design:'../x'}]}),null)
})
test('grouping preserves every pose, color and mirror flag while batching repeated designs',()=>{
 const safe=sanitizePreview(model(10000,500)),groups=groupPreviewParts(safe.parts)
 assert.equal(groups.length,500)
 assert.equal(groups.reduce((sum,[,list])=>sum+list.length,0),10000)
 const indices=new Set()
 for(const [design,list] of groups)for(const {part,index} of list){assert.equal(part.design,design);assert.equal(part,safe.parts[index]);indices.add(index)}
 assert.equal(indices.size,10000)
 assert.deepEqual(previewPose({position:[1,2,3],rotation:[0,0,0,2]},0),{position:[1,2,3],rotation:[0,0,0,1]})
 assert.deepEqual(previewPose({},2,7),{position:[90,7,0],rotation:[1,0,0,0]})
})
