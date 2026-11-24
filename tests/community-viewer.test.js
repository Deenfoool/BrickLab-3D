import {test} from 'node:test'
import assert from 'node:assert/strict'
import {viewerFitDistance} from '../src/menu/community-viewer-math.js'
import {previewDocument} from '../src/menu/community-gallery.js'
test('camera fits bounding sphere in landscape and portrait',()=>{
 const wide=viewerFitDistance(10,42,16/9),narrow=viewerFitDistance(10,42,9/16)
 assert.ok(narrow>wide)
 for(const a of [16/9,9/16,1,.1]){
  const d=viewerFitDistance(10,42,a),vertical=21*Math.PI/180,horizontal=Math.atan(Math.tan(vertical)*a)
  assert.ok(Math.asin(10/d)<Math.min(vertical,horizontal))
 }
 assert.throws(()=>viewerFitDistance(10,42,0),RangeError)
})
test('viewer model strips metadata and bounds part designs',()=>{
 const doc={name:'Test',parts:[{design:'3001',id:'private',position:[1,2,3],rotation:[0,0,0,1],color:'#00ff00'}],connections:[],buildingSet:{url:'https://example.invalid'}}
 const safe=previewDocument(doc)
 assert.equal(safe.parts[0].id,'preview-0');assert.equal(safe.buildingSet,undefined)
 assert.equal(previewDocument({parts:Array.from({length:121},(_,i)=>({design:String(i)}))}),null)
 assert.equal(previewDocument({parts:[{design:'../file'}]}),null)
})
