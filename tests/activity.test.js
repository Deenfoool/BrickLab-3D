import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {activityRoute,createActivityHandler} from '../server/activity.js'
import {createActivityClient} from '../src/menu/activity-client.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',uid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',origin='http://localhost:8080'
const data={favorites:[],events:[],notifications:[],bytes:0}
test('activity route uses only whitelisted methods and UUIDs',()=>{
 assert.deepEqual(activityRoute('/api/activity/favorites/'+id,'PUT'),{kind:'favorite',id,add:true})
 assert.equal(activityRoute('/api/activity/favorites/invalid','PUT'),null)
 assert.equal(activityRoute('/api/activity/read','GET'),null)
})
test('activity authenticated owner, origin and mutation',async t=>{
 let called=0
 const handler=createActivityHandler({origin,store:{getSession:async()=>({id:uid}),getActivity:async u=>{assert.equal(u,uid);return data},setFavorite:async(u,p,add)=>{assert.equal(u,uid);assert.equal(p,id);assert.equal(add,true);called++}}})
 const server=createServer(async(req,res)=>{if(!await handler(req,res,req.url)){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 const base='http://127.0.0.1:'+server.address().port+'/api/activity',headers={Cookie:'bricklab_session='+'a'.repeat(64),Origin:origin}
 assert.equal((await fetch(base)).status,401)
 assert.equal((await fetch(base+'/favorites/'+id,{method:'PUT',headers:{...headers,Origin:'https://evil.example'}})).status,403)
 assert.equal(called,0)
 assert.deepEqual(await(await fetch(base,{headers})).json(),data)
 assert.equal((await fetch(base+'/favorites/'+id,{method:'PUT',headers})).status,200)
 assert.equal(called,1)
})
test('client never mutates on public HTTP',async()=>{
 let calls=0
 const api=createActivityClient({location:{protocol:'http:',hostname:'example.com'},fetcher:()=>{calls++}})
 await assert.rejects(api.favorite(id,true),{code:'https_required'});assert.equal(calls,0)
})
