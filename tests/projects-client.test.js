import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createProjectsClient,cloudLink,mergeProjectGallery} from '../src/menu/projects-client.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',owner='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',location={protocol:'https:',hostname:'bricklab-3d.ru'}
const doc={format:'bricklab-3d',version:1,name:'Test',parts:[],connections:[]}
test('cloud links are scoped to the signed in account and revision',()=>{
 const record={cloud:{id,ownerId:owner,revision:2}}
 assert.deepEqual(cloudLink(record,owner),record.cloud)
 assert.equal(cloudLink(record,id),null)
 assert.equal(cloudLink({cloud:{...record.cloud,revision:0}},owner),null)
})
test('cloud client keeps server revision and handles conflict without retry',async()=>{
 const calls=[]
 const api=createProjectsClient({location,fetcher:async(path,options)=>{
  calls.push({path,options})
  const data=options.method==='PUT'?{error:'revision_conflict',currentRevision:3}:{project:{id,revision:2,document:doc}}
  return {ok:options.method!=='PUT',status:options.method==='PUT'?409:200,json:async()=>data}
 }})
 assert.equal((await api.create(doc)).revision,2)
 await assert.rejects(api.save(id,2,doc),{code:'revision_conflict',currentRevision:3})
 assert.equal(calls.length,2)
 assert.deepEqual(JSON.parse(calls[1].options.body),{document:doc,expectedRevision:2})
 assert.equal(calls[1].path,'/api/projects/'+id)
 assert.equal(calls[1].options.credentials,'same-origin')
 assert.equal((await api.get(id,2)).revision,2)
 assert.equal(calls[2].path,'/api/projects/'+id+'/revisions/2')
})
test('public HTTP never transmits models',async()=>{
 let called=false
 const api=createProjectsClient({location:{protocol:'http:',hostname:'example.com'},fetcher:()=>{called=true}})
 await assert.rejects(api.create(doc),{code:'https_required'})
 assert.equal(called,false)
})

test('unified gallery joins the current owner cloud head once without hiding independent local copies',()=>{
 const link={id,ownerId:owner,revision:1}
 const local=[{id:'a',cloud:link},{id:'b',cloud:link},{id:'c',cloud:{...link,ownerId:id}},{id:'d',cloud:{...link,kind:'bureau'}},{id:'e'}]
 const head={id,revision:3}
 const remoteOnly={id:owner,revision:1}
 const entries=mergeProjectGallery(local,[head,remoteOnly],owner)
 assert.equal(entries.length,6)
 assert.equal(entries[0].cloud,head)
 assert.equal(entries[0].project.cloud.revision,1)
 assert.ok(entries.slice(1,5).every(entry=>!entry.cloud))
 assert.equal(entries[5].cloud,remoteOnly)
 assert.equal(mergeProjectGallery(local,[head],undefined).length,5)
 assert.equal(cloudLink({},undefined),null)
})
test('cloud preview requests support cancellation without changing revision routes',async()=>{
 const controller=new AbortController()
 const api=createProjectsClient({location,fetcher:async(path,options)=>{
  assert.equal(path,'/api/projects/'+id)
  assert.equal(options.signal,controller.signal)
  assert.equal(options.cache,'no-store')
  return {ok:true,json:async()=>({project:{id,revision:1,document:doc}})}
 }})
 assert.equal((await api.get(id,undefined,controller.signal)).revision,1)
})
