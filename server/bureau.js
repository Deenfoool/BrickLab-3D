import {createHash} from 'node:crypto'
import {ProjectError,validateDocument,maxBody} from './projects.js'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const roles=['editor','viewer']
async function body(req){
 if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required')
 let size=0;const chunks=[]
 for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>maxBody){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(chunk)}
 try{const d=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!d||typeof d!=='object'||Array.isArray(d))throw Error();return d}catch{throw new ProjectError(400,'invalid_json')}
}
export function bureauName(value){if(typeof value!=='string'||!value.trim()||value.length>80||/[\u0000-\u001f\u007f]/.test(value)||/[\ud800-\udfff]/u.test(value))throw new ProjectError(400,'invalid_bureau');return value.trim()}
export function createBureauHandler({store,origin,enabled=false,logger=console}){
 const cookie=new URL(origin).protocol==='https:'?'__Host-bricklab_session':'bricklab_session'
 let active=0
 function reply(res,status,data){const b=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(b)});res.end(b)}
 return async(req,res,path)=>{
  if(path!=='/api/bureaus'&&!path.startsWith('/api/bureaus/'))return false
  try{
   if(!enabled)throw new ProjectError(503,'bureau_disabled')
   if(active>=8)throw new ProjectError(429,'too_many_attempts')
   active++
   try{
    const method=req.method
    if(method!=='GET'&&req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
    const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1)
    const user=/^[a-f0-9]{64}$/.test(token||'')&&await store.getSession(createHash('sha256').update(token).digest('hex'))
    if(!user)throw new ProjectError(401,'unauthenticated')
    const parts=path.split('/').slice(3),[id,action,target,sub,rev]=parts
    if(!id&&parts.length===0){
     if(method==='GET')reply(res,200,{bureaus:await store.listBureaus(user.id)})
     else if(method==='POST')reply(res,201,{bureau:await store.createBureau(user.id,bureauName((await body(req)).name))})
     else throw new ProjectError(405,'method_not_allowed')
    }else if(!uuid.test(id)||parts.length>5)throw new ProjectError(404,'not_found')
    else if(parts.length===1&&method==='GET')reply(res,200,{bureau:await store.getBureau(user.id,id)})
    else if(action==='invite'&&parts.length===2&&method==='POST'){
     const d=await body(req);if(!uuid.test(d.profileId)||!roles.includes(d.role))throw new ProjectError(400,'invalid_bureau')
     await store.inviteBureau(user.id,id,d.profileId,d.role);reply(res,200,{ok:true})
    }else if(action==='respond'&&parts.length===2&&method==='POST'){
     const d=await body(req);if(typeof d.accept!=='boolean')throw new ProjectError(400,'invalid_bureau')
     await store.respondBureau(user.id,id,d.accept);reply(res,200,{ok:true})
    }else if(action==='leave'&&parts.length===2&&method==='POST'){await store.leaveBureau(user.id,id);reply(res,200,{ok:true})}
    else if(action==='members'&&parts.length===3&&uuid.test(target)&&['PUT','DELETE'].includes(method)){
     const role=method==='DELETE'?null:(await body(req)).role
     if(method==='PUT'&&!roles.includes(role))throw new ProjectError(400,'invalid_bureau')
     await store.manageBureauMember(user.id,id,target,role);reply(res,200,{ok:true})
    }else if(action==='projects'){
     if(parts.length===2&&method==='POST'){const d=await body(req);reply(res,201,{project:await store.createBureauProject(user.id,id,validateDocument(d.document),user.displayName)})}
     else if(!uuid.test(target))throw new ProjectError(404,'not_found')
     else if(parts.length===3&&method==='GET')reply(res,200,{project:await store.getBureauProject(user.id,id,target)})
     else if(parts.length===3&&method==='PUT'){
      const d=await body(req);if(!Number.isInteger(d.expectedRevision)||d.expectedRevision<1||d.expectedRevision>50)throw new ProjectError(400,'invalid_revision')
      reply(res,200,{project:await store.saveBureauProject(user.id,id,target,d.expectedRevision,validateDocument(d.document),user.displayName)})
     }else if(sub==='revisions'&&method==='GET'&&parts.length===4)reply(res,200,{revisions:await store.listBureauRevisions(user.id,id,target)})
     else if(sub==='revisions'&&method==='GET'&&parts.length===5&&/^[1-9]\d?$/.test(rev)&&Number(rev)<=50)reply(res,200,{project:await store.getBureauProject(user.id,id,target,Number(rev))})
     else throw new ProjectError(404,'not_found')
    }else throw new ProjectError(404,'not_found')
   }finally{active--}
  }catch(e){if(e instanceof ProjectError)reply(res,e.status,{error:e.message,...e.details});else{logger.error('Bureau operation failed:',e.code||e.name);reply(res,503,{error:'bureau_unavailable'})}}
  return true
 }
}
