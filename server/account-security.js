import {validateAchievement} from './achievement-rules.js'
import {achievementById} from '../src/menu/achievement-catalog.js'
import {randomBytes,randomInt,createHash,createHmac} from 'node:crypto'
import {hashPassword} from './auth.js'
import {ProjectError} from './projects.js'
const digest=s=>createHash('sha256').update(s).digest('hex')
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const adminActions=['block','unblock','revoke_sessions','hide_comment','dismiss_reports','dismiss_build_reports','unpublish_build','unpublish_profile','confirm_bug','grant_achievement']
function emailOf(value){
 const email=typeof value==='string'?value.trim().toLowerCase():''
 if(!/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/.test(email)||email.length>254||/[\ud800-\udfff]/u.test(email))throw new ProjectError(400,'invalid_credentials')
 return email
}
async function body(req){
 if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required')
 let size=0;const chunks=[]
 for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>8192){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(chunk)}
 try{const d=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!d||typeof d!=='object'||Array.isArray(d))throw Error();return d}catch{throw new ProjectError(400,'invalid_json')}
}
export function createAccountSecurityHandler({store,origin,registrationEnabled=false,mail=null,codeSecret=randomBytes(32),logger=console}){
 const secure=new URL(origin).protocol==='https:',cookie=secure?'__Host-bricklab_session':'bricklab_session'
 const attempts=new Map();let active=0
 const hashCode=(email,purpose,code)=>createHmac('sha256',codeSecret).update('bricklab-account-code-v2\0'+purpose+'\0'+email+'\0'+code).digest('hex')
 function throttle(key,limit,ms){
  const now=Date.now(),old=attempts.get(key)
  if(old&&old.until>now){if(old.count>=limit)throw new ProjectError(429,'too_many_attempts');old.count++;return}
  if(attempts.size>=10000){for(const [k,v] of attempts)if(v.until<=now)attempts.delete(k);if(attempts.size>=10000)throw new ProjectError(429,'too_many_attempts')}
  attempts.set(key,{count:1,until:now+ms})
 }
 function reply(res,status,data){const b=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(b)});res.end(b)}
 function sessionHash(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1);return /^[a-f0-9]{64}$/.test(token||'')?digest(token):null}
 return async(req,res,path)=>{
  const admin=path==='/api/admin'||path.startsWith('/api/admin/'),config=path==='/api/auth/config',revoke=path==='/api/auth/revoke-others',bug=path==='/api/feedback/summary'
  const mailRoute=['/api/auth/register','/api/auth/verify','/api/auth/reset-request','/api/auth/reset-confirm'].includes(path)&&(secure||path!=='/api/auth/register')
  if(!admin&&!config&&!revoke&&!mailRoute&&!bug)return false
  try{
   if(config){if(req.method!=='GET')throw new ProjectError(405,'method_not_allowed');reply(res,200,{registrationEnabled:registrationEnabled&&(!secure||!!mail),emailVerification:secure,resetEnabled:secure&&!!mail});return true}
   if(req.method!=='GET'&&req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
   if(active>=4)throw new ProjectError(429,'too_many_attempts')
   active++
   try{
    if(admin||revoke||bug){
     const hash=sessionHash(req),user=hash&&await store.getSession(hash)
     if(!user)throw new ProjectError(401,'unauthenticated')
     if(revoke){if(req.method!=='POST')throw new ProjectError(405,'method_not_allowed');await store.revokeOtherSessions(user.id,hash);reply(res,200,{ok:true});return true}
     if(bug){if(req.method!=='POST')throw new ProjectError(405,'method_not_allowed');throttle('bug:'+user.id,6,60000);const d=await body(req);if(typeof d.id!=='string'||!uuid.test(d.id)||typeof d.area!=='string'||!d.area.trim()||d.area.length>100||typeof d.summary!=='string'||!d.summary.trim()||d.summary.length>1500||d.consent!==true||Object.keys(d).some(k=>!['id','area','summary','consent'].includes(k))||/[\u0000\ud800-\udfff]/u.test(d.area+d.summary))throw new ProjectError(400,'invalid_bug_report');if(!await store.submitBug(user.id,d.id,d.area.trim(),d.summary.trim()))throw new ProjectError(429,'too_many_attempts');reply(res,202,{ok:true});return true}
     if(user.admin!==true)throw new ProjectError(403,'admin_required')
     const p=new URL(req.url,'http://localhost').searchParams,q=(p.get('q')??'').trim(),raw=p.get('offset')??'0'
     if(q.length>100||/[\u0000-\u001f\u007f]/.test(q)||!/^\d{1,5}$/.test(raw)||Number(raw)>10000)throw new ProjectError(400,'invalid_admin_action')
     const offset=Number(raw)
     if(req.method==='GET'){
      if(path==='/api/admin/achievements'){reply(res,200,{items:await store.listAchievementDefinitions()});return true}
      if(path==='/api/admin'){reply(res,200,{overview:await store.adminOverview(user.id)});return true}
      let rows
      if(path==='/api/admin/users')rows=await store.adminUsers(user.id,q,offset)
      else if(path==='/api/admin/reports')rows=await store.adminReports(user.id,offset)
      else if(path==='/api/admin/build-reports')rows=await store.adminBuildReports(user.id,offset)
      else if(path==='/api/admin/bugs')rows=await store.adminBugs(user.id,q,offset)
      else if(path==='/api/admin/audit')rows=await store.adminAudit(user.id,offset)
      else throw new ProjectError(404,'not_found')
      reply(res,200,{items:rows.slice(0,30),nextOffset:rows.length>30&&offset+30<=10000?offset+30:null});return true
     }
     if(req.method==='POST'&&path==='/api/admin/achievements'){await store.adminCreateAchievement(user.id,validateAchievement(await body(req)));reply(res,201,{ok:true});return true}
     if(req.method!=='POST'||path!=='/api/admin/action')throw new ProjectError(405,'method_not_allowed')
     const d=await body(req)
     if(!adminActions.includes(d.action)||!uuid.test(d.id)||typeof d.reason!=='string'||!d.reason.trim()||d.reason.length>500||/[\u0000-\u001f\u007f]/.test(d.reason)||/[\ud800-\udfff]/u.test(d.reason))throw new ProjectError(400,'invalid_admin_action')
     if(d.action==='grant_achievement'){const a=achievementById(d.award);if((!a&&!/^custom-[a-z0-9-]{1,39}$/.test(d.award??''))||(a&&a.metric!==null)||d.reason.trim().length>450)throw new ProjectError(400,'invalid_admin_action');await store.adminGrantAchievement(user.id,d.id,d.award,d.reason.trim())}
     else if(d.action==='confirm_bug')await store.adminConfirmBug(user.id,d.id,d.reason.trim())
     else await store.adminAction(user.id,d.action,d.id,d.reason.trim());reply(res,200,{ok:true});return true
    }
    if(req.method!=='POST')throw new ProjectError(405,'method_not_allowed')
    const purpose=path.includes('reset')?'reset':'register',finish=path.endsWith('/verify')||path.endsWith('/reset-confirm')
    if(!secure||!mail)throw new ProjectError(503,'mail_unavailable')
    if(purpose==='register'&&!registrationEnabled)throw new ProjectError(403,'registration_disabled')
    throttle('global:'+String(finish),finish?40:20,60000)
    const d=await body(req),email=emailOf(d.email)
    throttle('mail:'+email+':'+purpose+':'+String(finish),finish?10:3,15*60000)
    if(!finish){
     const code=String(randomInt(0,1000000)).padStart(6,'0'),hash=hashCode(email,purpose,code)
     if(await store.issueAccountToken(email,purpose,hash)){try{await mail({email,purpose,code})}catch(e){await store.discardAccountToken(email,purpose,hash);throw new ProjectError(503,'mail_unavailable')}}
     reply(res,202,{pending:true});return true
    }
    const password=d.password,displayName=typeof d.displayName==='string'?d.displayName.trim():'',username=displayName.toLowerCase()
    const code=typeof d.code==='string'?d.code.trim().replace(/[- ]/g,'').toLowerCase():''
    if(purpose==='register'&&(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)||username.startsWith('id_')))throw new ProjectError(400,'invalid_username')
    if(!(/^[0-9]{6}$/.test(code)||/^[0-9a-f]{48}$/.test(code))||typeof password!=='string'||password.length<12||password.length>256||password.includes('\0')||(purpose==='register'&&(!displayName||displayName.length>80||/[\u0000-\u001f\u007f]/.test(displayName)||/[\ud800-\udfff]/u.test(displayName))))throw new ProjectError(400,'invalid_credentials')
    if(!await store.finishAccountToken(email,purpose,code.length===6?hashCode(email,purpose,code):digest(code),await hashPassword(password),displayName,username))throw new ProjectError(400,'invalid_code')
    reply(res,200,{ok:true});return true
   }finally{active--}
  }catch(e){if(e instanceof ProjectError)reply(res,e.status,{error:e.message});else{logger.error('Account security operation failed:',e.code||e.name);reply(res,503,{error:'auth_unavailable'})}}
  return true
 }
}
