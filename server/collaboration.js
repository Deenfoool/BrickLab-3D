import {createHash,randomBytes} from 'node:crypto'
import {ProjectError,validateDocument,maxBody} from './projects.js'
import {mergeShared,validateShared} from '../src/editor/shared-document.js'
const hex=n=>randomBytes(n).toString('hex'),tokenPattern=/^[a-f0-9]{32}$/
const lifetime=8*3600000,idle=60*60000,presence=8000
export function createCollaborationHandler({store,origin,clock=Date.now}){
 const rooms=new Map(),cookieName=new URL(origin).protocol==='https:'?'__Host-bricklab_session':'bricklab_session'
 let active=0
 const reply=(res,status,data)=>{const value=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(value)});res.end(value)}
 async function read(req){if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required');let size=0;const chunks=[];for await(const c of req.iterator({destroyOnReturn:false})){size+=c.length;if(size>maxBody){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(c)}try{const d=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!d||typeof d!=='object'||Array.isArray(d))throw Error();return d}catch{throw new ProjectError(400,'invalid_json')}}
 function clean(now){for(const [id,r] of rooms)if(now-r.created>lifetime||now-r.touched>idle)rooms.delete(id)}
 function view(room,user,client,now,doc=true){return {roomId:room.id,code:room.code,owner:room.owner===user.id,revision:room.revision,...(doc?{document:room.document}:{}),participants:[...room.clients.values()].filter(p=>now-p.last<presence).map(p=>({client:p.client,name:p.name,cursor:p.cursor,self:p.client===client,owner:p.userId===room.owner}))}}
 function touch(room,user,client,data,now){
  for(const [id,p] of room.clients)if(now-p.last>presence)room.clients.delete(id)
  const current=room.clients.get(client)
  if(current&&current.userId!==user.id)throw new ProjectError(403,'not_member')
  if(!current&&room.clients.size>=8)throw new ProjectError(409,'room_full')
  if(current&&now-current.last<250)throw new ProjectError(429,'too_many_attempts')
  const cursor=Array.isArray(data.cursor)&&data.cursor.length===3&&data.cursor.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<1e7)?data.cursor:null
  room.clients.set(client,{userId:user.id,client,name:String(user.displayName??'Builder').slice(0,80),cursor,last:now});room.touched=now
 }
 return async(req,res,path)=>{
  if(!path.startsWith('/api/collaboration/'))return false
  if(active>=32){reply(res,429,{error:'too_many_attempts'});return true}active++
  try{
   if(req.method!=='POST')throw new ProjectError(405,'method_not_allowed')
   if(req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
   const cookie=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)
   const user=/^[a-f0-9]{64}$/.test(cookie??'')&&await store.getSession(createHash('sha256').update(cookie).digest('hex'))
   if(!user)throw new ProjectError(401,'unauthenticated')
   const data=await read(req),now=clock();clean(now)
   if(!tokenPattern.test(data.client??''))throw new ProjectError(400,'invalid_client')
   const action=path.slice('/api/collaboration/'.length),client=data.client
   let room
   if(action==='create'){
    if(rooms.size>=12||[...rooms.values()].some(r=>r.owner===user.id))throw new ProjectError(409,'room_limit')
    const document=validateShared(validateDocument(data.document))
    room={id:hex(16),code:hex(16),owner:user.id,members:new Set([user.id]),clients:new Map(),document,revision:1,created:now,touched:now}
    touch(room,user,client,data,now);rooms.set(room.id,room);reply(res,201,view(room,user,client,now));return true
   }
   if(action==='join'){
    if(!tokenPattern.test(data.code??''))throw new ProjectError(404,'room_not_found')
    room=[...rooms.values()].find(r=>r.code===data.code)
    if(!room)throw new ProjectError(404,'room_not_found')
    if(!room.members.has(user.id)&&room.members.size>=8)throw new ProjectError(409,'room_full')
    touch(room,user,client,data,now);room.members.add(user.id);reply(res,200,view(room,user,client,now));return true
   }
   room=rooms.get(data.roomId)
   if(!room||!room.members.has(user.id))throw new ProjectError(404,'room_not_found')
   if(action==='close'){if(room.owner!==user.id)throw new ProjectError(403,'owner_required');rooms.delete(room.id);reply(res,200,{closed:true});return true}
   if(action==='leave'){if(room.clients.get(client)?.userId===user.id)room.clients.delete(client);reply(res,200,{left:true});return true}
   if(action!=='sync')throw new ProjectError(404,'not_found')
   touch(room,user,client,data,now)
   if(!Number.isSafeInteger(data.revision)||data.revision<1||data.revision>room.revision)throw new ProjectError(400,'invalid_revision')
   if(!Array.isArray(data.operations))throw new ProjectError(400,'invalid_change')
   if(data.operations.length){const next=validateDocument(mergeShared(room.document,data.operations));room.document=next;room.revision++}
   reply(res,200,view(room,user,client,now,data.revision!==room.revision))
  }catch(e){if(e instanceof ProjectError)reply(res,e.status,{error:e.message});else if(['edit_conflict','too_many_changes','invalid_change','invalid_shared_records','invalid_part'].includes(e.message))reply(res,e.message==='edit_conflict'?409:400,{error:e.message});else reply(res,503,{error:'collaboration_unavailable'})}
  finally{active--}
  return true
 }
}
