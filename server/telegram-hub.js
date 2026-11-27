import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto'
import {readFileSync} from 'node:fs'
const hash=s=>createHash('sha256').update(s).digest('hex')
export function bridgeIdentity({method,path,body,headers,key,now=Date.now()/1000}){
 const id=headers['x-bricklab-hub-id'],stamp=headers['x-bricklab-hub-time'],sig=headers['x-bricklab-hub-signature']
 if(!/^[1-9]\d{0,15}$/.test(id??'')||!Number.isSafeInteger(Number(id))||!/^\d{10}$/.test(stamp??'')||Math.abs(now-Number(stamp))>30||!/^[a-f0-9]{64}$/.test(sig??''))return null
 const expected=createHmac('sha256',key).update([method,path,id,stamp,hash(body)].join('\n')).digest()
 return timingSafeEqual(expected,Buffer.from(sig,'hex'))?id:null
}
export function createTelegramHubHandler({store,origin,keyFile='',logger=console}){
 let key=null
 if(keyFile){const raw=readFileSync(keyFile,'utf8').trim();if(!/^[a-f0-9]{64}$/.test(raw))throw Error('Invalid Hub bridge key');key=Buffer.from(raw,'hex')}
 const cookieName=new URL(origin).protocol==='https:'?'__Host-bricklab_session':'bricklab_session'
 const routes=new Map([['/api/telegram/link','GET'],['/api/telegram/code','POST'],['/api/telegram/unlink','POST'],['/api/telegram/hub','GET'],['/api/telegram/claim','POST'],['/api/telegram/preferences','POST']])
 function reply(res,status,data){const b=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(b)});res.end(b)}
 async function body(req){let size=0;const chunks=[];for await(const c of req.iterator({destroyOnReturn:false})){size+=c.length;if(size>2048){req.resume();throw Error('invalid_body')}chunks.push(c)}return Buffer.concat(chunks)}
 return async(req,res,path)=>{
  if(!routes.has(path))return false
  try{
   if(!key){reply(res,503,{error:'hub_disabled'});return true}
   if(req.method!==routes.get(path)){reply(res,405,{error:'method_not_allowed'});return true}
   if(req.url!==path){reply(res,400,{error:'invalid_path'});return true}
   if(['/api/telegram/link','/api/telegram/code','/api/telegram/unlink'].includes(path)){
    if(req.method==='POST'&&req.headers.origin!==origin){reply(res,403,{error:'invalid_origin'});return true}
    const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)
    const user=/^[a-f0-9]{64}$/.test(token||'')&&await store.getSession(hash(token))
    if(!user){reply(res,401,{error:'unauthenticated'});return true}
    if(path.endsWith('/link'))reply(res,200,await store.telegramStatus(user.id))
    else if(path.endsWith('/unlink'))reply(res,200,{ok:await store.telegramUnlink(user.id)})
    else{
     const code=randomBytes(24).toString('base64url')
     const ok=await store.telegramCode(user.id,hash(code))
     reply(res,ok?200:409,ok?{code,expiresIn:600}:{error:'link_unavailable'})
    }
    return true
   }
   const raw=req.method==='POST'?await body(req):Buffer.alloc(0)
   const id=bridgeIdentity({method:req.method,path,body:raw,headers:req.headers,key})
   if(!id){reply(res,403,{error:'unauthorized'});return true}
   if(path.endsWith('/claim')){
    const input=JSON.parse(raw.toString('utf8'))
    if(typeof input?.code!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(input.code)){reply(res,400,{error:'invalid_code'});return true}
    const ok=await store.telegramClaim(hash(input.code),id)
    reply(res,ok?200:409,ok?{ok:true}:{error:'invalid_or_used_code'});return true
   }
   const uid=await store.telegramIdentity(id)
   if(!uid){reply(res,200,{linked:false});return true}
   if(path.endsWith('/preferences')){
    const input=JSON.parse(raw.toString('utf8'))
    if(typeof input?.marketing!=='boolean'){reply(res,400,{error:'invalid_preference'});return true}
    reply(res,200,{ok:await store.telegramMarketing(uid,input.marketing)});return true
   }
   reply(res,200,{linked:true,...await store.telegramDashboard(uid)})
  }catch(e){logger.error('Telegram Hub operation failed:',e.code||e.name);reply(res,503,{error:'hub_unavailable'})}
  return true
 }
}
