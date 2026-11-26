import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createProjectsHandler} from '../server/projects.js'
import {sharedDelta,mergeShared} from '../src/editor/shared-document.js'
const part=(id,x=0)=>({id,design:'32316',position:[x,0,0],rotation:[0,0,0,1]})
const doc={format:'bricklab-3d',version:1,name:'Shared',parts:[part('a')],connections:[],belts:[],gears:[]}
test('concurrent independent placement and edits preserve both participants',()=>{
 const one={...doc,parts:[...doc.parts,part('b',20)]},two={...doc,parts:[...doc.parts,part('c',40)]}
 const merged=mergeShared(one,sharedDelta(doc,two))
 assert.deepEqual(merged.parts.map(p=>p.id),['a','b','c'])
 assert.deepEqual(mergeShared(merged,sharedDelta(doc,two)),merged)
 assert.throws(()=>mergeShared({...doc,parts:[part('a',20)]},sharedDelta(doc,{...doc,parts:[part('a',40)]})),/edit_conflict/)
 assert.throws(()=>mergeShared({...doc,parts:[]},sharedDelta(doc,{...doc,parts:[part('a',40)]})),/edit_conflict/)
})
test('malformed changes and references are rejected atomically',()=>{
 assert.throws(()=>mergeShared(doc,[{field:'__proto__',old:null,value:{}}]),/invalid_change/)
 assert.throws(()=>mergeShared(doc,[{field:'parts',key:'x',old:null,value:part('y')}]),/invalid_change/)
 const bad={...doc,connections:[{shaft:{part:'a',port:'x'},socket:{part:'missing',port:'y'}}]}
 assert.throws(()=>mergeShared(doc,sharedDelta(doc,bad)),/edit_conflict/)
 assert.deepEqual(doc.parts,[part('a')])
})
test('authenticated invitation, disjoint changes, privacy, and owner-only close',async t=>{
 const origin='https://bricklab.test',tokens=['a','b','c'].map(c=>c.repeat(64)),clients=['1','2','3'].map(c=>c.repeat(32))
 let now=10000;const users=new Map()
 const {createHash}=await import('node:crypto')
 tokens.forEach((token,i)=>users.set(createHash('sha256').update(token).digest('hex'),{id:String(i),displayName:'Builder '+i}))
 const store={getSession:async hash=>users.get(hash)}
 const handler=createProjectsHandler({store,origin})
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,origin).pathname))
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const base='http://127.0.0.1:'+server.address().port+'/api/collaboration/'
 const call=async(i,path,data,extra={})=>{const r=await fetch(base+path,{method:'POST',headers:{origin,'Content-Type':'application/json',cookie:'__Host-bricklab_session='+tokens[i],...extra},body:JSON.stringify({client:clients[i],...data})});return {status:r.status,body:await r.json()}}
 assert.equal((await call(0,'create',{document:doc},{origin:'https://other.test'})).status,403)
 const created=await call(0,'create',{document:doc});assert.equal(created.status,201)
 const {roomId,code}=created.body
 assert.equal((await call(2,'sync',{roomId,revision:1,operations:[]})).status,404)
 const joined=await call(1,'join',{code});assert.equal(joined.status,200);assert.equal(joined.body.participants.length,2)
 const moving=await call(0,'presence',{roomId,cursor:[1,2,3],preview:[part('a',15)]});assert.equal(moving.status,200);assert.equal(moving.body.revision,1);assert.equal(moving.body.document,undefined)
 const seeing=await call(1,'presence',{roomId,cursor:null,preview:[]});assert.equal(seeing.status,200);assert.equal(seeing.body.participants.find(p=>!p.self).preview[0].position[0],15)
 assert.equal((await call(2,'presence',{roomId,preview:[]})).status,404)
 await new Promise(r=>setTimeout(r,280))
 const first=await call(0,'sync',{roomId,revision:1,operations:sharedDelta(doc,{...doc,parts:[...doc.parts,part('b',20)]}),cursor:[1,2,3]})
 assert.equal(first.status,200)
 const second=await call(1,'sync',{roomId,revision:1,operations:sharedDelta(doc,{...doc,parts:[...doc.parts,part('c',40)]})})
 assert.equal(second.status,200);assert.equal(second.body.document.parts.length,3);assert.equal(second.body.participants.find(p=>!p.self).name,'Builder 0')
 assert.equal((await call(1,'close',{roomId})).status,403)
 assert.equal((await call(0,'close',{roomId})).status,200)
 assert.equal((await call(1,'sync',{roomId,revision:3,operations:[]})).status,404)
})
