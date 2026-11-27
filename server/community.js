import {achievementById} from '../src/menu/achievement-catalog.js'
import {validatePortfolio,filterPortfolio} from '../src/menu/portfolio-model.js'
import {backgroundIds} from '../src/menu/store-themes.js'
import {createHash} from 'node:crypto'
import {ProjectError} from './projects.js'
import {normalizeImage} from './profile-media.js'
import {sanitizePreview} from '../src/menu/public-preview.js'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validatePublicCard(value){
 const clean=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\u0000-\u0008\u000b-\u001f\u007f]/.test(s)&&!/[\ud800-\udfff]/u.test(s)
 if(!value||!clean(value.displayName,80)||!value.displayName.trim()||!clean(value.bio,500))throw new ProjectError(400,'invalid_public_profile')
 const appearance={}
 for(const k of ['showAvatar','showCover','showBackground']){if(value[k]!==undefined){if(typeof value[k]!=='boolean')throw new ProjectError(400,'invalid_public_profile');appearance[k]=value[k]}}
 if(value.unified!==undefined){if(value.unified!==true||value.consent!==true||!['blueprint','graphite','amber'].includes(value.cover)||!['showAvatar','showCover','showBackground'].every(k=>typeof value[k]==='boolean'))throw new ProjectError(400,'invalid_public_profile');let portfolio;try{portfolio=validatePortfolio(value.portfolio)}catch{throw new ProjectError(400,'invalid_public_profile')}return {displayName:value.displayName.trim(),bio:value.bio.trim(),...appearance,unified:true,cover:value.cover,portfolio}}
 return {displayName:value.displayName.trim(),bio:value.bio.trim(),...appearance}
}
const profileKey=value=>typeof value==='string'&&(uuid.test(value)||/^[a-z0-9][a-z0-9_.-]{2,31}$/i.test(value)||/^id_[a-f0-9]{32}$/i.test(value))
export const buildCategories=['vehicles','mechanisms','architecture','robots','other']
export function galleryQuery(url){
 const p=new URL(url,'http://localhost').searchParams
 const q=(p.get('q')??'').trim(),category=p.get('category')??'',sort=p.get('sort')??'recent',raw=p.get('offset')??'0',author=p.get('author')??null
 if(q.length>100||/[\u0000-\u001f\u007f]/.test(q)||(category&&!buildCategories.includes(category))||!['recent','oldest','name','parts','popular'].includes(sort)||!/^\d{1,5}$/.test(raw)||Number(raw)>10000||(author!==null&&!uuid.test(author)))throw new ProjectError(400,'invalid_gallery_query')
 return {author,q,category,sort,offset:Number(raw),limit:25}
}
export function validatePublication(value){
 if(!value||!Number.isSafeInteger(value.revision)||value.revision<1||value.revision>2147483647||typeof value.description!=='string'||value.description.length>1000||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value.description)||/[\ud800-\udfff]/u.test(value.description)||value.consent!==true)throw new ProjectError(400,'invalid_publication')
 if(value.category!==undefined&&!buildCategories.includes(value.category))throw new ProjectError(400,'invalid_publication')
 const extra={}
 const invalid=()=>{throw new ProjectError(400,'invalid_publication')}
 for(const key of ['allowDownload','allowComments','allowRemix']){
  if(value[key]!==undefined){if(typeof value[key]!=='boolean')invalid();extra[key]=value[key]}
 }
 if(extra.allowRemix===true&&extra.allowDownload===false)invalid()
 if(value.allowDownload!==undefined&&value.rightsConfirmed!==true)invalid()
 if(value.difficulty!==undefined){if(!['unspecified','easy','medium','hard','expert'].includes(value.difficulty))invalid();extra.difficulty=value.difficulty}
 if(value.tags!==undefined){
  if(!Array.isArray(value.tags)||value.tags.length>8||value.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>32||/[\u0000-\u001f\u007f]/.test(t)))invalid()
  extra.tags=[...new Set(value.tags.map(t=>t.trim()))]
 }
 if(value.workType!==undefined){if(!['original','remix','instruction'].includes(value.workType))invalid();extra.workType=value.workType}
 if(value.attribution!==undefined){if(typeof value.attribution!=='string'||value.attribution.length>250||/[\u0000-\u001f\u007f]/.test(value.attribution))invalid();extra.attribution=value.attribution.trim()}
 if(value.coauthors!==undefined){if(!Array.isArray(value.coauthors)||value.coauthors.length>8||value.coauthors.some(v=>typeof v!=='string'||!profileKey(v.replace(/^@/,''))))invalid();extra.coauthors=[...new Set(value.coauthors.map(v=>v.replace(/^@/,'').toLowerCase()))]}
 if(value.images!==undefined){
  if(!Array.isArray(value.images)||value.images.length>4||value.images.some(i=>typeof i!=='string'||i.length>699120||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(i)))invalid()
  extra.images=value.images
 }
 return {revision:value.revision,description:value.description.trim(),...(value.category===undefined?{}:{category:value.category}),...extra}
}
export function publicPreview(doc){return sanitizePreview(doc)}
export function validateComment(value){
 if(!value||typeof value.body!=='string'||value.body.length>1500||!value.body.trim()||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value.body)||/[\ud800-\udfff]/u.test(value.body)||(value.parentId!=null&&!uuid.test(value.parentId)))throw new ProjectError(400,'invalid_comment')
 return {body:value.body.trim(),parentId:value.parentId??null}
}
export function publicReputation(r){
 return {builds:Number(r?.builds??0),likes:Number(r?.likes??0),downloads:Number(r?.downloads??0),followers:Number(r?.followers??0),score:Number(r?.score??0)}
}
export function publicComment(r){return {authorTheme:backgroundIds.includes(r.authorTheme)?r.authorTheme:null,id:r.id,parentId:r.parentId,parentAuthor:r.parentAuthor??null,authorId:r.authorId,author:r.author,body:r.body,createdAt:r.createdAt,avatarUrl:r.authorHasAvatar===true&&uuid.test(r.authorId)?'/api/community/profile/'+r.authorId+'/avatar':null}}
function discussionOffset(url){const raw=new URL(url,'http://localhost').searchParams.get('offset')??'0';if(!/^\d{1,5}$/.test(raw)||Number(raw)>10000)throw new ProjectError(400,'invalid_gallery_query');return Number(raw)}
async function discussionBody(req){
 if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required')
 let size=0;const chunks=[]
 for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>8192){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(chunk)}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ProjectError(400,'invalid_json')}
}
export function publicBuild(row){
 return row?{authorTheme:backgroundIds.includes(row.authorTheme)?row.authorTheme:null,id:row.id,authorId:row.authorId,...(row.authorUsername?{authorUsername:row.authorUsername}:{}),...(Array.isArray(row.coauthors)?{coauthors:row.coauthors}:{}),author:row.author,authorAvatarUrl:row.authorHasAvatar===true&&uuid.test(row.authorId)?'/api/community/profile/'+row.authorId+'/avatar':null,title:row.title,description:row.description,revision:row.revision,category:row.category??'other',partCount:row.partCount??0,likes:row.likes??0,views:row.views??0,downloads:row.downloads??0,publishedAt:row.publishedAt,allowDownload:row.allowDownload!==false,allowComments:row.allowComments!==false,allowRemix:row.allowRemix===true,difficulty:row.difficulty??'unspecified',tags:row.tags??[],workType:row.workType??'original',attribution:row.attribution??'',originId:row.originId??null,imageCount:row.imageCount??0}:null
}
export function publicCard(row,options={}){
 if(!row)return null
 const base=uuid.test(row.id)?'/api/community/profile/'+row.id:null,owner=options?.owner===true
 const portfolio=row.unified===true?filterPortfolio(row.portfolio,row.publicIds??[]):null
 const visible=key=>portfolio?.blocks.some(b=>b.key===key&&b.visible)===true
 const projected=portfolio?(owner?portfolio:{...portfolio,featured:visible('featured')?portfolio.featured:null,collections:visible('collections')?portfolio.collections:[]}):null
 return {id:row.id,...(row.username?{username:row.username}:{}),displayName:row.displayName,bio:portfolio&&!owner&&!visible('about')?'':row.bio,updatedAt:row.updatedAt,followers:row.followers??0,
  avatarUrl:base&&row.hasAvatar===true?base+'/avatar':null,coverUrl:base&&row.hasCover===true?base+'/cover':null,
  coverTheme:['blueprint','graphite','amber'].includes(row.coverTheme)?row.coverTheme:null,
  backgroundTheme:backgroundIds.includes(row.backgroundTheme)?row.backgroundTheme:null,
  ...(row.supportBadge?{supportBadge:row.supportBadge}:{}),...(row.plus===true?{plus:true}:{}),
  ...(portfolio?{unified:true,portfolio:projected,awards:visible('awards')?[...(Array.isArray(row.achievementShowcase)?row.achievementShowcase.filter(id=>achievementById(id)).slice(0,6):row.showAward===true?['firstCloudSave']:[]),...(row.firstBuilder===true?['firstBuilder']:[])]:[],...(owner?{showAvatar:row.shareAvatar===true,showCover:row.shareCover===true}:{})}:{})}
}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function communityPage(cards,detail=false,builds=[]){
 const models=builds.map(b=>'<article><h2><a href="/community/build/'+esc(b.id)+'">'+esc(b.title)+'</a></h2><p>'+esc(b.description)+'</p><p>Автор / Author: <a href="/community/profile/'+esc(b.authorId)+'">'+esc(b.author)+'</a> · v'+esc(b.revision)+'</p><a href="/community/build/'+esc(b.id)+'/download" download>Скачать / Download .bricklab</a></article>').join('')
 const list=cards.map(c=>'<article><h2>'+ (detail?esc(c.displayName):'<a href="/community/profile/'+esc(c.id)+'">'+esc(c.displayName)+'</a>')+'</h2><p>'+esc(c.bio)+'</p></article>').join('')
 return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BrickLab Community</title><style>body{font:16px/1.6 system-ui,sans-serif;color:#eee;background:#191b1e;margin:0}main{max-width:880px;padding:28px;margin:auto}nav{display:flex;gap:18px;flex-wrap:wrap}a{color:#ffc56b}article{background:#24262c;border:1px solid #444851;padding:20px;margin:12px 0;border-radius:12px;overflow-wrap:anywhere}p{white-space:pre-wrap}h2{margin:0}</style><main><nav><a href="/">BrickLab 3D</a><a href="/community">Сообщество / Community</a></nav><h1>'+(detail?'Профиль конструктора / Builder profile':'BrickLab Community')+'</h1>'+ (list||(builds.length?'':'<p>Пока нет опубликованных профилей / No published profiles yet.</p>'))+'<h2>Сборки / Builds</h2>'+ (models||'<p>Нет опубликованных сборок / No published builds.</p>')+'</main></html>'
}
export function createCommunityHandler({store,origin,enabled=false,logger=console}){
 const cookieName=new URL(origin).protocol==='https:'?'__Host-bricklab_session':'bricklab_session'
 let active=0,mediaActive=0
 async function session(req){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(token||'')?await store.getSession(createHash('sha256').update(token).digest('hex')):null}
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
    const thread=/^\/api\/community\/build\/([^/]+)\/comments$/.exec(path)
    const comment=/^\/api\/community\/comment\/([^/]+)(\/report)?$/.exec(path)
    if(path==='/api/community/leaderboard'){
      if(req.method!=='GET')throw new ProjectError(405,'method_not_allowed')
      const offset=discussionOffset(req.url),rows=await store.leaderboard(offset)
      reply(res,200,{profiles:rows.slice(0,30).map((r,i)=>({...publicCard(r),reputation:publicReputation(r),position:offset+i+1})),nextOffset:rows.length>30&&offset+30<=10000?offset+30:null});return true
    }
    if(thread&&uuid.test(thread[1])){
      if(req.method==='GET'){
        const offset=discussionOffset(req.url),rows=await store.listComments(thread[1],offset)
        reply(res,200,{comments:rows.slice(0,30).map(publicComment),nextOffset:rows.length>30&&offset+30<=10000?offset+30:null});return true
      }
      if(req.method!=='POST')throw new ProjectError(405,'method_not_allowed')
      if(req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
      const user=await session(req);if(!user)throw new ProjectError(401,'unauthenticated')
      await store.addComment(user.id,thread[1],validateComment(await discussionBody(req)))
      reply(res,201,{ok:true});return true
    }
    if(comment&&uuid.test(comment[1])){
      if(req.method!==(comment[2]?'POST':'DELETE'))throw new ProjectError(405,'method_not_allowed')
      if(req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
      const user=await session(req);if(!user)throw new ProjectError(401,'unauthenticated')
      if(comment[2]){const data=await discussionBody(req);if(!['spam','abuse','other'].includes(data?.reason))throw new ProjectError(400,'invalid_report');await store.reportComment(user.id,comment[1],data.reason)}
      else await store.removeComment(user.id,comment[1])
      reply(res,200,{ok:true});return true
    }
    const social=/^\/api\/community\/(like|follow|view|bookmark)\/([^/]+)$/.exec(path)
    if(path==='/api/community/me/social'){
      if(req.method!=='GET')throw new ProjectError(405,'method_not_allowed')
      const user=await session(req)
      reply(res,200,user?await store.socialState(user.id):{signedIn:false,ownId:null,likes:[],follows:[],bookmarks:[]});return true
    }
    if(social&&uuid.test(social[2])){
      const kind=social[1],id=social[2]
      if(!(kind==='view'?req.method==='POST':['PUT','DELETE'].includes(req.method)))throw new ProjectError(405,'method_not_allowed')
      if(req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
      const user=await session(req)
      if(!user)throw new ProjectError(401,'unauthenticated')
      if(kind==='view'){reply(res,200,await store.recordPublicEvent(user.id,id,'view'));return true}
      reply(res,200,await store.setSocial(user.id,kind,id,req.method==='PUT'));return true
    }
    const report=/^\/api\/community\/build\/([^/]+)\/report$/.exec(path)
    if(report&&uuid.test(report[1])){
      if(req.method!=='POST')throw new ProjectError(405,'method_not_allowed')
      if(req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
      const user=await session(req);if(!user)throw new ProjectError(401,'unauthenticated')
      const data=await discussionBody(req)
      if(!['spam','abuse','copyright','other'].includes(data?.reason))throw new ProjectError(400,'invalid_report')
      await store.reportBuild(user.id,report[1],data.reason);reply(res,200,{ok:true});return true
    }
    const ownBuild=/^\/api\/community\/me\/builds\/([^/]+)$/.exec(path)
    if(path==='/api/community/me/builds'||ownBuild){
     if(ownBuild?(!uuid.test(ownBuild[1])||!['PUT','DELETE'].includes(req.method)):req.method!=='GET')throw new ProjectError(405,'method_not_allowed')
     if(req.method!=='GET'&&req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
     const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)
     const user=/^[a-f0-9]{64}$/.test(token||'')&&await store.getSession(createHash('sha256').update(token).digest('hex'))
     if(!user)throw new ProjectError(401,'unauthenticated')
     if(req.method==='PUT'){
      if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required')
      let size=0;const chunks=[]
      for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>2900000){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(chunk)}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ProjectError(400,'invalid_json')}
      const input=validatePublication(data)
      if(input.images?.length){
       if(mediaActive>=2)throw new ProjectError(429,'too_many_attempts')
       mediaActive++
       try{
        const images=[]
        for(const image of input.images){const [head,encoded]=image.split(',');images.push(await normalizeImage(Buffer.from(encoded,'base64'),head.slice(5,-7),'publication'))}
        input.images=images
       }finally{mediaActive--}
      }
      await store.publishBuild(user.id,ownBuild[1],input)
     }else if(req.method==='DELETE')await store.unpublishBuild(user.id,ownBuild[1])
     reply(res,200,{builds:await store.listOwnBuilds(user.id)});return true
    }
    if(path==='/api/community/me'){
     if(!['GET','PUT','DELETE'].includes(req.method))throw new ProjectError(405,'method_not_allowed')
     if(req.method!=='GET'&&req.headers.origin!==origin)throw new ProjectError(403,'invalid_origin')
     const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)
     const user=/^[a-f0-9]{64}$/.test(token||'')&&await store.getSession(createHash('sha256').update(token).digest('hex'))
     if(!user)throw new ProjectError(401,'unauthenticated')
     if(req.method==='PUT'){
      if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new ProjectError(415,'json_required')
      let size=0;const chunks=[]
      for await(const chunk of req.iterator({destroyOnReturn:false})){size+=chunk.length;if(size>16384){req.resume();throw new ProjectError(413,'body_too_large')}chunks.push(chunk)}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{throw new ProjectError(400,'invalid_json')}
      await store.publishCard(user.id,validatePublicCard(data))
     }else if(req.method==='DELETE')await store.unpublishCard(user.id)
     const card=publicCard(await store.getOwnCard(user.id),{owner:true});if(card&&store.reputation)card.reputation=publicReputation(await store.reputation(card.id));reply(res,200,{profile:card});return true
    }
    if(req.method!=='GET')throw new ProjectError(405,'method_not_allowed')
    const image=/^\/api\/community\/build\/([^/]+)\/image\/([0-3])$/.exec(path)
    if(image&&uuid.test(image[1])){
      const bytes=await store.getBuildImage(image[1],Number(image[2]))
      if(!bytes)throw new ProjectError(404,'not_found')
      res.writeHead(200,{'Content-Type':'image/webp','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return true
    }
    const build=/^\/(api\/)?community\/build\/([^/]+)(\/(?:download|document|preview))?$/.exec(path)
    if(build&&uuid.test(build[2])){
     if(build[3]){const p=await store.getPublicBuild(build[2],true);if(!p)throw new ProjectError(404,'not_found');if(build[3]==='/preview'){const preview=publicPreview(p.document);if(!preview)throw new ProjectError(422,'preview_limit');reply(res,200,preview);return true}if(p.allowDownload===false)throw new ProjectError(403,'download_disabled');if(build[3]==='/download'){try{const user=await session(req);if(user)await store.recordPublicEvent(user.id,build[2],'download')}catch(e){logger.error('Download statistics failed:',e.code||e.name)}}res.setHeader('Content-Disposition','attachment; filename="bricklab-'+build[2]+'.bricklab"');reply(res,200,JSON.stringify({...p.document,communityOrigin:{id:build[2]}}),'application/octet-stream');return true}
     const p=publicBuild(await store.getPublicBuild(build[2]));if(!p)throw new ProjectError(404,'not_found')
     if(build[1])reply(res,200,{build:p});else {res.writeHead(302,{'Location':'/#community/build/'+p.id,'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});res.end()}return true
    }
    if(path==='/api/community/builds'){const {author,...options}=galleryQuery(req.url);const feed=new URL(req.url,'http://localhost').searchParams.get('feed');if(feed!==null){if(!['following','bookmarks'].includes(feed))throw new ProjectError(400,'invalid_gallery_query');const user=await session(req);if(!user)throw new ProjectError(401,'unauthenticated');if(feed==='following')options.followingUid=user.id;else options.bookmarkUid=user.id}const week=new URL(req.url,'http://localhost').searchParams.get('week');if(week!==null){if(week!=='1')throw new ProjectError(400,'invalid_gallery_query');options.week=true}const rows=await store.listPublicBuilds(author,options);reply(res,200,{builds:rows.slice(0,24).map(publicBuild),nextOffset:rows.length>24&&options.offset+24<=10000?options.offset+24:null});return true}
    const media=/^\/api\/community\/profile\/([^/]+)\/(avatar|cover)$/.exec(path)
    if(media&&uuid.test(media[1])){
      const image=await store.getPublicMedia(media[1],media[2])
      if(!image)throw new ProjectError(404,'not_found')
      const bytes=Buffer.isBuffer(image)?image:Buffer.from(image)
      res.writeHead(200,{'Content-Type':'image/webp','Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'})
      res.end(bytes);return true
    }
    const m=/^\/(api\/)?community\/profile\/([^/]+)$/.exec(path)
    if(m&&profileKey(m[2])){
     const card=publicCard(await store.getPublicCard(m[2].toLowerCase()))
     if(!card)throw new ProjectError(404,'not_found')
     if(m[1])reply(res,200,{profile:{...card,reputation:publicReputation(store.reputation?await store.reputation(card.id):null)}})
     else {res.writeHead(302,{'Location':'/#community/profile/'+(card.username??card.id),'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});res.end()}
    }else if(path==='/community'||path==='/api/community'){
     const q=(new URL(req.url,'http://localhost').searchParams.get('q')??'').trim();if(q.length>100||/[\u0000-\u001f\u007f]/.test(q))throw new ProjectError(400,'invalid_gallery_query');const cards=(await store.listPublicCards(q)).map(publicCard)
     if(path.startsWith('/api/'))reply(res,200,{profiles:cards})
     else {res.writeHead(302,{'Location':'/#community','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});res.end()}
    }else throw new ProjectError(404,'not_found')
   }finally{active--}
  }catch(e){if(e instanceof ProjectError)reply(res,e.status,{error:e.message});else{logger.error('Community operation failed:',e.code||e.name);reply(res,503,{error:'community_unavailable'})}}
  return true
 }
}
