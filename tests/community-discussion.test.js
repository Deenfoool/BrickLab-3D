import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createCommunityHandler,validateComment,publicReputation} from '../server/community.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',uid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',origin='http://localhost:8081'
test('comment validation and public reputation allowlist',()=>{
 assert.deepEqual(validateComment({body:' hello ',parentId:id,authorId:uid}),{body:'hello',parentId:id})
 for(const x of [{body:' '},{body:'x'.repeat(1501)},{body:'x',parentId:'bad'}])assert.throws(()=>validateComment(x),{message:'invalid_comment'})
 assert.deepEqual(publicReputation({builds:2,likes:3,downloads:1,followers:1,score:'20',userId:uid}),{builds:2,likes:3,downloads:1,followers:1,score:20})
})
test('discussion reads publicly and mutations require session and origin',async t=>{
 const actions=[],store={getSession:async()=>({id:uid}),listComments:async()=>[{id,authorId:id,author:'Builder',body:'Text',userId:uid}],addComment:async(...a)=>actions.push(a),removeComment:async(...a)=>actions.push(a),reportComment:async(...a)=>actions.push(a),leaderboard:async()=>[{id,displayName:'Builder',score:'20',userId:uid}]}
 const handler=createCommunityHandler({store,origin,enabled:true})
 const server=createServer(async(req,res)=>{if(!await handler(req,res,req.url.split('?')[0])){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 const base='http://127.0.0.1:'+server.address().port+'/api/community',thread=base+'/build/'+id+'/comments',comment=base+'/comment/'+id,headers={Cookie:'bricklab_session='+'a'.repeat(64),Origin:origin,'Content-Type':'application/json'},body=JSON.stringify({body:'hello'})
 const list=await(await fetch(thread)).json();assert.equal(list.comments[0].userId,undefined)
 assert.equal((await fetch(thread,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body})).status,401)
 assert.equal((await fetch(thread,{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body})).status,403)
 assert.equal((await fetch(thread,{method:'POST',headers,body})).status,201)
 assert.equal((await fetch(comment,{method:'DELETE',headers})).status,200)
 assert.equal((await fetch(comment+'/report',{method:'POST',headers,body:JSON.stringify({reason:'spam'})})).status,200)
 assert.deepEqual(actions,[[uid,id,{body:'hello',parentId:null}],[uid,id],[uid,id,'spam']])
 const ranking=await(await fetch(base+'/leaderboard')).json();assert.equal(ranking.profiles[0].position,1);assert.equal(ranking.profiles[0].reputation.score,20);assert.equal(ranking.profiles[0].userId,undefined)
})
