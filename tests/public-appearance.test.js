import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {validatePublicCard,publicCard,publicBuild,createCommunityHandler} from '../server/community.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
test('appearance choices are explicit booleans, URLs are server-owned',()=>{
 const p=validatePublicCard({displayName:'Builder',bio:'',showAvatar:true,showCover:false,showBackground:true,avatarUrl:'https://example.invalid'})
 assert.deepEqual(p,{displayName:'Builder',bio:'',showAvatar:true,showCover:false,showBackground:true})
 assert.throws(()=>validatePublicCard({displayName:'Builder',bio:'',showAvatar:'true'}),{message:'invalid_public_profile'})
 const card=publicCard({id,displayName:'Builder',bio:'',hasAvatar:true,hasCover:false,coverTheme:'amber',backgroundTheme:'first-build',email:'private',avatar_image:Buffer.from('private')})
 assert.equal(card.avatarUrl,'/api/community/profile/'+id+'/avatar');assert.equal(card.coverUrl,null);assert.equal(card.coverTheme,'amber');assert.equal(card.backgroundTheme,'first-build');assert.equal(card.email,undefined);assert.equal(card.avatar_image,undefined)
 assert.equal(publicCard({id,avatarUrl:'https://example.invalid'}).avatarUrl,null)
 assert.equal(publicBuild({authorId:id,authorHasAvatar:true}).authorAvatarUrl,card.avatarUrl)
})
test('public image API reads only public snapshots; removal returns 404',async t=>{
 let image=Buffer.from('RIFF0000WEBP')
 const handler=createCommunityHandler({enabled:true,origin:'http://localhost:8081',store:{getPublicMedia:async(k,kind)=>{assert.equal(k,id);return kind==='avatar'?image:null}}})
 const server=createServer(async(req,res)=>{if(!await handler(req,res,req.url)){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 const base='http://127.0.0.1:'+server.address().port+'/api/community/profile/'+id
 const res=await fetch(base+'/avatar');assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/webp');assert.equal(res.headers.get('cache-control'),'no-store')
 assert.deepEqual(Buffer.from(await res.arrayBuffer()),image)
 assert.equal((await fetch(base+'/cover')).status,404)
 image=null;assert.equal((await fetch(base+'/avatar')).status,404)
})
