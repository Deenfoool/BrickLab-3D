import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {validatePublicCard,publicCard,communityPage,createCommunityHandler} from '../server/community.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',uid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',origin='http://localhost:8081'
test('public data allowlist and HTML escaping',()=>{
 const p=validatePublicCard({displayName:' Builder ',bio:'<script>alert(1)</script>',email:'secret@example.invalid',userId:uid})
 assert.deepEqual(p,{displayName:'Builder',bio:'<script>alert(1)</script>'})
 const row=publicCard({id,...p,email:'secret@example.invalid',userId:uid,updatedAt:'2026-01-01'})
 assert.equal(Object.hasOwn(row,'email'),false);assert.equal(Object.hasOwn(row,'userId'),false)
 const html=communityPage([row],true);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('secret@example.invalid'))
 assert.throws(()=>validatePublicCard({displayName:'',bio:''}),{message:'invalid_public_profile'})
})
test('publication requires owner session and same origin, public reads stop after unpublish',async t=>{
 let p=null
 const store={getSession:async()=>({id:uid}),getOwnCard:async u=>{assert.equal(u,uid);return p},publishCard:async(u,v)=>{assert.equal(u,uid);p={id,...v,updatedAt:'2026-01-01'}},unpublishCard:async u=>{assert.equal(u,uid);p=null},getPublicCard:async k=>k===id?p:null,listPublicCards:async()=>p?[p]:[]}
 const handler=createCommunityHandler({store,origin,enabled:true})
 const server=createServer(async(req,res)=>{if(!await handler(req,res,req.url)){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 const base='http://127.0.0.1:'+server.address().port+'/api/community',headers={Cookie:'bricklab_session='+'a'.repeat(64),Origin:origin,'Content-Type':'application/json'},body=JSON.stringify({displayName:'Builder',bio:'Hello'})
 assert.equal((await fetch(base+'/me')).status,401)
 assert.equal((await fetch(base+'/profile/'+id)).status,404)
 assert.equal((await fetch(base+'/me',{method:'PUT',headers:{...headers,Origin:'https://evil.example'},body})).status,403)
 assert.equal((await fetch(base+'/me',{method:'PUT',headers,body})).status,200)
 assert.equal((await(await fetch(base+'/profile/'+id)).json()).profile.displayName,'Builder')
 assert.equal((await fetch(base+'/me',{method:'DELETE',headers})).status,200)
 assert.equal((await fetch(base+'/profile/'+id)).status,404)
})
