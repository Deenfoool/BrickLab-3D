import {createHash} from 'node:crypto'
import {ProjectError} from './projects.js'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validatePublicCard(value){
 const clean=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s)&&!/[\ud800-\udfff]/u.test(s)
 if(!value||!clean(value.displayName,80)||!value.displayName.trim()||!clean(value.bio,500))throw new ProjectError(400,'invalid_public_profile')
 return {displayName:value.displayName.trim(),bio:value.bio.trim()}
}
export function publicCard(row){
 return row?{id:row.id,displayName:row.displayName,bio:row.bio,updatedAt:row.updatedAt}:null
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function communityPage(cards,detail=false){
 const list=cards.map(c=>'<article><h2>'+ (detail?esc(c.displayName):'<a href="/community/profile/'+esc(c.id)+'">'+esc(c.displayName)+'</a>')+'</h2><p>'+esc(c.bio)+'</p></article>').join('')
 return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BrickLab Community</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#eee;background:#191b1e;margin:0}main{max-width:880px;padding:28px;margin:auto}nav{display:flex;gap:18px;flex-wrap:wrap}a{color:#ffc56b}article{background:#24262c;border:1px solid #444851;padding:20px;margin:12px 0;border-radius:12px;overflow-wrap:anywhere}p{white-space:pre-wrap}h2{margin:0}</style><main><nav><a href="/">BrickLab 3D</a><a href="/community">Сообщество / Community</a></nav><h1>'+(detail?'Профиль конструктора / Builder profile':'BrickLab Community')+'</h1>'+ (list||'<p>Пока нет опубликованных профилей / No published profiles yet.</p>')+'</main></html>'
}
export function createCommunityHandler({store,origin,enabled=false,logger=console}){
 const cookieName=new URL(origin).protocol==='https:'?'__Host-bricklab_session':'bricklab_session'
 let active=0
 function reply(res,status,data,type='application/json; charset=utf-8'){
  const b=type.startsWith('application/json')?JSON.stringify(data):data
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','Content-Length':Buffer.byteLength(b),'X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});res.end(b)
 }
 return async(req,res,path)=>{
  if(path!=='/community'&&!path.startsWith('/community/')&&path!=='/api/community'&&!path.startsWith('/api/community/'))return false
  try{
   if(!enabled)throw new ProjectError(503,'community_disabled')
   if(active>=8)throw new ProjectError(429,'too_many_attempts')
   active++
   try{
    if(path==='/api/community/me'){
     if(!['GET','PUT','DELETE'].includes(req.method))throw new ProjectError(405,'method_not_allowed')
     if(req.method!=='GET'&&req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
     const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)
     const user=/^[a-f0-9]{64}$/.test(token||'')&&await store.getSession(createHash('sha256').update(token).digest('hex'))
     if(!user)throw new ProjectError(401,'unauthenticated')
     if(req.method==='PUT'){
      if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required')
      let size=0;const chunks=[]
      for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>4096){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(chunk)}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ProjectError(400,'invalid_json')}
      await store.publishCard(user.id,validatePublicCard(data))
     }else if(req.method==='DELETE')await store.unpublishCard(user.id)
     reply(res,200,{profile:publicCard(await store.getOwnCard(user.id))});return true
    }
    if(req.method!=='GET')throw new ProjectError(405,'method_not_allowed')
    const m=/^\/(api\/)?community\/profile\/([^/]+)$/.exec(path)
    if(m&&uuid.test(m[2])){
     const card=publicCard(await store.getPublicCard(m[2]))
     if(!card)throw new ProjectError(404,'not_found')
     if(m[1])reply(res,200,{profile:card})
     else reply(res,200,communityPage([card],true),'text/html; charset=utf-8')
    }else if(path==='/community'||path==='/api/community'){
     const cards=(await store.listPublicCards()).map(publicCard)
     if(path.startsWith('/api/'))reply(res,200,{profiles:cards})
     else reply(res,200,communityPage(cards),'text/html; charset=utf-8')
    }else throw new ProjectError(404,'not_found')
   }finally{active--}
  }catch(e){if(e instanceof ProjectError)reply(res,e.status,{error:e.message});else{logger.error('Community operation failed:',e.code||e.name);reply(res,503,{error:'community_unavailable'})}}
  return true
 }
}
