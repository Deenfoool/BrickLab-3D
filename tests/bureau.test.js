
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {bureauName,createBureauHandler} from '../server/bureau.js'
import {bureauLink,profileId} from '../src/menu/bureau-client.js'
import {cloudLink} from '../src/menu/projects-client.js'
const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',uid='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',pid='cccccccc-cccc-cccc-cccc-cccccccccccc',origin='http://localhost:8081'
test('bureau links cannot be used as private project links',()=>{
 const record={cloud:{kind:'bureau',ownerId:uid,bureauId:id,id:pid,revision:1}}
 assert.equal(bureauLink(record,uid).id,pid);assert.equal(cloudLink(record,uid),null);assert.equal(bureauLink(record,id),null)
 assert.equal(profileId('https://bricklab-3d.ru/#community/profile/'+id),id)
 assert.equal(profileId('bad'),null);assert.equal(bureauName(' Team '),'Team')
 assert.throws(()=>bureauName(' '),{message:'invalid_bureau'})
})
test('bureau requests require a session and exact origin, revision is explicit',async t=>{
 const actions=[],store={getSession:async()=>({id:uid,displayName:'Builder'}),listBureaus:async u=>{assert.equal(u,uid);return []},createBureau:async(u,n)=>{actions.push([u,n]);return {id,name:n}},inviteBureau:async(...a)=>actions.push(a),saveBureauProject:async(...a)=>{actions.push(a);return {id:pid,revision:2}}}
 const handler=createBureauHandler({store,origin,enabled:true})
 const server=createServer(async(req,res)=>{if(!await handler(req,res,req.url)){res.statusCode=404;res.end()}})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r))})
 const base='http://127.0.0.1:'+server.address().port+'/api/bureaus',headers={Cookie:'bricklab_session='+'a'.repeat(64),Origin:origin,'Content-Type':'application/json'}
 assert.equal((await fetch(base)).status,401)
 assert.equal((await fetch(base,{headers})).status,200)
 assert.equal((await fetch(base,{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body:'{"name":"Team"}'})).status,403)
 assert.equal((await fetch(base,{method:'POST',headers,body:'{"name":"Team"}'})).status,201)
 assert.equal((await fetch(base+'/'+id+'/invite',{method:'POST',headers,body:JSON.stringify({profileId:pid,role:'owner'})})).status,400)
 assert.equal((await fetch(base+'/'+id+'/invite',{method:'POST',headers,body:JSON.stringify({profileId:pid,role:'viewer'})})).status,200)
 const document={format:'bricklab-3d',version:1,name:'Shared',parts:[],connections:[]}
 assert.equal((await fetch(base+'/'+id+'/projects/'+pid,{method:'PUT',headers,body:JSON.stringify({document})})).status,400)
 assert.equal((await fetch(base+'/'+id+'/projects/'+pid,{method:'PUT',headers,body:JSON.stringify({document,expectedRevision:1})})).status,200)
 assert.deepEqual(actions,[[uid,'Team'],[uid,id,pid,'viewer'],[uid,id,pid,1,document,'Builder']])
})
