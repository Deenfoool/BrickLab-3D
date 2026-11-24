import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {createCommunityHandler,galleryQuery,publicBuild} from '../server/community.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',uid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',origin='http://localhost:8081'
test('popularity and public counts are allowlisted',()=>{
 assert.equal(galleryQuery('/api/community/builds?sort=popular').sort,'popular')
 const b=publicBuild({id,likes:2,views:3,downloads:1,userId:uid})
 assert.deepEqual([b.likes,b.views,b.downloads],[2,3,1]);assert.equal(b.userId,undefined)
})
test('social endpoints require session and exact origin; previews do not count downloads',async t=>{
 const events=[],actions=[],feeds=[]
 const store={getSession:async()=>({id:uid}),socialState:async()=>({signedIn:true,likes:[],follows:[],ownId:null}),setSocial:async(...a)=>{actions.push(a);return {active:a[3],count:1}},recordPublicEvent:async(...a)=>{events.push(a);return {views:1,downloads:1}},getPublicBuild:async()=>({document:{name:'Test'}}),listPublicBuilds:async(a,o)=>{feeds.push(o);return []}}
 const handler=createCommunityHandler({store,origin,enabled:true})
 const server=createServer(async(req,res)=>{if(!await handler(req,res,req.url.split('?')[0])){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 const base='http://127.0.0.1:'+server.address().port,api=base+'/api/community',headers={Cookie:'bricklab_session='+'a'.repeat(64),Origin:origin}
 assert.equal((await fetch(api+'/like/'+id,{method:'PUT',headers:{Origin:origin}})).status,401)
 assert.equal((await fetch(api+'/follow/'+id,{method:'PUT',headers:{...headers,Origin:'https://evil.invalid'}})).status,403)
 assert.equal((await fetch(api+'/like/'+id,{method:'PUT',headers})).status,200)
 assert.equal((await fetch(api+'/follow/'+id,{method:'PUT',headers})).status,200)
 assert.equal((await fetch(api+'/follow/'+id,{method:'DELETE',headers})).status,200)
 assert.deepEqual(actions,[[uid,'like',id,true],[uid,'follow',id,true],[uid,'follow',id,false]])
 assert.equal((await fetch(api+'/builds?feed=following')).status,401)
 assert.equal((await fetch(api+'/builds?feed=following',{headers})).status,200);assert.equal(feeds[0].followingUid,uid)
 assert.equal((await fetch(base+'/community/build/'+id+'/document',{headers})).status,200);assert.equal(events.length,0)
 assert.equal((await fetch(base+'/community/build/'+id+'/download',{headers})).status,200)
 assert.equal((await fetch(api+'/view/'+id,{method:'POST',headers})).status,200)
 assert.deepEqual(events,[[uid,id,'download'],[uid,id,'view']])
})
