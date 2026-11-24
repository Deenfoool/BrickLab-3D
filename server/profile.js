import { createHash } from 'node:crypto'
import { ProjectError } from './projects.js'
export function validateProfile(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.bio!=='string'||value.bio.length>500||
  /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value.bio)||/[\ud800-\udfff]/u.test(value.bio)||
  !['blueprint','graphite','amber'].includes(value.cover))throw new ProjectError(400,'invalid_profile')
 return {bio:value.bio.trim(),cover:value.cover}
}
export function awardProgress(awards){
 const ids=new Set(awards.map(a=>a.award))
 return {xp:ids.has('firstCloudSave')?30:0,awards:awards.filter(a=>a.award==='firstCloudSave')}
}
export function createProfileHandler({store,origin,logger=console}){
 const cookieName=new URL(origin).protocol==='https:'?'__Host-bricklab_session':'bricklab_session'
 let active=0
 function reply(res,status,data){const b=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(b)});res.end(b)}
 return async(req,res,path)=>{
  if(path!=='/api/profile')return false
  try{
   if(!['GET','PUT'].includes(req.method)){res.setHeader('Allow','GET, PUT');throw new ProjectError(405,'method_not_allowed')}
   if(req.method==='PUT'&&req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
   const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)
   const user=/^[a-f0-9]{64}$/.test(token||'')&&await store.getSession(createHash('sha256').update(token).digest('hex'))
   if(!user)throw new ProjectError(401,'unauthenticated')
   if(req.method==='PUT'){
    if(active>=4)throw new ProjectError(429,'too_many_attempts')
    active++
    try{
     if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required')
     const chunks=[];let size=0
     for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>4096){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(chunk)}
     let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ProjectError(400,'invalid_json')}
     await store.saveProfile(user.id,validateProfile(data))
    }finally{active--}
   }
   const p=await store.getProfile(user.id)
   reply(res,200,{profile:{bio:p.bio,cover:p.cover},progress:awardProgress(p.awards)})
  }catch(e){if(e instanceof ProjectError)reply(res,e.status,{error:e.message});else{logger.error('Profile operation failed:',e.code||e.name);reply(res,503,{error:'profile_unavailable'})}}
  return true
 }
}
