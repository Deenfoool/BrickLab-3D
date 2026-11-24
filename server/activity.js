import {createHash} from 'node:crypto'
import {ProjectError} from './projects.js'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function activityRoute(path,method){
 if(path==='/api/activity')return method==='GET'?{kind:'list'}:null
 if(path==='/api/activity/read')return method==='POST'?{kind:'read'}:null
 const m=/^\/api\/activity\/favorites\/([^/]+)$/.exec(path)
 if(m&&uuid.test(m[1])&&['PUT','DELETE'].includes(method))return {kind:'favorite',id:m[1],add:method==='PUT'}
 return null
}
export function createActivityHandler({store,origin,logger=console}){
 const cookieName=new URL(origin).protocol==='https:'?'__Host-bricklab_session':'bricklab_session'
 let active=0
 const reply=(res,status,data)=>{const b=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(b)});res.end(b)}
 return async(req,res,path)=>{
  if(path!=='/api/activity'&&!path.startsWith('/api/activity/'))return false
  try{
   const route=activityRoute(path,req.method)
   if(!route)throw new ProjectError(404,'not_found')
   if(req.method!=='GET'&&req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
   const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)
   const user=/^[a-f0-9]{64}$/.test(token||'')&&await store.getSession(createHash('sha256').update(token).digest('hex'))
   if(!user)throw new ProjectError(401,'unauthenticated')
   if(active>=8)throw new ProjectError(429,'too_many_attempts')
   active++
   try{
    if(route.kind==='favorite')await store.setFavorite(user.id,route.id,route.add)
    if(route.kind==='read')await store.readAwards(user.id)
    reply(res,200,await store.getActivity(user.id))
   }finally{active--}
  }catch(e){if(e instanceof ProjectError)reply(res,e.status,{error:e.message});else{logger.error('Activity operation failed:',e.code||e.name);reply(res,503,{error:'activity_unavailable'})}}
  return true
 }
}
