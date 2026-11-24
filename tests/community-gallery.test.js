import {test} from 'node:test'
import assert from 'node:assert/strict'
import {galleryQuery,validatePublication} from '../server/community.js'
import {communityRoute,previewDocument,openPublishedCopy} from '../src/menu/community-gallery.js'
test('gallery input is bounded and allowlisted',()=>{
 assert.deepEqual(galleryQuery('/api/community/builds?q=car&category=vehicles&sort=parts&offset=24'),{author:null,q:'car',category:'vehicles',sort:'parts',offset:24,limit:25})
 for(const q of ['sort=bad','offset=-1','category=bad','offset=10001','author=no'])assert.throws(()=>galleryQuery('/api/community/builds?'+q),{message:'invalid_gallery_query'})
 assert.equal(validatePublication({revision:1,description:'',consent:true,category:'robots'}).category,'robots')
})
test('community routes only accept public UUIDs and previews discard nongeometry fields',()=>{
 assert.deepEqual(communityRoute('community'),{type:'list'})
 assert.equal(communityRoute('community/build/no').type,'missing')
 const doc={name:'Example',parts:[{design:'3001',id:'private',position:[1,2,3],rotation:[0,0,0,1],color:'#ff0000',extra:'secret'}],connections:[{}],buildingSet:{url:'https://example.invalid'}}
 const p=previewDocument(doc);assert.equal(p.parts[0].design,'3001');assert.equal(p.parts[0].id,'preview-0');assert.equal(p.parts[0].extra,undefined);assert.equal(p.buildingSet,undefined);assert.deepEqual(p.connections,[])
 assert.equal(previewDocument({parts:Array(601).fill({design:'3001'})}).parts.length,601)
 assert.equal(previewDocument({parts:Array(20001).fill({design:'3001'})}),null)
})

test('opening publication directly creates a copy from the published download',async()=>{
 const id='20f6ed90-910f-4968-a2a3-f441a9a6e026',controller=new AbortController()
 const doc={format:'bricklab-3d',version:1,name:'Build',parts:[],connections:[]}
 const opened=[]
 await openPublishedCopy(id,controller.signal,d=>opened.push(d),async(path,signal,raw)=>{
  assert.equal(path,'/community/build/'+id+'/document');assert.equal(signal,controller.signal);assert.equal(raw,true);return doc
 })
 assert.deepEqual(opened,[doc])
 await assert.rejects(openPublishedCopy('bad',controller.signal,()=>assert.fail('invalid ID'),()=>assert.fail('unexpected fetch')))
 await openPublishedCopy(id,controller.signal,()=>assert.fail('aborted navigation'),async()=>{controller.abort();return doc})
})
