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

test('layout-only PATCH validates widths, authorizes session and never changes visibility or identity',async t=>{
 const {defaultPortfolio}=await import('../src/menu/portfolio-model.js')
 const basePortfolio=defaultPortfolio({publicByDefault:true});let p={id,displayName:'Builder',bio:'Private bio',visible:false,unified:true,portfolio:basePortfolio,publicIds:[]},calls=[]
 const store={getSession:async()=>({id:uid}),getOwnCard:async()=>p,savePortfolio:async(u,portfolio)=>{calls.push([u,portfolio]);p={...p,portfolio}}}
 const handler=createCommunityHandler({store,origin,enabled:true}),server=createServer(async(req,res)=>{if(!await handler(req,res,req.url)){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 const url='http://127.0.0.1:'+server.address().port+'/api/community/me',headers={Cookie:'bricklab_session='+'a'.repeat(64),Origin:origin,'Content-Type':'application/json'}
 const patch=(body,h=headers)=>fetch(url,{method:'PATCH',headers:h,body:JSON.stringify(body)})
 const portfolio={...basePortfolio,blocks:basePortfolio.blocks.map(b=>({...b,span:6}))}
 assert.equal((await patch({portfolio},{Origin:origin,'Content-Type':'application/json'})).status,401)
 assert.equal((await patch({portfolio},{...headers,Origin:'https://evil.example'})).status,403)
 assert.equal((await patch({portfolio:{...portfolio,blocks:portfolio.blocks.map(b=>({...b,span:99}))}})).status,400)
 const response=await patch({portfolio,visible:true,displayName:'Overwrite',bio:'Overwrite',userId:'other'})
 assert.equal(response.status,200);const result=(await response.json()).profile
 assert.equal(result.visible,false);assert.equal(result.displayName,'Builder');assert.equal(result.bio,'Private bio')
 assert.deepEqual(result.portfolio,portfolio);assert.deepEqual(calls,[[uid,portfolio]])
})

test('live layout PATCH rejects overlaps and untrusted award IDs, forwards only validated geometry and selected awards',async t=>{
 const {defaultPortfolio}=await import('../src/menu/portfolio-model.js'),{toLiveBlocks}=await import('../src/menu/workshop-live-model.js')
 const base=defaultPortfolio({publicByDefault:true}),portfolio={...base,blocks:toLiveBlocks(base.blocks)},calls=[]
 const store={getSession:async()=>({id:uid}),getOwnCard:async()=>({id,displayName:'Builder',bio:'',visible:false,unified:true,portfolio,publicIds:[]}),savePortfolio:async(...a)=>calls.push(a)}
 const handler=createCommunityHandler({store,origin,enabled:true}),server=createServer(async(req,res)=>{if(!await handler(req,res,req.url)){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 const url='http://127.0.0.1:'+server.address().port+'/api/community/me',headers={Cookie:'bricklab_session='+'a'.repeat(64),Origin:origin,'Content-Type':'application/json'},patch=body=>fetch(url,{method:'PATCH',headers,body:JSON.stringify(body)})
 assert.equal((await patch({portfolio:{...portfolio,blocks:portfolio.blocks.map(b=>({...b,rect:{x:0,y:0,w:6,h:2}}))},layoutOnly:true})).status,400)
 assert.equal((await patch({portfolio,showcase:['unknown-award'],layoutOnly:true})).status,400)
 assert.equal((await patch({portfolio,showcase:['firstCloudSave','firstCloudSave'],layoutOnly:true})).status,400)
 const response=await patch({portfolio,layoutOnly:true,showcase:['firstCloudSave'],visible:true,userId:'other'})
 assert.equal(response.status,200);assert.equal((await response.json()).profile.visible,false)
 assert.deepEqual(calls,[[uid,portfolio,['firstCloudSave'],true]])
})
test('public award dates are projected only for selected visible medals',async()=>{
 const {defaultPortfolio}=await import('../src/menu/portfolio-model.js'),portfolio=defaultPortfolio({publicByDefault:true})
 const row={id,displayName:'Builder',bio:'',unified:true,portfolio,publicIds:[],achievementShowcase:['firstCloudSave'],achievementDetails:{xp:30,style:null,definitions:[],dates:{firstCloudSave:'2026-11-27T00:00:00Z',privateAward:'2026-11-01T00:00:00Z'}}}
 assert.deepEqual(publicCard(row).achievementDates,{firstCloudSave:'2026-11-27T00:00:00Z'})
 portfolio.blocks.find(b=>b.key==='awards').visible=false;assert.equal(publicCard(row).achievementDates,undefined)
 assert.equal(publicCard({...row,visible:false}),null)
})
