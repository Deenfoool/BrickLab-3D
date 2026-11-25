import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createCommunityHandler,validatePublication,publicPreview,publicBuild,publicComment,publicCard} from '../server/community.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',uid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',origin='http://localhost:8081'
const doc={format:'bricklab-3d',version:1,name:'Private revision',parts:[{id:'private-id',design:'3001',position:[1,2,3],rotation:[0,0,0,1],color:'#ff0000',extra:'secret'}],connections:[{secret:true}],buildingSet:{url:'https://example.invalid'},privateNote:'secret'}
test('explicit options validate permissions, attribution, tags and image limits',()=>{
 const base={revision:1,description:'Model',consent:true,rightsConfirmed:true,allowDownload:false,allowComments:false,allowRemix:false,difficulty:'hard',tags:[' technic ','technic'],workType:'original'}
 const p=validatePublication(base);assert.equal(p.allowDownload,false);assert.equal(p.allowComments,false);assert.deepEqual(p.tags,['technic'])
 for(const bad of [{...base,rightsConfirmed:false},{...base,allowRemix:true},{...base,allowDownload:'false'},{...base,tags:Array(9).fill('tag')},{...base,difficulty:'unknown'},{...base,workType:'unknown'},{...base,images:['data:image/svg+xml;base64,AAAA']},{...base,images:Array(5).fill('data:image/png;base64,AAAA')}])assert.throws(()=>validatePublication(bad),{message:'invalid_publication'})
 assert.deepEqual(validatePublication({revision:1,description:'',consent:true}),{revision:1,description:''})
 const meta=publicBuild({id,allowDownload:false,allowComments:false,allowRemix:false,imageCount:2,document:doc,images:['private']})
 assert.equal(meta.allowDownload,false);assert.equal(meta.imageCount,2);assert.equal(meta.document,undefined);assert.equal(meta.images,undefined)
})
test('geometry-only projection excludes original identifiers, connections, instructions and private fields',()=>{
 const p=publicPreview(doc)
 assert.equal(p.parts[0].id,'preview-0');assert.equal(p.parts[0].extra,undefined);assert.equal(p.privateNote,undefined);assert.equal(p.buildingSet,undefined);assert.deepEqual(p.connections,[])
 assert.equal(publicPreview({...doc,parts:Array(601).fill(doc.parts[0])}).parts.length,601)
 assert.equal(publicPreview({...doc,parts:Array(20001).fill(doc.parts[0])}),null)
})
test('protected originals, public preview, social actions and image reads use separate routes',async t=>{
 let allowDownload=false;const actions=[],reports=[],events=[],feeds=[]
 const store={getSession:async()=>({id:uid}),getPublicBuild:async()=>({document:doc,allowDownload}),getBuildImage:async(k,n)=>k===id&&n===0?Buffer.from('image'):null,
 setSocial:async(...args)=>{actions.push(args);return {active:args[3],count:0}},reportBuild:async(...args)=>reports.push(args),recordPublicEvent:async(...args)=>events.push(args),listPublicBuilds:async(a,o)=>{feeds.push(o);return []}}
 const handler=createCommunityHandler({store,origin,enabled:true})
 const server=createServer(async(req,res)=>{if(!await handler(req,res,req.url.split('?')[0])){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 const base='http://127.0.0.1:'+server.address().port,api=base+'/api/community',headers={Cookie:'bricklab_session='+'a'.repeat(64),Origin:origin}
 for(const prefix of ['/community/build/','/api/community/build/'])for(const suffix of ['/download','/document'])assert.equal((await fetch(base+prefix+id+suffix,{headers})).status,403)
 const preview=await fetch(api+'/build/'+id+'/preview');assert.equal(preview.status,200);assert.equal((await preview.json()).privateNote,undefined);assert.equal(events.length,0)
 assert.equal((await fetch(api+'/build/'+id+'/image/0')).headers.get('content-type'),'image/webp')
 assert.equal((await fetch(api+'/build/'+id+'/image/4')).status,404)
 assert.equal((await fetch(api+'/bookmark/'+id,{method:'PUT',headers:{Origin:origin}})).status,401)
 assert.equal((await fetch(api+'/bookmark/'+id,{method:'PUT',headers})).status,200)
 assert.deepEqual(actions,[[uid,'bookmark',id,true]])
 assert.equal((await fetch(api+'/builds?feed=bookmarks')).status,401)
 assert.equal((await fetch(api+'/builds?feed=bookmarks',{headers})).status,200);assert.equal(feeds[0].bookmarkUid,uid)
 const report={method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({reason:'copyright'})}
 assert.equal((await fetch(api+'/build/'+id+'/report',{...report,headers:{...report.headers,Origin:'https://evil.invalid'}})).status,403)
 assert.equal((await fetch(api+'/build/'+id+'/report',report)).status,200);assert.deepEqual(reports,[[uid,id,'copyright']])
 allowDownload=true
 const original=await fetch(base+'/community/build/'+id+'/download',{headers});assert.equal(original.status,200);const data=JSON.parse(await original.text());assert.equal(data.privateNote,'secret');assert.deepEqual(data.communityOrigin,{id});assert.deepEqual(events,[[uid,id,'download']])
})

test('public signatures expose only allowlisted explicitly published theme IDs',()=>{
 for(const authorTheme of ['carbon','neon','blueprint','titanium','ember','aurora']){
  assert.equal(publicBuild({id,authorTheme}).authorTheme,authorTheme)
  assert.equal(publicComment({id,authorTheme}).authorTheme,authorTheme)
  assert.equal(publicCard({id,backgroundTheme:authorTheme}).backgroundTheme,authorTheme)
 }
 for(const authorTheme of [undefined,null,'fake','signature-neon evil']){
  assert.equal(publicBuild({id,authorTheme,background:'neon'}).authorTheme,null)
  assert.equal(publicComment({id,authorTheme,background:'neon'}).authorTheme,null)
  assert.equal(publicCard({id,backgroundTheme:authorTheme,background:'neon'}).backgroundTheme,null)
 }
})
