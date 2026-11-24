import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createProjectsHandler,validateDocument,ProjectError} from '../server/projects.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',owner='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const doc={format:'bricklab-3d',version:1,name:'Test',parts:[],connections:[]}
test('document validation',()=>{
 assert.equal(validateDocument(doc),doc)
 for(const bad of [{...doc,name:''},{...doc,parts:null},{...doc,version:2},{...doc,name:'\\u0000'.replace('\\u0000','\0')}, {...doc,name:'\ud800'}])assert.throws(()=>validateDocument(bad),{message:'invalid_document'})
})
test('private projects route authentication, CSRF and conflict',async t=>{
 const token='a'.repeat(64),origin='http://localhost:8080'
 let saves=0
 const store={getSession:async()=>({id:owner}),listProjects:async u=>{assert.equal(u,owner);return []},createProject:async(u,d)=>{assert.equal(u,owner);assert.deepEqual(d,doc);return{id,revision:1}},saveProject:async(u,p,r,d)=>{assert.equal(u,owner);assert.equal(p,id);saves++;throw new ProjectError(409,'revision_conflict',{currentRevision:2})},getProject:async()=>{throw new ProjectError(404,'not_found')},listRevisions:async()=>[]}
 const handler=createProjectsHandler({store,origin})
 const server=createServer(async(req,res)=>{if(!await handler(req,res,req.url)){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 const base='http://127.0.0.1:'+server.address().port+'/api/projects'
 const req=(suffix='',method='GET',data,auth=true,from=origin)=>fetch(base+suffix,{method,headers:{...(auth?{Cookie:'bricklab_session='+token}:{}),Origin:from,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})})
 assert.equal((await req('','GET',null,false)).status,401)
 assert.equal((await req('','POST',{document:doc},true,'https://evil.example')).status,403)
 assert.deepEqual(await(await req()).json(),{projects:[]})
 assert.equal((await req('','POST',{document:doc})).status,201)
 assert.equal((await req('/'+id,'PUT',{document:doc})).status,400)
 const conflict=await req('/'+id,'PUT',{document:doc,expectedRevision:1})
 assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{error:'revision_conflict',currentRevision:2});assert.equal(saves,1)
 assert.equal((await req('/'+id)).status,404)
})
